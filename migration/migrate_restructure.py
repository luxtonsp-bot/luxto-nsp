#!/usr/bin/env python3
"""
Re-estructuración de la migración: alinea los datos ya exportados con el modelo
de colecciones definido en PLAN_MIGRACION_LUXTO_NSP.md (sección 3).

Reparte los CSVs de migration/sheets_export/ hacia:

  - asambleas/{fecha}                        (hoja Configuracion: hayAsamblea, horaInicio, observacion)
  - asistencia/2026/{fecha}/{uid}            (hojas Asistencia + Log_Asistencia, timestamp preservado)
  - historico/2026/sugerencias/sug-N         (hoja Sugerencias — 2026 es histórico, sección 11.6)
  - historico/2026/feedback/fb-N             (hoja Feedback — idem)
  - tablas_dinamicas/2026/{tablaId}/row-N    (Caporales, Polladas, Votaciones, EJUTOR)
  - tablas_definiciones/{tablaId}            (columnas de cada tabla; EJUTOR marcada restringida por DNI)
  - miembros_registro/{uid} = {nombre}       (lookup público solo-nombre para registro.html)

Todo con IDs deterministas (row-N, sug-N, fb-N) para que la re-ejecución sea
idempotente: sobrescribe, no duplica.

Las colecciones planas de la PRIMERA migración (attendance, attendance_log,
config, caporales_2026, polladas_pastoral, votaciones_aniversario,
ejutor_2026_attendees, stats_dashboard) quedan solo como respaldo: ya no son
fuente de verdad.

Uso:
  python3 migration/migrate_restructure.py            # ejecutar todo
  python3 migration/migrate_restructure.py --dry-run  # solo mostrar lo que haría
"""
import csv
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("Falta firebase-admin. Instala con: pip install firebase-admin")
    sys.exit(1)

BASE = Path(__file__).parent
EXPORT = BASE / "sheets_export"
SERVICE_ACCOUNT = BASE / "firebase-service-account.json"
ANIO = "2026"

# Perfil horario del log de Sheets: hora de Lima, UTC-5 fijo (sin DST)
LIMA = timezone(timedelta(hours=-5))

# (archivo, tablaId, nombre legible, restringida por DNI)
TABLAS = [
    ("caporales_2026.csv", "caporales-2026", "Caporales 2026 — Ensayos", False),
    ("polladas_pastoral.csv", "polladas-pastoral", "Polladas Pastoral", False),
    ("votaciones_aniversario.csv", "votaciones-aniversario", "Votaciones Aniversario", False),
    ("lista_asistentes_ejutor_2026.csv", "lista-asistentes-ejutor-2026", "Lista asistentes EJUTOR 2026", True),
]

CONTADORES = {}


def contar(clave, n=1):
    CONTADORES[clave] = CONTADORES.get(clave, 0) + n
    return n


def limpiar(s):
    """Strip y normalizar strings de CSV."""
    if s is None:
        return ""
    return str(s).strip()


def norm_fecha(s):
    """Normaliza cualquier formato de fecha del Excel a 'YYYY-MM-DD' (o None)."""
    s = limpiar(s).strip('"')
    if not s:
        return None
    # fechas ya ISO (con o sin hora)
    if s[:4].isdigit() and len(s) >= 10:
        return s[:10]
    partes = s.split("/")
    # "DD/MM/YYYY, resto" (votaciones): "25/4/2026, 5:31:22 p. m."
    if len(partes) >= 3 and "," in s:
        parte = s.split(",")[0].strip()
        d, m, y = parte.split("/")
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    # "DD/MM/YYYY"
    if len(partes) == 3:
        d, m, y = partes
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    # "DD/MM" sin año (Asistencia 2026): "03/01" = 3 de enero
    if len(partes) == 2:
        d, m = partes
        return f"{ANIO}-{int(m):02d}-{int(d):02d}"
    return None


