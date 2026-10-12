#!/usr/bin/env python3
"""
normalize_members.py — Idempotente, --dry-run
Unifica el esquema de members al modelo del Plan:
  - Agrega uid = Document ID
  - Normaliza: nombre = name, fechaNacimiento = birthDate
  - Agrega fechaIngresoGrupo = primera asamblea con hayAsamblea=true (2026-01-10)
  - Mantiene: rol, estadoAnioActual, fotoDriveId, email
  - NO toca: fotos (las maneja migrate_photos.py)
  - NO usa Firebase Storage (COSTO CERO)

Uso:
  python3 migration/normalize_members.py            # ejecuta
  python3 migration/normalize_members.py --dry-run  # solo muestra qué haría
"""
import sys
from datetime import datetime
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("Falta firebase-admin. Instala: pip install firebase-admin")
    sys.exit(1)

BASE = Path(__file__).parent
SERVICE_ACCOUNT = BASE / "firebase-service-account.json"
DRY_RUN = "--dry-run" in sys.argv

# Primera asamblea con hayAsamblea=true (del CSV config / asambleas)
FECHA_INGRESO_DEFAULT = "2026-01-10"


def init_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT))
        firebase_admin.initialize_app(cred)
    return firestore.client()


def normalize_member_data(doc_id, data):
    """Devuelve dict con campos normalizados listos para write/update."""
    normalized = dict(data)  # copia original

    # 1. uid = Document ID (string)
    normalized["uid"] = doc_id

    # 2. nombre ← name (si existe name y no nombre)
    if "nombre" not in normalized and "name" in normalized:
        normalized["nombre"] = normalized["name"]

    # 3. fechaNacimiento ← birthDate (si existe birthDate y no fechaNacimiento)
    if "fechaNacimiento" not in normalized and "birthDate" in normalized:
        normalized["fechaNacimiento"] = normalized["birthDate"]

    # 4. fechaIngresoGrupo (si no existe)
    if "fechaIngresoGrupo" not in normalized:
        normalized["fechaIngresoGrupo"] = FECHA_INGRESO_DEFAULT

    # 5. Asegurar rol y estadoAnioActual (defaults si faltan)
    if "rol" not in normalized:
        normalized["rol"] = "miembro"
    if "estadoAnioActual" not in normalized:
        normalized["estadoAnioActual"] = "activo"

    # 6. Limpiar: no duplicar name/birthDate si ya tenemos normalizados
    # (opcional: mantenerlos para compatibilidad legacy)
    # normalized.pop("name", None)
    # normalized.pop("birthDate", None)

    return normalized


def main():
    print(f"{'='*60}")
    print(f"NORMALIZE MEMBERS — {'DRY RUN' if DRY_RUN else 'EJECUTANDO'}")
    print(f"{'='*60}")

    db = init_firebase()
    members_ref = db.collection("members")
    all_docs = list(members_ref.stream())

    print(f"\nTotal documentos en members: {len(all_docs)}")
    print(f"Fecha ingreso default: {FECHA_INGRESO_DEFAULT}\n")

    to_update = 0
    to_create = 0
    errores = 0

    for doc_snap in all_docs:
        doc_id = doc_snap.id
        data = doc_snap.to_dict()

        normalized = normalize_member_data(doc_id, data)

        # Ver qué cambia
        cambios = {}
        for k, v in normalized.items():
            old = data.get(k)
            if old != v:
                cambios[k] = (old, v)

        # Campos nuevos que no existían en el original (evitar duplicados)
        for k in ["uid", "nombre", "fechaNacimiento", "fechaIngresoGrupo"]:
            if k not in data and k not in cambios:
                cambios[k] = (None, normalized.get(k))

        if cambios:
            to_update += 1
            print(f"  📝 {doc_id} ({data.get('name') or data.get('nombre', 'SIN NOMBRE')})")
            for k, (old, new) in cambios.items():
                old_str = str(old)[:80] if old is not None else "None"
                new_str = str(new)[:80] if new is not None else "None"
                print(f"      {k}: {old_str} → {new_str}")

            if not DRY_RUN:
                try:
                    members_ref.document(doc_id).set(normalized, merge=True)
                    print(f"      ✅ Actualizado")
                except Exception as e:
                    print(f"      ❌ ERROR: {e}")
                    errores += 1
        else:
            print(f"  ✅ {doc_id} — ya normalizado")

    # Verificar miembros SIN fotoDriveId (para migrate_photos.py)
    print(f"\n--- Miembros sin fotoDriveId ---")
    sin_foto = 0
    for doc_snap in all_docs:
        data = doc_snap.to_dict()
        if not data.get("fotoDriveId"):
            sin_foto += 1
            print(f"  ⚠️  {doc_snap.id} ({data.get('name') or data.get('nombre')})")
    print(f"Total sin fotoDriveId: {sin_foto}")

    print(f"\n{'='*60}")
    print(f"RESUMEN:")
    print(f"  Documentos a actualizar: {to_update}")
    print(f"  Errores: {errores}")
    if DRY_RUN:
        print(f"\n⚠️  DRY RUN — No se escribió nada. Ejecuta sin --dry-run para aplicar.")
    else:
        print(f"\n✅ Completado.")


if __name__ == "__main__":
    main()