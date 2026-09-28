#!/usr/bin/env python3
"""
Sincronización quirúrgica Excel → Firestore (backend real).
Preserva: rol, uid, subcolecciones, campos internos.
Solo actualiza: nombre, email, fechaNacimiento, fechaNacimientoMMdd, fotoThumb, fotoDriveId.
"""
import openpyxl
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

cred = credentials.Certificate('firebase-service-account.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

EXCEL_PATH = 'Asistencia_Parroquial_DataScience_2026.xlsx'

def normalize_name(n):
    return str(n).strip().upper() if n else ''

def parse_fecha(val):
    """Devuelve (fecha_str_YYYY_MM_DD, fecha_mmdd) o ('', '')"""
    if not val:
        return '', ''
    if isinstance(val, datetime):
        return val.strftime('%Y-%m-%d'), val.strftime('%m-%d')
    if isinstance(val, str):
        # Intentar parsear DD/MM/YYYY o YYYY-MM-DD
        for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y'):
            try:
                dt = datetime.strptime(val[:10], fmt)
                return dt.strftime('%Y-%m-%d'), dt.strftime('%m-%d')
            except:
                pass
    return str(val), ''

# ──────────────────────────────────────────────────────────────
# 1. MIEMBROS — Hoja "Lista de cumpleaños"
# ──────────────────────────────────────────────────────────────
def sync_members(wb):
    print('\n=== MIEMBROS ===')
    ws = wb['Lista de cumpleaños']

    # Leer Excel: uid -> datos
    excel_data = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        nombre = str(row[0]).strip()
        fecha_raw = row[1]
        email = str(row[2]).strip() if row[2] else ''
        codigo_foto = row[3]
        uid = str(row[4]).strip() if row[4] else None

        if not uid or len(uid) != 28:
            print(f'  ⚠️ UID inválido/faltante para {nombre}: {uid}')
            continue

        fecha_str, fecha_mmdd = parse_fecha(fecha_raw)

        # fotoThumb / fotoDriveId
        foto_thumb = ''
        foto_drive_id = ''
        if codigo_foto:
            cf = str(codigo_foto).strip()
            if cf.startswith('http'):
                foto_thumb = cf
                # Extraer ID de drive
                if 'id=' in cf:
                    foto_drive_id = cf.split('id=')[1].split('&')[0]
            elif len(cf) == 28 and cf.isalnum():
                foto_drive_id = cf
                foto_thumb = f'https://drive.google.com/uc?export=view&id={cf}'

        excel_data[uid] = {
            'nombre': nombre,
            'fechaNacimiento': fecha_str,
            'fechaNacimientoMMdd': fecha_mmdd,
            'email': email,
            'fotoThumb': foto_thumb,
            'fotoDriveId': foto_drive_id,
        }

    print(f'Miembros en Excel (con UID válido): {len(excel_data)}')

    # Leer Firestore actual
    fs_members = {doc.id: doc.to_dict() for doc in db.collection('members').get()}
    fs_registro = {doc.id: doc.to_dict() for doc in db.collection('miembros_registro').get()}

    # Map nombre -> uid para matching fallback
    fs_name_to_uid = {normalize_name(d.get('nombre', '')): uid for uid, d in fs_members.items()}

    created = updated = skipped = 0
    batch = db.batch()
    batch_count = 0

    for uid, new_data in excel_data.items():
        existing = fs_members.get(uid)
        member_ref = db.collection('members').document(uid)
        registro_ref = db.collection('miembros_registro').document(uid)

        if existing:
            # Comparar solo campos actualizables
            changes = {}
            for field in ['nombre', 'fechaNacimiento', 'fechaNacimientoMMdd', 'email', 'fotoThumb', 'fotoDriveId']:
                new_val = new_data.get(field, '')
                old_val = existing.get(field, '')
                if new_val and new_val != old_val:
                    changes[field] = new_val

            if changes:
                # PRESERVAR rol y otros campos internos
                batch.update(member_ref, changes)
                batch.update(registro_ref, {'nombre': new_data['nombre']})
                updated += 1
                print(f'  🔄 UPDATE {uid} ({new_data["nombre"]}): {list(changes.keys())}')
            else:
                skipped += 1
        else:
            # Buscar por nombre en miembros existentes (re-registro)
            matched_uid = fs_name_to_uid.get(normalize_name(new_data['nombre']))
            if matched_uid:
                print(f'  🔁 RE-MATCH por nombre: {new_data["nombre"]} -> {matched_uid}')
                # Actualizar ese documento
                changes = {}
                for field in ['fechaNacimiento', 'fechaNacimientoMMdd', 'email', 'fotoThumb', 'fotoDriveId']:
                    new_val = new_data.get(field, '')
                    old_val = fs_members[matched_uid].get(field, '')
                    if new_val and new_val != old_val:
                        changes[field] = new_val
                if changes:
                    batch.update(db.collection('members').document(matched_uid), changes)
                    updated += 1
                skipped += 1
            else:
                # NUEVO miembro
                new_doc = {
                    **new_data,
                    'rol': 'miembro',  # default, admin lo cambia
                    'fechaIngresoGrupo': datetime.now().strftime('%Y-%m-%d'),
                    'estadoAnioActual': 'activo',
                    'uid': uid,
                    'createdAt': firestore.SERVER_TIMESTAMP
                }
                batch.set(member_ref, new_doc)
                batch.set(registro_ref, {'nombre': new_data['nombre']})
                created += 1
                print(f'  ➕ CREATE {uid} ({new_data["nombre"]})')

        batch_count += 1
        if batch_count >= 400:  # límite batch
            batch.commit()
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()

    print(f'Resumen miembros: {created} nuevos, {updated} actualizados, {skipped} sin cambios')

# ──────────────────────────────────────────────────────────────
# 2. ASISTENCIA — Hoja "Asistencia" (matriz fechas x miembros)
# ──────────────────────────────────────────────────────────────
def sync_asistencia(wb):
    print('\n=== ASISTENCIA ===')
    ws = wb['Asistencia']

    # Headers: fila 1 = fechas, fila 2 = T1/T2...
    first_row = list(ws.iter_rows(min_row=1, max_row=1, values_only=True))[0]

    date_cols = []
    for idx, val in enumerate(first_row):
        if idx == 0:
            continue  # columna Nombre
        if isinstance(val, datetime):
            date_cols.append((idx, val.strftime('%Y-%m-%d')))
        elif isinstance(val, str) and '/' in val and len(val) <= 5:
            try:
                d, m = val.split('/')
                date_cols.append((idx, f'2026-{m.zfill(2)}-{d.zfill(2)}'))
            except:
                pass

    print(f'Fechas de asistencia detectadas: {len(date_cols)}')

    # Map nombre -> uid (desde members actual)
    name_to_uid = {}
    for doc in db.collection('members').get():
        d = doc.to_dict()
        name_to_uid[normalize_name(d.get('nombre', ''))] = doc.id

    total_asist = 0
    batch = db.batch()
    batch_count = 0

    for row in ws.iter_rows(min_row=3, values_only=True):
        if not row or not row[0]:
            continue
        nombre = str(row[0]).strip()
        uid = name_to_uid.get(normalize_name(nombre))
        if not uid:
            continue

        for col_idx, fecha_str in date_cols:
            val = row[col_idx] if col_idx < len(row) else None
            if val is None or val == '':
                continue
            # 1 = asistió
            if isinstance(val, (int, float)) and val == 1:
                anio = fecha_str[:4]
                doc_ref = db.collection('asistencia').document(anio).collection(fecha_str).document(uid)

                # Solo crear si no existe (idempotente)
                existing = doc_ref.get()
                if not existing.exists:
                    batch.set(doc_ref, {
                        'uid': uid,
                        'nombre': nombre,
                        'fecha': fecha_str,
                        'presente': True,
                        'tardanzaMinutos': 0,
                        'esTardanza': False,
                        'timestamp': firestore.SERVER_TIMESTAMP
                    })
                    total_asist += 1

                batch_count += 1
                if batch_count >= 400:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0

    if batch_count > 0:
        batch.commit()

    print(f'Asistencias nuevas creadas: {total_asist}')

# ──────────────────────────────────────────────────────────────
# 3. TARDANZAS — Hoja "Log_Asistencia"
# ──────────────────────────────────────────────────────────────
def sync_tardanzas(wb):
    print('\n=== TARDANZAS ===')
    ws = wb['Log_Asistencia']

    name_to_uid = {}
    for doc in db.collection('members').get():
        d = doc.to_dict()
        name_to_uid[normalize_name(d.get('nombre', ''))] = doc.id

    updated = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or len(row) < 6 or not row[1]:
            continue
        timestamp = row[0]
        nombre = str(row[1]).strip()
        tardanza = row[5]

        uid = name_to_uid.get(normalize_name(nombre))
        if not uid:
            continue

        if tardanza and isinstance(tardanza, (int, float)) and tardanza > 0:
            # Usar path directo: asistencia/2026/{fecha} — NO necesita índice compuesto
            # Buscar en las fechas recientes (últimas 2 semanas)
            from datetime import datetime, timedelta
            base_date = datetime(2026, 9, 26)  # último sábado conocido
            for i in range(14):  # buscar 2 semanas atrás
                fecha_str = (base_date - timedelta(days=i)).strftime('%Y-%m-%d')
                doc_ref = db.collection('asistencia').document('2026').collection(fecha_str).document(uid)
                doc_snap = doc_ref.get()
                if doc_snap.exists:
                    doc_ref.update({
                        'tardanzaMinutos': int(tardanza),
                        'esTardanza': True
                    })
                    updated += 1
                    print(f'  ⏰ Tardanza: {nombre} - {fecha_str} = {tardanza} min')
                    break

    print(f'Tardanzas actualizadas: {updated}')

# ──────────────────────────────────────────────────────────────
# 4. ASAMBLEAS — Hoja "Configuracion"
# ──────────────────────────────────────────────────────────────
def sync_asambleas(wb):
    print('\n=== ASAMBLEAS ===')
    ws = wb['Configuracion']

    count = 0
    batch = db.batch()
    batch_count = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or not row[0]:
            continue
        fecha = row[0]
        hay_asamblea = row[1]
        hora_inicio = row[2]
        observacion = row[3] if row[3] else ''

        if isinstance(fecha, datetime):
            fecha_str = fecha.strftime('%Y-%m-%d')
        else:
            fecha_str = str(fecha)

        doc_ref = db.collection('asambleas').document(fecha_str)
        existing = doc_ref.get()

        data = {
            'fecha': fecha_str,
            'hayAsamblea': bool(hay_asamblea) if hay_asamblea is not None else False,
            'horaInicio': str(hora_inicio) if hora_inicio else '16:00',
            'observacion': str(observacion).strip()
        }

        if not existing.exists:
            batch.set(doc_ref, data)
            count += 1
        else:
            # Actualizar solo si hay cambios
            old = existing.to_dict()
            if old != data:
                batch.update(doc_ref, data)
                count += 1

        batch_count += 1
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()

    print(f'Asambleas creadas/actualizadas: {count}')

# ──────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print(f'Cargando Excel: {EXCEL_PATH}')
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)

    sync_members(wb)
    sync_asambleas(wb)
    sync_asistencia(wb)
    sync_tardanzas(wb)

    print('\n✅ Sincronización completa')