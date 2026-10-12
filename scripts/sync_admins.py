#!/usr/bin/env python3
"""
sync_admins.py — Sincroniza /admins en RTDB desde Firebase Auth
  - Lee usuarios de Auth (email → uid)
  - Resuelve emails de ADMIN_EMAILS a UIDs
  - Compara con /admins actual en RTDB
  - Muestra diff (crear, actualizar, eliminar)
  - Modo dry-run por defecto
  - --apply para aplicar cambios
  - --prune para eliminar admins huérfanos (no en lista fuente)
"""

import argparse
import json
import sys
from typing import Dict, List, Tuple, Optional

try:
    import firebase_admin
    from firebase_admin import credentials, auth, db
except ImportError:
    print("❌ firebase-admin no instalado. Ejecuta: pip install firebase-admin")
    sys.exit(1)

# Configuración
SERVICE_ACCOUNT_PATH = "firebase-service-account.json"  # Ajustar si está en otra ruta
DATABASE_URL = "https://luxto-nsp-default-rtdb.firebaseio.com"

# Emails de administradores (coincide con ADMIN_EMAILS en firebase-init.js)
ADMIN_EMAILS = {
    "henry.alfarosotil@tecsup.edu.pe": "coordinador",
    "luciana.sologuren@tecsup.edu.pe": "coordinador",
    "mario.chavez@tecsup.edu.pe": "servidor",
    "hector.manchego@tecsup.edu.pe": "servidor",
    "fabrizio.robles@tecsup.edu.pe": "apoyo",
    "carlos.ramirez@tecsup.edu.pe": "apoyo",
}

ROL_VALIDOS = {"coordinador", "servidor", "apoyo"}


def init_firebase():
    """Inicializa Firebase Admin SDK."""
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred, {
            'databaseURL': DATABASE_URL
        })


def get_all_auth_users() -> Dict[str, str]:
    """
    Obtiene todos los usuarios de Firebase Auth.
    Returns: dict {email: uid}
    """
    email_to_uid = {}
    page = auth.list_users()
    while page:
        for user in page.users:
            if user.email:
                email_to_uid[user.email.lower()] = user.uid
        page = page.get_next_page()
    return email_to_uid


def resolve_admin_uids(email_to_uid: Dict[str, str]) -> Dict[str, str]:
    """
    Resuelve ADMIN_EMAILS a UIDs.
    Returns: dict {uid: rol}
    """
    resolved = {}
    missing = []
    for email, rol in ADMIN_EMAILS.items():
        email_lower = email.lower()
        if email_lower in email_to_uid:
            uid = email_to_uid[email_lower]
            resolved[uid] = rol
        else:
            missing.append(f"{email} ({rol})")
    if missing:
        print(f"⚠️  Emails no encontrados en Auth ({len(missing)}):")
        for m in missing:
            print(f"   - {m}")
    return resolved


def get_current_rtdb_admins() -> Dict[str, str]:
    """
    Obtiene admins actuales de RTDB /admins.
    Returns: dict {uid: rol}
    """
    ref = db.reference('/admins')
    data = ref.get()
    if not data:
        return {}
    return {uid: info.get('rol', '') for uid, info in data.items() if isinstance(info, dict)}


def compute_diff(desired: Dict[str, str], current: Dict[str, str], prune: bool) -> Tuple[List, List, List]:
    """
    Calcula diff entre desired y current.
    Returns: (crear, actualizar, eliminar)
    """
    crear = []
    actualizar = []
    eliminar = []

    # Crear o actualizar
    for uid, rol in desired.items():
        if uid not in current:
            crear.append((uid, rol))
        elif current[uid] != rol:
            actualizar.append((uid, current[uid], rol))

    # Eliminar huérfanos (solo si --prune)
    if prune:
        for uid in current:
            if uid not in desired:
                eliminar.append((uid, current[uid]))

    return crear, actualizar, eliminar


def print_diff(crear: List, actualizar: List, eliminar: List):
    """Imprime diff en formato legible."""
    print("\n📋 DIFF DE SINCRONIZACIÓN")
    print("=" * 60)

    if crear:
        print(f"\n➕ CREAR ({len(crear)}):")
        for uid, rol in crear:
            print(f"   /admins/{uid} = {{ rol: '{rol}' }}")

    if actualizar:
        print(f"\n🔄 ACTUALIZAR ({len(actualizar)}):")
        for uid, old_rol, new_rol in actualizar:
            print(f"   /admins/{uid}: '{old_rol}' → '{new_rol}'")

    if eliminar:
        print(f"\n🗑️  ELIMINAR ({len(eliminar)}) [requiere --prune]:")
        for uid, rol in eliminar:
            print(f"   /admins/{uid} (rol actual: '{rol}')")

    if not crear and not actualizar and not eliminar:
        print("\n✅ Sin cambios. /admins ya está sincronizado.")

    print("=" * 60)


