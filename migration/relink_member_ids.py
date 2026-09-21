#!/usr/bin/env python3
"""
relink_member_ids.py — Alinea members/{id} con el UID real de Firebase Auth.

PROBLEMA QUE RESUELVE
  Las reglas de Firestore y el dashboard asumen members/{uid de Auth}. La migración
  dejó miembros con otro id (p. ej. el id de la foto de Drive cuando la hoja no tenía
  UID). Resultado: permission-denied al leer su asistencia y isLider() falso.

QUÉ HACE (por cada members/{id} cuyo id NO es un usuario de Auth)
  1. Busca su cuenta de Auth por correo.
  2. Copia members/{id} -> members/{uidAuth} (agrega uid y legacyId; conserva el resto).
  3. Copia asistencia/{anio}/{fecha}/{id} -> .../{uidAuth} (con uid actualizado) y fotos/{id}.
  4. Con --delete-old borra los docs viejos, pero solo si cada uno tiene su copia verificada.
  Sin cuenta de Auth (aún no se registraron): se dejan tal cual y se reportan.

SEGURIDAD
  - Por defecto es DRY-RUN: no escribe nada. Hay que pasar --apply.
  - --delete-old exige --apply. Recomendado: primero --apply, verificar, luego --apply --delete-old.
  - Idempotente: se puede correr varias veces.

USO (desde la raíz del repo; requiere migration/firebase-service-account.json)
  python3 migration/relink_member_ids.py                              # dry-run
  python3 migration/relink_member_ids.py --apply --rol tu@correo=coordinador
  python3 migration/relink_member_ids.py --apply --map IDVIEJO=UIDAUTH --rol UIDAUTH=coordinador
  python3 migration/relink_member_ids.py --apply --delete-old          # 2ª corrida: borra los viejos ya copiados
"""
import argparse
import json
import sys
from pathlib import Path

BASE = Path(__file__).parent
SERVICE_ACCOUNT = BASE / "firebase-service-account.json"
REPORT = BASE / "relink_report.json"          # contiene correos/uids: está en .gitignore
ROLES = {"miembro", "lider", "coordinador"}


# ─────────────────────────── lógica pura (testeable) ───────────────────────────
def plan_relinks(members, uid_exists, uid_by_email, manual_map=None):
    """
    members:      {docId: data}
    uid_exists:   callable(docId) -> bool   (¿existe un usuario de Auth con ese uid?)
    uid_by_email: callable(email) -> uid | None
    manual_map:   {idViejo: uidAuth} para casos donde el correo no coincide (tiene prioridad)
    Devuelve dict con listas: ok, relink, copiado (ya copiado, falta borrar el viejo), sin_cuenta, conflicto.
    """
    manual_map = manual_map or {}
    out = {"ok": [], "relink": [], "copiado": [], "sin_cuenta": [], "conflicto": []}
    destinos = {}
    for doc_id, data in members.items():
        if uid_exists(doc_id):
            out["ok"].append(doc_id)
            continue
        email = (data.get("email") or "").strip().lower()
        if doc_id in manual_map:
            new_uid = manual_map[doc_id] if uid_exists(manual_map[doc_id]) else None
        else:
            new_uid = uid_by_email(email) if email else None
        if not new_uid:
            out["sin_cuenta"].append({"id": doc_id, "email": email or None})
            continue
        if new_uid in members:
            if members[new_uid].get("legacyId") == doc_id:
                out["copiado"].append({"old": doc_id, "new": new_uid, "email": email})
            else:
                out["conflicto"].append({"id": doc_id, "uid": new_uid, "motivo": "members/{uid} ya existe; fusionar a mano"})
            continue
        if new_uid in destinos:
            out["conflicto"].append({"id": doc_id, "uid": new_uid, "motivo": f"mismo correo que {destinos[new_uid]}"})
            continue
        destinos[new_uid] = doc_id
        out["relink"].append({"old": doc_id, "new": new_uid, "email": email})
    return out


def apply_relink(db, item, data, anios, roles, dry_run):
    """Copia un miembro (y su asistencia/foto) al uid correcto. NUNCA borra. Devuelve resumen."""
    old, new = item["old"], item["new"]
    nuevo = dict(data)
    nuevo["uid"] = new
    nuevo["legacyId"] = old
    rol = roles.get(item["email"]) or roles.get(new)
    if rol:
        nuevo["rol"] = rol
    copiados = 0
    if not dry_run:
        db.collection("members").document(new).set(nuevo)
    for anio in anios:
        for sub in db.collection("asistencia").document(anio).collections():
            snap = sub.document(old).get()
            if not snap.exists:
                continue
            copiados += 1
            if not dry_run:
                sub.document(new).set({**snap.to_dict(), "uid": new})
    foto = db.collection("fotos").document(old).get()
    if foto.exists and not dry_run:
        db.collection("fotos").document(new).set(foto.to_dict())
    return {"old": old, "new": new, "email": item["email"], "asistencias_copiadas": copiados, "rol": nuevo.get("rol")}


