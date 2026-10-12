#!/usr/bin/env python3
"""
set_roles.py — Asigna rol 'coordinador' (1) y 'lider' (múltiples) a miembros por email.
Idempotente, --dry-run.
Uso: python3 set_roles.py --coordinador <email> --lideres <email1>,<email2>,...
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

# Parsear argumentos
coordinador_email = None
lideres_emails = []
for i, arg in enumerate(sys.argv):
    if arg == "--coordinador" and i + 1 < len(sys.argv):
        coordinador_email = sys.argv[i + 1]
    elif arg == "--lideres" and i + 1 < len(sys.argv):
        lideres_emails = [e.strip() for e in sys.argv[i + 1].split(",")]

if not coordinador_email and not lideres_emails:
    print("Uso: python3 set_roles.py --coordinador <email> --lideres <email1>,<email2>,...")
    sys.exit(1)

def init_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT))
        firebase_admin.initialize_app(cred)
    return firestore.client()

def main():
    print(f"{'='*60}")
    print(f"SET ROLES — {'DRY RUN' if DRY_RUN else 'EJECUTANDO'}")
    print(f"{'='*60}")
    print(f"Coordinador: {coordinador_email}")
    print(f"Líderes: {', '.join(lideres_emails)}")

    db = init_firebase()
    members_ref = db.collection("members")

    # Mapear email -> uid
    email_to_uid = {}
    for doc in members_ref.stream():
        data = doc.to_dict()
        email = data.get("email")
        if email:
            email_to_uid[email.lower()] = doc.id

    print(f"\nMiembros con email: {len(email_to_uid)}")

    updated = 0
    skipped = 0
    errors = 0
    not_found = []

    # Coordinador
    if coordinador_email:
        uid = email_to_uid.get(coordinador_email.lower())
        if uid:
            print(f"\n📌 Coordinador: {coordinador_email} -> {uid}")
            if not DRY_RUN:
                try:
                    members_ref.document(uid).update({"rol": "coordinador"})
                    updated += 1
                except Exception as e:
                    print(f"  ❌ Error: {e}")
                    errors += 1
            else:
                print(f"  📝 DRY RUN: actualizaría rol=coordinador")
        else:
            not_found.append(coordinador_email)
            print(f"  ⚠️  NO ENCONTRADO: {coordinador_email}")

    # Líderes
    for email in lideres_emails:
        uid = email_to_uid.get(email.lower())
        if uid:
            print(f"\n📌 Líder: {email} -> {uid}")
            if not DRY_RUN:
                try:
                    members_ref.document(uid).update({"rol": "lider"})
                    updated += 1
                except Exception as e:
                    print(f"  ❌ Error: {e}")
                    errors += 1
            else:
                print(f"  📝 DRY RUN: actualizaría rol=lider")
        else:
            not_found.append(email)
            print(f"  ⚠️  NO ENCONTRADO: {email}")

    print(f"\n{'='*60}")
    if DRY_RUN:
        print(f"DRY RUN — {updated} docs se actualizarían, {skipped} sin cambios, {errors} errores")
    else:
        print(f"RESUMEN: actualizados={updated}, no encontrados={len(not_found)}, errores={errors}")
    if not_found:
        print(f"Emails no encontrados: {', '.join(not_found)}")

if __name__ == "__main__":
    main()