def norm_datetime(s):
    """Fecha+hora del log → datetime con zona Lima, o None."""
    s = limpiar(s).strip('"')
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=LIMA)
    except ValueError:
        pass
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M:%S.%f").replace(tzinfo=LIMA)
    except ValueError:
        pass
    # "25/4/2026, 5:31:22 p. m."
    s2 = s.replace("p. m.", "PM").replace("a. m.", "AM")
    try:
        return datetime.strptime(s2, "%d/%m/%Y, %I:%M:%S %p").replace(tzinfo=LIMA)
    except ValueError:
        return None


def norm_float(s):
    """'20.0'/'5 ⭐' → float (o None)."""
    s = limpiar(s).replace("⭐", "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def py_num(v):
    """float de CSV → int cuando es entero (Edad 18.0 → 18)."""
    if v is None:
        return None
    return int(v) if isinstance(v, float) and v == int(v) else v


def load_csv(nombre, header_row=0):
    ruta = EXPORT / nombre
    if not ruta.exists():
        print(f"  ⚠ No existe {nombre} — se omite")
        return [], []
    with open(ruta, encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        rows = list(reader)
    if not rows:
        return [], []
    headers = [h.strip() for h in rows[header_row]]
    # Desambiguar encabezados duplicados (ej. polladas: 'EFECTIVO' aparece como columna
    # de datos y otra de fórmulas; sin esto el dict pierde la columna real)
    vistos = {}
    for i, h in enumerate(headers):
        if not h:
            continue
        if h in vistos:
            vistos[h] += 1
            headers[i] = f"{h}_{vistos[h]}"
        else:
            vistos[h] = 1
    data = [dict(zip(headers, (r + [""] * len(headers))[: len(headers)])) for r in rows[header_row + 1:]]
    return headers, data


# Columnas que SIEMPRE se guardan como texto (el float destruiría datos: DNI con cero inicial)
COLS_TEXTO = ("dni", "correo", "email", "celular", "codigo", "timestamp", "id_sesion", "observacion")


def tipo_columna(col, valores):
    if any(k in col.lower() for k in COLS_TEXTO):
        return "texto"
    if norm_fecha(col):
        return "fecha"
    if valores and all(norm_float(v) is not None for v in valores):
        return "numero"
    return "texto"


def valor_seguro(col, tipo, raw):
    """Convierte el valor crudo según el tipo de columna de la tabla."""
    raw = limpiar(raw)
    if not raw or raw.startswith("="):
        return None
    if tipo == "numero":
        return py_num(norm_float(raw))
    if tipo == "fecha":
        return norm_fecha(raw) or raw
    # texto: quitar el ".0" que Google Sheets añade a números guardados como texto
    if raw.endswith(".0"):
        candidato = raw[:-2]
        if candidato.isdigit() or (candidato and norm_float(candidato) is not None):
            return candidato
    return raw


def es_formula(row_values):
    return any(v.strip().startswith("=") for v in row_values)


def main(dry_run=False):
    if not SERVICE_ACCOUNT.exists():
        print(f"Falta {SERVICE_ACCOUNT}")
        sys.exit(1)
    cred = credentials.Certificate(str(SERVICE_ACCOUNT))
    try:
        firebase_admin.initialize_app(cred)
    except ValueError:
        pass  # ya inicializada
    db = firestore.client()
    modo = "DRY-RUN" if dry_run else "ESCRITURA REAL"
    print(f"=== Re-estructuración de migración ({modo}) ===\n")

    # ── 0. Mapa nombre → uid desde los members YA migados en Firestore ──
    print("[0] Leyendo members de Firestore para mapa nombre→uid...")
    nombre_uid = {}
    for doc in db.collection("members").stream():
        name = limpiar(doc.to_dict().get("name"))
        if name:
            nombre_uid[name.lower()] = doc.id
    print(f"    {len(nombre_uid)} miembros con uid\n")

    def uid_de(nombre):
        return nombre_uid.get(limpiar(nombre).lower())

    acciones = []  # (ref, data) acumuladas para dry-run/escritura

    def agrega(ref, data):
        acciones.append((ref, data))
        return data

    # ── 1. Configuracion → asambleas/{fecha} ──
    print("[1] Configuracion → asambleas/{fecha}...")
    for row in load_csv("config.csv")[1]:
        fecha = norm_fecha(row.get("Fecha"))
        if not fecha:
            continue
        fuso = norm_float(row.get("Hay_Asamblea"))
        agrega(
            db.collection("asambleas").document(fecha),
            {
                "fecha": fecha,
                "hayAsamblea": bool(fuso and fuso >= 1),
                "horaInicio": limpiar(row.get("Hora_Inicio")) or None,
                "observacion": limpiar(row.get("Observación")) or "",
            },
        )
        contar("asambleas")

    # ── 2. Asistencia + Log_Asistencia → asistencia/2026/{fecha}/{uid} ──
    print("[2] Asistencia + Log_Asistencia → asistencia/2026/{fecha}/{uid}...")
    # Log_Asistencia: mapa (nombre, fecha) → (timestamp, tardanza)
    log_info = {}
    for row in load_csv("attendance_log.csv")[1]:
        ts = norm_datetime(row.get("Timestamp"))
        nombre = limpiar(row.get("Nombre"))
        fecha = ts.date().isoformat() if ts else norm_fecha(row.get("Timestamp"))
        if not nombre or not fecha:
            continue
        tardanza = norm_float(row.get("Tardanza (Min)"))
        tardanza = int(tardanza) if tardanza is not None else 0
        # conservar el check-in más temprano del día como horaLlegada
        anterior = log_info.get((nombre.lower(), fecha))
        if anterior is None or ts < anterior[0]:
            log_info[(nombre.lower(), fecha)] = (ts, tardanza)
    print(f"    {len(log_info)} entradas de log con timestamp")

    for row in load_csv("attendance.csv")[1]:
        nombre = limpiar(row.get("Nombre"))
        if not nombre:
            continue  # fila de encabezados T1..T4
        uid = uid_de(nombre)
        if not uid:
            print(f"    ⚠ Sin uid para '{nombre}' — fila de asistencia omitida")
            continue
        for col, valor in row.items():
            if col in ("Nombre", "Total") or not norm_fecha(col):
                continue
            celda = norm_float(valor)
            if celda is None or celda < 1:
                continue  # solo marcados presentes
            fecha = norm_fecha(col)
            ts_llegada, tardanza = log_info.get((nombre.lower(), fecha), (None, 0))
            doc = {
                "presente": True,
                "uid": uid,
                "fecha": fecha,
                "tardanzaMinutos": py_num(tardanza),
                # Tolerancia confirmada: hasta 10 min no es tardanza (sección 5.4)
                "esTardanza": bool(tardanza and tardanza > 10),
            }
            if ts_llegada:
                doc["horaLlegadaServidor"] = ts_llegada
            agrega(db.collection("asistencia").document(ANIO).collection(fecha).document(uid), doc)
            contar("asistencia/2026/{fecha}/{uid}")

    # ── 3. Sugerencias → historico/2026/sugerencias (2026 ya es histórico) ──
    print("[3] Sugerencias → historico/2026/sugerencias...")
    for i, row in enumerate(load_csv("suggestions.csv")[1], start=1):
        nombre = limpiar(row.get("Nombre"))
        texto = limpiar(row.get("Sugerencia"))
        if not nombre and not texto:
            continue
        ts = norm_datetime(row.get("Fecha_Envio"))
        data = {
            "nombre": nombre or "Anónimo",
            "email": limpiar(row.get("Email")),
            "texto": texto,
            "semana": limpiar(row.get("Semana")),
            "fechaEnvio": limpiar(row.get("Fecha_Envio")),
        }
        if ts:
            data["timestamp"] = ts
        agrega(db.collection("historico").document(ANIO).collection("sugerencias").document(f"sug-{i:04d}"), data)
        contar("historico/2026/sugerencias")

    # ── 4. Feedback → historico/2026/feedback ──
    print("[4] Feedback → historico/2026/feedback...")
    for i, row in enumerate(load_csv("feedback.csv")[1], start=1):
        nombre = limpiar(row.get("Nombre"))
        if not nombre:
            continue
        ts = norm_datetime(row.get("", "") or row.get("Unnamed: 0", ""))
        data = {
            "nombre": nombre,
            "email": limpiar(row.get("Email")),
            "calificacion": py_num(norm_float(row.get("⭐ Calificacion"))),
            "comentario": limpiar(row.get("Comentario")),
            "fechaAsamblea": norm_fecha(row.get("Fecha_Asamblea")),
            "fechaEnvio": limpiar(row.get("", "") or row.get("Unnamed: 0", "")),
        }
        if ts:
            data["timestamp"] = ts
        agrega(db.collection("historico").document(ANIO).collection("feedback").document(f"fb-{i:04d}"), data)
        contar("historico/2026/feedback")

    # ── 5. Tablas 2026 → tablas_dinamicas + tablas_definiciones ──
    print("[5] Tablas 2026 → tablas_dinamicas/{anio}/{tablaId}...")
    for archivo, tabla_id, nombre_tabla, restringida in TABLAS:
        # Caporales tiene una fila de título en la fila 0: el encabezado real es la 1
        header_row = 1 if "caporales" in archivo else 0
        headers, data_rows = load_csv(archivo, header_row=header_row)
        if not headers:
            continue
        headers = [h for h in headers if h]  # descartar columnas sin nombre

        # Tipos por columna (las de fórmulas se recalculan, no se migran)
        # Encabezados de fecha con hora ("2026-06-27 00:00:00") se normalizan a ISO;
        # se busca por clave original del CSV y se escribe con el nombre normalizado
        renombre = {h: (norm_fecha(h) or h) for h in headers}
        columnas = []
        tipo_por_col = {}
        for col in headers:
            valores = [limpiar(d.get(col)) for d in data_rows if limpiar(d.get(col))]
            if not valores or all(v.startswith("=") for v in valores):
                continue
            tipo = tipo_columna(col, valores)
            tipo_por_col[col] = tipo
            columnas.append({"nombre": renombre[col], "tipo": tipo})

        agrega(
            db.collection("tablas_definiciones").document(tabla_id),
            {
                "nombre": nombre_tabla,
                "anio": ANIO,
                "restringida": restringida,  # True = contiene DNI → solo coordinador
                "columnas": columnas,
                "origen": archivo,
            },
        )
        contar("tablas_definiciones")

        n_filas = 0
        for d in data_rows:
            doc = {}
            for col, tipo in tipo_por_col.items():
                v = valor_seguro(col, tipo, d.get(col))
                if v is not None:
                    doc[renombre[col]] = v
            if len(doc) < 2:
                continue
            row_id = f"row-{n_filas + 1:04d}"
            agrega(
                db.collection("tablas_dinamicas").document(ANIO).collection(tabla_id).document(row_id),
                doc,
            )
            n_filas += 1
            contar(f"tablas_dinamicas/2026/{tabla_id}")
        print(f"    {nombre_tabla}: {n_filas} filas, {len(columnas)} columnas (restringida={restringida})")

    # ── 6. miembros_registro/{uid} = {nombre} (lookup público para registro.html) ──
    print("[6] members → miembros_registro/{uid} (solo nombre, lookup de registro)...")
    for nombre, uid in nombre_uid.items():
        agrega(
            db.collection("miembros_registro").document(uid),
            {"nombre": nombre.title()},
        )
        contar("miembros_registro")

    # ── Ejecutar ──
    print(f"\nTotal de documentos a escribir: {len(acciones)}")
    for clave in sorted(CONTADORES):
        print(f"  {clave}: {CONTADORES[clave]}")
    if dry_run:
        print("\nDRY-RUN: no se escribió nada en Firestore.")
        return

    print("\nEscribiendo en Firestore por lotes...")
    batch = db.batch()
    for i, (ref, data) in enumerate(acciones, start=1):
        batch.set(ref, data)
        if i % 450 == 0:
            batch.commit()
            batch = db.batch()
            print(f"  ... {i} escritos")
    batch.commit()
    print(f"✓ Listo: {len(acciones)} documentos escritos en Firestore.")

    print("\n=== Resumen ===")
    for clave in sorted(CONTADORES):
        print(f"  {clave}: {CONTADORES[clave]}")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