def delete_old_copied(db, item, anios, dry_run):
    """Borra los docs viejos SOLO si cada uno tiene su copia en el uid nuevo. Devuelve resumen."""
    old, new = item["old"], item["new"]
    if not db.collection("members").document(new).get().exists:
        return {"old": old, "borrados": 0, "error": "falta members/{uid nuevo}; no se borra nada"}
    refs = []
    for anio in anios:
        for sub in db.collection("asistencia").document(anio).collections():
            if sub.document(old).get().exists:
                if not sub.document(new).get().exists:
                    return {"old": old, "borrados": 0, "error": f"falta copia en {anio}/{sub.path[-1]}; no se borra nada"}
                refs.append(sub.document(old))
    if db.collection("fotos").document(old).get().exists:
        if not db.collection("fotos").document(new).get().exists:
            return {"old": old, "borrados": 0, "error": "falta copia de fotos/{uid}; no se borra nada"}
        refs.append(db.collection("fotos").document(old))
    refs.append(db.collection("members").document(old))
    if not dry_run:
        for ref in refs:
            ref.delete()
    return {"old": old, "borrados": len(refs) if not dry_run else 0, "error": None}


# ─────────────────────────────────── CLI ───────────────────────────────────────
def parse_roles(pairs):
    roles = {}
    for p in pairs or []:
        if "=" not in p:
            sys.exit(f"--rol espera correo=rol, recibí: {p}")
        clave, rol = p.split("=", 1)
        if rol not in ROLES:
            sys.exit(f"Rol inválido '{rol}'. Usa: {', '.join(sorted(ROLES))}")
        clave = clave.strip()
        roles[clave.lower() if "@" in clave else clave] = rol     # correo (minúsculas) o uid (tal cual)
    return roles


def parse_map(pairs):
    m = {}
    for p in pairs or []:
        if "=" not in p:
            sys.exit(f"--map espera idViejo=uidAuth, recibí: {p}")
        old, new = p.split("=", 1)
        m[old.strip()] = new.strip()
    return m


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="escribir en Firestore (por defecto es dry-run)")
    ap.add_argument("--delete-old", action="store_true", help="borrar los docs viejos tras copiar (requiere --apply)")
    ap.add_argument("--anio", action="append", default=None, help="año(s) de asistencia a copiar (default 2026)")
    ap.add_argument("--rol", action="append", help="correo=rol o uidAuth=rol (miembro|lider|coordinador), repetible")
    ap.add_argument("--map", action="append", help="idViejo=uidAuth: enlaza a mano cuando el correo no coincide, repetible")
    args = ap.parse_args()
    if args.delete_old and not args.apply:
        sys.exit("--delete-old requiere --apply")
    anios = args.anio or ["2026"]
    roles = parse_roles(args.rol)
    manual = parse_map(args.map)
    dry = not args.apply

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore, auth
    except ImportError:
        sys.exit("Falta firebase-admin: pip install firebase-admin")
    if not SERVICE_ACCOUNT.exists():
        sys.exit(f"No encuentro {SERVICE_ACCOUNT}")
    firebase_admin.initialize_app(credentials.Certificate(str(SERVICE_ACCOUNT)))
    db = firestore.client()
    not_found = getattr(auth, "UserNotFoundError", Exception)

    def uid_exists(uid):
        try:
            auth.get_user(uid)
            return True
        except (not_found, ValueError):
            return False

    def uid_by_email(email):
        try:
            return auth.get_user_by_email(email).uid
        except (not_found, ValueError):
            return None

    members = {d.id: d.to_dict() for d in db.collection("members").stream()}
    plan = plan_relinks(members, uid_exists, uid_by_email, manual)
    print(f"{'DRY-RUN' if dry else 'APLICANDO'} · members: {len(members)} | ya enlazados: {len(plan['ok'])} | "
          f"a re-enlazar: {len(plan['relink'])} | ya copiados (falta borrar viejo): {len(plan['copiado'])} | "
          f"sin cuenta Auth: {len(plan['sin_cuenta'])} | conflictos: {len(plan['conflicto'])}")

    resultados, borrados = [], []
    for item in plan["relink"]:
        r = apply_relink(db, item, members[item["old"]], anios, roles, dry)
        resultados.append(r)
        print(f"  {item['old']} -> {item['new']}  ({item['email']})  asistencias: {r['asistencias_copiadas']}"
              f"{'  rol=' + r['rol'] if r['rol'] else ''}")
    if args.delete_old:                                   # requiere --apply
        for item in plan["relink"] + plan["copiado"]:
            d = delete_old_copied(db, item, anios, dry)
            borrados.append(d)
            print(f"  borrar viejo {item['old']}: " + (f"⚠ {d['error']}" if d["error"] else f"{d['borrados']} docs"))
    elif plan["copiado"]:
        for item in plan["copiado"]:
            print(f"  ya copiado: {item['old']} -> {item['new']} (usa --apply --delete-old para borrar el viejo)")
    for c in plan["conflicto"]:
        print("  ⚠ CONFLICTO:", c)

    REPORT.write_text(json.dumps({"dry_run": dry, "resultados": resultados, "borrados": borrados, "sin_cuenta": plan["sin_cuenta"],
                                  "conflicto": plan["conflicto"]}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Reporte: {REPORT}")
    if dry:
        print("Nada se escribió. Revisa y repite con --apply.")


if __name__ == "__main__":
    main()