def apply_changes(crear: List, actualizar: List, eliminar: List, service_account_path: str):
    """Aplica cambios a RTDB."""
    ref = db.reference('/admins')
    applied = 0

    for uid, rol in crear:
        ref.child(uid).set({'rol': rol})
        print(f"   ✅ Creado: /admins/{uid} = {{ rol: '{rol}' }}")
        applied += 1

    for uid, old_rol, new_rol in actualizar:
        ref.child(uid).update({'rol': new_rol})
        print(f"   ✅ Actualizado: /admins/{uid}: '{old_rol}' → '{new_rol}'")
        applied += 1

    for uid, rol in eliminar:
        ref.child(uid).delete()
        print(f"   ✅ Eliminado: /admins/{uid} (era '{rol}')")
        applied += 1

    return applied


def validate_roles(data: Dict[str, str]) -> List[str]:
    """Valida que todos los roles sean válidos."""
    errors = []
    for uid, rol in data.items():
        if rol not in ROL_VALIDOS:
            errors.append(f"/admins/{uid}: rol inválido '{rol}' (válidos: {ROL_VALIDOS})")
    return errors


def main():
    parser = argparse.ArgumentParser(
        description="Sincroniza /admins en RTDB desde Firebase Auth",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python sync_admins.py                 # Dry-run (por defecto)
  python sync_admins.py --apply         # Aplica cambios
  python sync_admins.py --apply --prune # Aplica y elimina huérfanos
  python sync_admins.py --check         # Solo valida, exit code 0=OK, 1=diff
        """
    )
    parser.add_argument('--apply', action='store_true', help='Aplicar cambios (por defecto dry-run)')
    parser.add_argument('--prune', action='store_true', help='Eliminar admins no en lista fuente (requiere --apply)')
    parser.add_argument('--check', action='store_true', help='Modo check: exit 0 si sincronizado, 1 si hay diff')
    parser.add_argument('--service-account', default=SERVICE_ACCOUNT_PATH, help='Ruta a service account JSON')

    args = parser.parse_args()

    if args.prune and not args.apply:
        print("❌ --prune requiere --apply")
        sys.exit(1)

    service_account_path = args.service_account

    try:
        init_firebase()
    except Exception as e:
        print(f"❌ Error inicializando Firebase: {e}")
        sys.exit(1)

    print("🔄 Sincronizando /admins...")
    print(f"   Fuente: Firebase Auth ({len(ADMIN_EMAILS)} emails configurados)")
    print(f"   Modo: {'APLICAR' if args.apply else 'DRY-RUN'}{' + PRUNE' if args.prune else ''}")

    # 1. Obtener usuarios de Auth
    print("\n📥 Leyendo usuarios de Firebase Auth...")
    email_to_uid = get_all_auth_users()
    print(f"   Usuarios en Auth: {len(email_to_uid)}")

    # 2. Resolver emails a UIDs
    print("\n🔍 Resolviendo emails de ADMIN_EMAILS a UIDs...")
    desired_admins = resolve_admin_uids(email_to_uid)
    print(f"   Admins resueltos: {len(desired_admins)}")

    # 3. Obtener admins actuales de RTDB
    print("\n📥 Leyendo /admins actual de RTDB...")
    current_admins = get_current_rtdb_admins()
    print(f"   Admins en RTDB: {len(current_admins)}")

    # 4. Validar roles
    errors = validate_roles(desired_admins)
    if errors:
        print("\n❌ ERRORES DE VALIDACIÓN:")
        for e in errors:
            print(f"   - {e}")
        sys.exit(1)

    # 5. Calcular diff
    crear, actualizar, eliminar = compute_diff(desired_admins, current_admins, args.prune)

    # 6. Mostrar diff
    print_diff(crear, actualizar, eliminar)

    # 7. Modo check
    if args.check:
        has_changes = bool(crear or actualizar or eliminar)
        if has_changes:
            print("\n⚠️  Hay cambios pendientes (exit code 1)")
            sys.exit(1)
        else:
            print("\n✅ Sincronizado (exit code 0)")
            sys.exit(0)

    # 8. Aplicar si --apply
    if args.apply:
        if not crear and not actualizar and not eliminar:
            print("\n✅ Nada que aplicar.")
            return

        print("\n🚀 Aplicando cambios...")
        applied = apply_changes(crear, actualizar, eliminar, service_account_path)
        print(f"\n✅ Completado: {applied} operaciones aplicadas.")
    else:
        print("\n💡 Dry-run completado. Usa --apply para aplicar cambios.")


if __name__ == '__main__':
    main()