#!/usr/bin/env python3
"""
migrate_local_photos.py — Sube fotos de migration/photos_export/{uid}.jpg a Firestore
  - Idempotente, --dry-run
  - thumb 128px ≤12K chars, grande 400px ≤200K chars
  - Batch write: members/{uid}.fotoThumb + fotos/{uid}={data,actualizado}
  - Solo procesa miembros que TENGAN archivo local (los sin foto se saltan)
  - COSTO CERO (sin Storage, sin Drive)
"""
import sys
import io
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image
except ImportError:
    print("Falta Pillow. pip install --break-system-packages pillow")
    sys.exit(1)

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("Falta firebase-admin. pip install --break-system-packages firebase-admin")
    sys.exit(1)

BASE = Path(__file__).parent
SERVICE_ACCOUNT = BASE / "firebase-service-account.json"
PHOTOS_DIR = BASE / "photos_export"
DRY_RUN = "--dry-run" in sys.argv

MAX_THUMB_B64 = 12000
MAX_GRANDE_B64 = 200000
THUMB_START = {"size": 128, "quality": 75}
GRANDE_START = {"size": 400, "quality": 82}
MIN_QUALITY = 30
MIN_SIZE_THUMB = 64
MIN_SIZE_GRANDE = 200


def init_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT))
        firebase_admin.initialize_app(cred)
    return firestore.client()


def compress_to_base64(img_bytes, max_px, quality):
    img = Image.open(io.BytesIO(img_bytes))
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P": img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    w, h = img.size
    if w > max_px or h > max_px:
        if w > h:
            h = int(h * max_px / w); w = max_px
        else:
            w = int(w * max_px / h); h = max_px
        img = img.resize((w, h), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    import base64
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def recompress_until_fit(img_bytes, max_px, start_quality, max_b64, min_quality, min_size):
    quality, size = start_quality, max_px
    while True:
        b64 = compress_to_base64(img_bytes, size, quality)
        if len(b64) <= max_b64:
            return b64, size, quality
        if quality > min_quality:
            quality -= 5
        elif size > min_size:
            size = max(min_size, size - 50)
            quality = start_quality
        else:
            return b64, size, quality


def main():
    print(f"{'='*60}")
    print(f"MIGRATE LOCAL PHOTOS — {'DRY RUN' if DRY_RUN else 'EJECUTANDO'}")
    print(f"{'='*60}")
    print(f"Directorio: {PHOTOS_DIR}")

    if not PHOTOS_DIR.exists():
        print(f"❌ No existe {PHOTOS_DIR}")
        sys.exit(1)

    db = init_firebase()
    members_ref = db.collection("members")
    fotos_ref = db.collection("fotos")

    # Mapear archivos locales por UID
    local_files = {}
    for ext in (".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG"):
        for f in PHOTOS_DIR.glob(f"*{ext}"):
            uid = f.stem
            if uid not in local_files:  # primera extensión gana
                local_files[uid] = f

    print(f"Archivos locales encontrados: {len(local_files)}")

    # Filtrar solo miembros que EXISTEN en Firestore
    all_members = list(members_ref.stream())
    member_uids = {d.id for d in all_members}

    to_process = []
    for uid, fpath in local_files.items():
        if uid in member_uids:
            to_process.append((uid, fpath))
        else:
            print(f"  ⚠️  {uid}: archivo local pero NO existe en members (se ignora)")

    print(f"Miembros con foto local válida: {len(to_process)}")
    print(f"Miembros SIN foto local: {len(member_uids) - len(to_process)}")
    print()

    if DRY_RUN:
        for uid, fpath in to_process:
            size_kb = fpath.stat().st_size / 1024
            print(f"  📥 {uid} — {fpath.name} ({size_kb:.1f} KB)")
        print(f"\n⚠️  DRY RUN — No se escribió.")
        return

    batch = db.batch()
    batch_count = 0
    stats = {"ok": 0, "error": 0, "recompressed": 0, "skipped": 0}

    for uid, fpath in to_process:
        try:
            img_bytes = fpath.read_bytes()
            nombre = "DESCONOCIDO"
            # Obtener nombre del miembro
            doc = members_ref.document(uid).get()
            if doc.exists:
                data = doc.to_dict()
                nombre = data.get("nombre") or data.get("name") or "SIN_NOMBRE"

            thumb_b64, ts, tq = recompress_until_fit(img_bytes, THUMB_START["size"], THUMB_START["quality"],
                                                      MAX_THUMB_B64, MIN_QUALITY, MIN_SIZE_THUMB)
            grande_b64, gs, gq = recompress_until_fit(img_bytes, GRANDE_START["size"], GRANDE_START["quality"],
                                                       MAX_GRANDE_B64, MIN_QUALITY, MIN_SIZE_GRANDE)

            recompressed = (ts != THUMB_START["size"] or tq != THUMB_START["quality"] or
                            gs != GRANDE_START["size"] or gq != GRANDE_START["quality"])

            member_ref = members_ref.document(uid)
            foto_ref = fotos_ref.document(uid)
            batch.update(member_ref, {"fotoThumb": thumb_b64})
            batch.set(foto_ref, {"data": grande_b64, "actualizado": datetime.now().isoformat()})

            batch_count += 1
            stats["ok"] += 1

            print(f"  ✅ {uid} ({nombre}) — thumb: {ts}px q{tq} ({len(thumb_b64)} chars), "
                  f"grande: {gs}px q{gq} ({len(grande_b64)} chars)" +
                  (" 🔧 recomprimido" if recompressed else ""))

            if batch_count >= 400:
                batch.commit()
                batch = db.batch()
                batch_count = 0
                print(f"    💾 Batch intermedio")

        except Exception as e:
            print(f"  ❌ {uid}: {e}")
            stats["error"] += 1

    if batch_count > 0:
        batch.commit()
        print(f"    💾 Batch final")

    print(f"\n{'='*60}")
    print(f"RESUMEN: ok={stats['ok']}, recomprimidos={stats['recompressed']}, errores={stats['error']}")
    print(f"Miembros SIN foto local (usan Drive fallback / logo): {len(member_uids) - stats['ok']}")


if __name__ == "__main__":
    main()