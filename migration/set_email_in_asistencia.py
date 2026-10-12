#!/usr/bin/env python3
"""
set_email_in_asistencia.py — Agrega campo 'email' a TODOS los docs de asistencia
en subcolecciones /asistencia/{anio}/{fecha}/{uid} usando email de members/{uid}.
Idempotente, --dry-run.
"""
import sys
from pathlib import Path

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("Falta firebase-admin. pip install --break-system-packages firebase-admin")
    sys.exit(1)

BASE = Path(__file__).parent
SERVICE_ACCOUNT = BASE / "firebase-service-account.json"
DRY_RUN = "--dry-run" in sys.argv

def init_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT))
        firebase_admin.initialize_app(cred)
    return firestore.client()

def main():
    print(f"{'='*60}")
    print(f"SET EMAIL EN ASISTENCIA (subcolecciones) — {'DRY RUN' if DRY_RUN else 'EJECUTANDO'}")
    print(f"{'='*60}")

    db = init_firebase()
    members_ref = db.collection("members")

    # Cache emails de miembros
    print("Cargando emails de members...")
    member_emails = {}
    for doc in members_ref.stream():
        data = doc.to_dict()
        if data.get("email"):
            member_emails[doc.id] = data["email"]
    print(f"  Emails cargados: {len(member_emails)}")

    # Recorrer TODAS las subcolecciones /asistencia/{anio}/{fecha}
    print("\nRecorriendo subcolecciones asistencia/{anio}/{fecha}...")
    updated = 0
    skipped = 0
    errors = 0
    total = 0

    anios_ref = db.collection("asistencia")
    # list_documents() devuelve refs de docs-año (aunque sean "fantasma": solo subcolecciones)
    for anio_doc_ref in anios_ref.list_documents():
        anio = anio_doc_ref.id
        for fecha_col in anio_doc_ref.collections():
            fecha = fecha_col.id
            for miembro_doc in fecha_col.stream():
                total += 1
                uid = miembro_doc.id
                data = miembro_doc.to_dict()
                if not data.get("presente"):
                    skipped += 1
                    continue
                email = member_emails.get(uid)
                if not email:
                    skipped += 1
                    continue
                if data.get("email") == email:
                    skipped += 1
                    continue

                if DRY_RUN:
                    print(f"  📝 {anio}/{fecha}/{uid}: email={email}")
                else:
                    try:
                        miembro_doc.reference.update({"email": email})
                        updated += 1
                    except Exception as e:
                        print(f"  ❌ {anio}/{fecha}/{uid}: {e}")
                        errors += 1

    print(f"\n{'='*60}")
    print(f"Total docs recorridos: {total}")
    if DRY_RUN:
        print(f"DRY RUN — {updated} docs se actualizarían, {skipped} sin cambios, {errors} errores")
    else:
        print(f"RESUMEN: actualizados={updated}, sin cambios={skipped}, errores={errors}")

if __name__ == "__main__":
    main()