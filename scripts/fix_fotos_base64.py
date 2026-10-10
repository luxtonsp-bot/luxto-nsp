#!/usr/bin/env python3
"""Descargar fotos de Drive y guardar como base64 en fotoThumb (128px, ≤8KB) para evitar CSP"""

import firebase_admin
from firebase_admin import credentials, firestore
import requests
import base64
import re
from io import BytesIO
from PIL import Image

cred = credentials.Certificate('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-b80cad13e2.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def descargar_y_comprimir(drive_url, max_px=128, max_kb=8):
    """Descarga imagen de Drive, comprime a max_px y max_kb, retorna base64"""
    try:
        # Convertir a URL directa de descarga
        file_id = None
        if 'uc?export=view' in drive_url:
            m = re.search(r'id=([a-zA-Z0-9_-]{20,})', drive_url)
            if m: file_id = m.group(1)
        elif 'thumbnail' in drive_url:
            m = re.search(r'id=([a-zA-Z0-9_-]{20,})', drive_url)
            if m: file_id = m.group(1)
        elif '/d/' in drive_url:
            m = re.search(r'/d/([a-zA-Z0-9_-]{20,})', drive_url)
            if m: file_id = m.group(1)

        if not file_id:
            return None

        # URL de descarga directa
        download_url = f"https://drive.google.com/uc?export=download&id={file_id}"

        # Descargar
        headers = {'User-Agent': 'Mozilla/5.0'}
        resp = requests.get(download_url, headers=headers, timeout=30)

        # Manejar confirmación de virus scan para archivos grandes
        if 'confirm=' in resp.url or 'virus scan' in resp.text.lower():
            # Intentar con confirm
            confirm_url = f"https://drive.google.com/uc?export=download&confirm=1&id={file_id}"
            resp = requests.get(confirm_url, headers=headers, timeout=30)

        if resp.status_code != 200:
            print(f"   ❌ Error descargando {file_id}: HTTP {resp.status_code}")
            return None

        # Abrir y comprimir imagen
        img = Image.open(BytesIO(resp.content))

        # Convertir a RGB si tiene transparencia
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background

        # Redimensionar manteniendo aspect ratio
        img.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)

        # Comprimir JPEG progresivamente hasta caber en max_kb
        quality = 85
        while quality >= 20:
            buffer = BytesIO()
            img.save(buffer, format='JPEG', quality=quality, optimize=True)
            size_kb = len(buffer.getvalue()) / 1024
            if size_kb <= max_kb:
                break
            quality -= 5

        if quality < 20:
            # Último intento: reducir resolución
            img.thumbnail((64, 64), Image.Resampling.LANCZOS)
            buffer = BytesIO()
            img.save(buffer, format='JPEG', quality=50, optimize=True)

        b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return f"data:image/jpeg;base64,{b64}"

    except Exception as e:
        print(f"   ❌ Error procesando {drive_url}: {e}")
        return None

# 1. Obtener miembros con fotoDriveId pero sin fotoThumb base64
print("🔍 Buscando miembros con foto en Drive...")
miembros_con_foto = []
for doc in db.collection('members').stream():
    d = doc.to_dict()
    nombre = d.get('nombre', '')
    foto_drive = d.get('fotoDriveId', '')
    foto_thumb = d.get('fotoThumb', '')

    if nombre and foto_drive and (not foto_thumb or not foto_thumb.startswith('data:')):
        drive_url = f"https://drive.google.com/uc?export=view&id={foto_drive}"
        miembros_con_foto.append({
            'uid': doc.id,
            'nombre': nombre,
            'fotoDriveId': foto_drive,
            'drive_url': drive_url,
            'fotoThumb_actual': foto_thumb
        })

print(f"   Miembros a procesar: {len(miembros_con_foto)}")

# 2. Procesar cada foto
print("\n📥 Descargando y comprimiendo fotos...")
actualizados = 0
batch = db.batch()
batch_ops = 0

for m in miembros_con_foto:
    print(f"   Procesando: {m['nombre']} ({m['fotoDriveId'][:20]}...)")
    b64_data = descargar_y_comprimir(m['drive_url'])

    if b64_data:
        batch.update(db.collection('members').document(m['uid']), {'fotoThumb': b64_data})
        batch_ops += 1
        actualizados += 1
        print(f"   ✅ {m['nombre']}: {len(b64_data)} chars ({len(b64_data)*3/4/1024:.1f} KB)")
    else:
        print(f"   ⚠️  {m['nombre']}: No se pudo procesar")

    if batch_ops >= 100:
        batch.commit()
        print(f"   💾 Batch committed: {actualizados} actualizados")
        batch = db.batch()
        batch_ops = 0

if batch_ops > 0:
    batch.commit()
    print(f"   💾 Batch final: {actualizados} total actualizados")

# 3. Verificación
print("\n✅ VERIFICACIÓN")
for doc in db.collection('members').stream():
    d = doc.to_dict()
    ft = d.get('fotoThumb', '')
    if ft and ft.startswith('data:'):
        size_kb = len(ft) * 3 / 4 / 1024
        print(f"   ✅ {d.get('nombre')}: {size_kb:.1f} KB base64")

print(f"\n🎉 Total con base64: {actualizados}")