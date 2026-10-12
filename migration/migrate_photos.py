#!/usr/bin/env python3
"""
migrate_photos.py — One-off: Drive → Firestore (2 tamaños) — COSTO CERO
  - Paralelizado (ThreadPoolExecutor) para evitar timeout
  - thumb 128px ≤12K chars, grande 400px ≤200K chars
  - Batch write: members/{uid}.fotoThumb + fotos/{uid}={data,actualizado}
  - Idempotente, --dry-run

Uso:
  python3 migration/migrate_photos.py            # ejecuta (paralelo, ~30s)
  python3 migration/migrate_photos.py --dry-run  # solo muestra
"""
import sys
import re
import io
import requests
import concurrent.futures
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image
except ImportError:
    print("Falta Pillow. pip install --break-system-packages pillow requests")
    sys.exit(1)

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("Falta firebase-admin. pip install --break-system-packages firebase-admin")
    sys.exit(1)

BASE = Path(__file__).parent
SERVICE_ACCOUNT = BASE / "firebase-service-account.json"
DRY_RUN = "--dry-run" in sys.argv

MAX_THUMB_B64 = 12000
MAX_GRANDE_B64 = 200000
THUMB_START = {"size": 128, "quality": 75}
GRANDE_START = {"size": 400, "quality": 82}
MIN_QUALITY = 30
MIN_SIZE_THUMB = 64
MIN_SIZE_GRANDE = 200
MAX_WORKERS = 8  # Paralelismo


def init_firebase():
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(SERVICE_ACCOUNT))
        firebase_admin.initialize_app(cred)
    return firestore.client()


def extract_drive_id(url_or_id):
    if not url_or_id:
        return None
    s = str(url_or_id).strip()
    m = re.search(r'[?&]id=([a-zA-Z0-9_-]{20,})', s)
    if m: return m.group(1)
    m = re.search(r'/d/([a-zA-Z0-9_-]{20,})', s)
    if m: return m.group(1)
    m = re.search(r'/file/d/([a-zA-Z0-9_-]{20,})', s)
    if m: return m.group(1)
    if re.match(r'^[a-zA-Z0-9_-]{20,}$', s): return s
    return None


def download_drive_image(file_id):
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    resp = requests.get(url, timeout=30)
    if resp.status_code != 200 and "confirm=" not in url:
        resp = requests.get(f"https://drive.google.com/uc?export=download&confirm=t&id={file_id}", timeout=30)
    resp.raise_for_status()
    return resp.content


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


def process_member(uid, nombre, foto_drive):
    """Worker: descarga, comprime, devuelve dict listo para batch."""
    file_id = extract_drive_id(foto_drive)
    if not file_id:
        return {"uid": uid, "error": f"Drive ID inválido: {foto_drive[:60]}"}

    img_bytes = download_drive_image(file_id)

    thumb_b64, ts, tq = recompress_until_fit(img_bytes, THUMB_START["size"], THUMB_START["quality"],
                                              MAX_THUMB_B64, MIN_QUALITY, MIN_SIZE_THUMB)
    grande_b64, gs, gq = recompress_until_fit(img_bytes, GRANDE_START["size"], GRANDE_START["quality"],
                                               MAX_GRANDE_B64, MIN_QUALITY, MIN_SIZE_GRANDE)

    recompressed = (ts != THUMB_START["size"] or tq != THUMB_START["quality"] or
                    gs != GRANDE_START["size"] or gq != GRANDE_START["quality"])

    return {
        "uid": uid,
        "nombre": nombre,
        "thumb_b64": thumb_b64,
        "grande_b64": grande_b64,
        "recompressed": recompressed,
        "thumb_info": f"{ts}px q{tq} ({len(thumb_b64)} chars)",
        "grande_info": f"{gs}px q{gq} ({len(grande_b64)} chars)",
    }


def main():
    print(f"{'='*60}")
    print(f"MIGRATE PHOTOS (paralelo {MAX_WORKERS} workers) — {'DRY RUN' if DRY_RUN else 'EJECUTANDO'}")
    print(f"{'='*60}")

    db = init_firebase()
    members_ref = db.collection("members")
    fotos_ref = db.collection("fotos")

    all_members = list(members_ref.stream())
    print(f"Total miembros: {len(all_members)}\n")

    # Preparar tareas
    tasks = []
    for doc_snap in all_members:
        data = doc_snap.to_dict()
        nombre = data.get("nombre") or data.get("name") or "SIN_NOMBRE"
        foto_drive = data.get("fotoDriveId")
        if foto_drive:
            tasks.append((doc_snap.id, nombre, foto_drive))
        else:
            print(f"  ⏭️  {doc_snap.id} ({nombre}) — sin fotoDriveId")

    print(f"Procesando {len(tasks)} fotos en paralelo...\n")

    if DRY_RUN:
        for uid, nombre, _ in tasks:
            print(f"  📥 {uid} ({nombre})")
        print(f"\n⚠️  DRY RUN — No se descargó ni escribió.")
        return

    # Paralelizar descarga + compresión
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_uid = {executor.submit(process_member, uid, nombre, fd): uid for uid, nombre, fd in tasks}
        for future in concurrent.futures.as_completed(future_to_uid):
            uid = future_to_uid[future]
            try:
                res = future.result()
                results.append(res)
            except Exception as e:
                results.append({"uid": uid, "error": str(e)})

    # Batch write resultados
    batch = db.batch()
    batch_count = 0
    stats = {"ok": 0, "error": 0, "recompressed": 0}

    for res in results:
        if "error" in res:
            print(f"  ❌ {res['uid']}: {res['error']}")
            stats["error"] += 1
            continue

        uid = res["uid"]
        print(f"  ✅ {uid} ({res['nombre']}) — thumb: {res['thumb_info']}, grande: {res['grande_info']}")
        if res["recompressed"]:
            stats["recompressed"] += 1
            print(f"    🔧 Recomprimido")

        member_ref = members_ref.document(uid)
        foto_ref = fotos_ref.document(uid)
        batch.update(member_ref, {"fotoThumb": res["thumb_b64"]})
        batch.set(foto_ref, {"data": res["grande_b64"], "actualizado": datetime.now().isoformat()})

        batch_count += 1
        stats["ok"] += 1

        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0
            print(f"    💾 Batch intermedio")

    if batch_count > 0:
        batch.commit()
        print(f"    💾 Batch final")

    print(f"\n{'='*60}")
    print(f"RESUMEN: ok={stats['ok']}, recomprimidos={stats['recompressed']}, errores={stats['error']}")
    if stats["error"]:
        print(f"⚠️  Hubo errores. Re-ejecutar (idempotente) para reintentar.")


if __name__ == "__main__":
    main()