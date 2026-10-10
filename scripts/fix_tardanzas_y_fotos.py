#!/usr/bin/env python3
"""Migrar tardanzas reales desde attendance_log.csv y fixear fotos (URL directa uc?export=view)"""

import firebase_admin
from firebase_admin import credentials, firestore
import csv
import re
from datetime import datetime

cred = credentials.Certificate('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-b80cad13e2.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

# 1. OBTENER FECHAS VÁLIDAS DE ASISTENCIA (las que existen en Firestore)
print("📅 Obteniendo fechas válidas de asistencia/2026/...")
fechas_validas = set()
asist_ref = db.collection('asistencia').document('2026')
for fecha_col in asist_ref.collections():
    fechas_validas.add(fecha_col.id)

print(f"   Fechas válidas en Firestore: {len(fechas_validas)}")
for f in sorted(fechas_validas):
    print(f"     {f}")

# 2. LEER attendance_log.csv -> mapa: (nombre, fecha) -> {tardanza, timestamp}
print("\n📖 Leyendo attendance_log.csv...")
log_data = {}  # (norm_nombre, fecha) -> {tardanza, timestamp}

with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance_log.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Saltar fila de headers fórmula
        if row.get('Timestamp', '').startswith('=') or 'DUMMYFUNCTION' in row.get('Timestamp', ''):
            continue

        timestamp_str = (row.get('Timestamp') or '').strip()
        nombre = (row.get('Nombre') or '').strip()
        tardanza_str = (row.get('Tardanza (Min)') or '').strip()

        if not timestamp_str or not nombre or not tardanza_str:
            continue

        try:
            # Parsear timestamp: "2026-01-17 15:35:36"
            dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
            fecha = dt.strftime("%Y-%m-%d")

            # SOLO procesar si la fecha es válida (existe en asistencia)
            if fecha not in fechas_validas:
                continue

            tardanza = int(float(tardanza_str))

            norm_nombre = normalize(nombre)
            key = (norm_nombre, fecha)

            # Guardar el registro más temprano (primera entrada = menos tardanza)
            if key not in log_data or tardanza < log_data[key]['tardanza']:
                log_data[key] = {
                    'tardanza': tardanza,
                    'timestamp': dt.isoformat()  # ISO string para Firestore
                }
        except Exception as e:
            continue

print(f"   Registros de tardanzas parseados (fechas válidas): {len(log_data)}")

# 3. LEER members.csv para fotos (fotoDriveId -> fotoThumb URL directa)
print("\n📖 Leyendo members.csv para fotos...")
csv_photos = {}

with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/members.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        nombre = (row.get('Nombres ') or '').strip()
        foto = (row.get('Codigo Foto') or '').strip()
        if nombre and foto and 'drive.google.com' in foto:
            m = re.search(r'[?&]id=([a-zA-Z0-9_-]{20,})', foto)
            if m:
                foto_drive_id = m.group(1)
                csv_photos[normalize(nombre)] = {
                    'fotoDriveId': foto_drive_id,
                    'fotoThumb': f"https://drive.google.com/uc?export=view&id={foto_drive_id}"  # URL DIRECTA, no thumbnail
                }

print(f"   Miembros con foto en CSV: {len(csv_photos)}")

# 4. MAPEAR nombres de Firestore a UIDs (por nombre normalizado Y nombre original)
print("\n🔗 Mapeando miembros Firestore...")
fs_members = {}
fs_members_by_orig = {}
for doc in db.collection('members').stream():
    d = doc.to_dict()
    nombre = (d.get('nombre') or '').strip()
    if nombre:
        fs_members[normalize(nombre)] = {
            'uid': doc.id,
            'nombre': nombre,
            'fotoDriveId': d.get('fotoDriveId', ''),
            'fotoThumb': d.get('fotoThumb', ''),
            'email': d.get('email', '')
        }
        fs_members_by_orig[nombre] = {
            'uid': doc.id,
            'nombre': nombre,
            'fotoDriveId': d.get('fotoDriveId', ''),
            'fotoThumb': d.get('fotoThumb', ''),
            'email': d.get('email', '')
        }

print(f"   Miembros en Firestore: {len(fs_members)}")

# 5. MAPEO MANUAL para casos que no matchean por normalización
manual_map = {
    'gabrielrevoller': 'Gabriel Revollar',
    'kayrelsuasnabar': 'Kayrel Suasnabar',
    'mariafe': 'María Fé',
    'sofia': 'Sofia',
}

# 6. ACTUALIZAR TARLANZAS Y FECHAHORA EN ASISTENCIA (usar set con merge)
print("\n🔄 Actualizando tardanzas y fechaHora en asistencia/2026/...")

updated_count = 0
batch = db.batch()
batch_ops = 0

for (norm_nombre, fecha), log_info in log_data.items():
    # Buscar UID en Firestore
    fs_nombre = None
    if norm_nombre in fs_members:
        fs_nombre = fs_members[norm_nombre]['nombre']
    elif norm_nombre in manual_map:
        mapped = manual_map[norm_nombre]
        if mapped in fs_members_by_orig:
            fs_nombre = mapped

    if not fs_nombre:
        continue

    uid = fs_members_by_orig[fs_nombre]['uid']

    # Actualizar doc de asistencia con set(merge=True) para crear si no existe
    doc_ref = asist_ref.collection(fecha).document(uid)
    batch.set(doc_ref, {
        'tardanzaMinutos': log_info['tardanza'],
        'fechaHora': log_info['timestamp']
    }, merge=True)
    batch_ops += 1
    updated_count += 1

    if batch_ops >= 400:
        batch.commit()
        print(f"   Batch committed: {updated_count} actualizados")
        batch = db.batch()
        batch_ops = 0

if batch_ops > 0:
    batch.commit()
    print(f"   Batch final committed: {updated_count} total actualizados")

# 7. ACTUALIZAR FOTOS: fotoThumb = URL directa uc?export=view
print("\n🖼️  Actualizando fotos (fotoThumb = URL directa)...")

batch = db.batch()
batch_ops = 0
photo_updated = 0

for norm_nombre, photo_data in csv_photos.items():
    fs_nombre = None
    if norm_nombre in fs_members:
        fs_nombre = fs_members[norm_nombre]['nombre']
    elif norm_nombre in manual_map:
        mapped = manual_map[norm_nombre]
        if mapped in fs_members_by_orig:
            fs_nombre = mapped

    if not fs_nombre:
        continue

    uid = fs_members_by_orig[fs_nombre]['uid']
    current_thumb = fs_members_by_orig[fs_nombre]['fotoThumb']
    new_thumb = photo_data['fotoThumb']

    # Solo actualizar si es diferente o si no tiene fotoThumb
    if current_thumb != new_thumb:
        doc_ref = db.collection('members').document(uid)
        batch.update(doc_ref, {'fotoThumb': new_thumb})
        batch_ops += 1
        photo_updated += 1

        if batch_ops >= 400:
            batch.commit()
            batch = db.batch()
            batch_ops = 0

if batch_ops > 0:
    batch.commit()

print(f"   Fotos actualizadas: {photo_updated}")

# 8. RECALCULAR asistenciasTotales y ultimaAsistencia desde datos REALES de asistencia
print("\n🔢 Recalculando asistenciasTotales y ultimaAsistencia...")

# Contar asistencias reales por UID
asistencia_por_uid = {}
for fecha_col in asist_ref.collections():
    fecha = fecha_col.id
    docs = list(fecha_col.stream())
    for doc in docs:
        data = doc.to_dict()
        if data.get('presente') == True:
            uid = doc.id
            if uid not in asistencia_por_uid:
                asistencia_por_uid[uid] = {'count': 0, 'fechas': []}
            asistencia_por_uid[uid]['count'] += 1
            asistencia_por_uid[uid]['fechas'].append(fecha)

# Actualizar members
batch = db.batch()
batch_ops = 0
members_updated = 0

for doc in db.collection('members').stream():
    uid = doc.id
    data = asistencia_por_uid.get(uid, {'count': 0, 'fechas': []})
    total = data['count']
    fechas = data['fechas']
    ultima = max(fechas) if fechas else None

    batch.update(doc.reference, {
        'asistenciasTotales': total,
        'ultimaAsistencia': ultima
    })
    batch_ops += 1
    members_updated += 1

    if batch_ops >= 400:
        batch.commit()
        batch = db.batch()
        batch_ops = 0

if batch_ops > 0:
    batch.commit()

print(f"   Miembros actualizados con totales reales: {members_updated}")

# 9. VERIFICACIÓN FINAL
print("\n✅ VERIFICACIÓN FINAL")
print("="*80)

# Verificar Paolo Alfaro
for doc in db.collection('members').stream():
    d = doc.to_dict()
    if d.get('nombre') == 'Paolo Alfaro':
        print(f"Paolo Alfaro:")
        print(f"  UID: {doc.id}")
        print(f"  fotoDriveId: {d.get('fotoDriveId')}")
        print(f"  fotoThumb: {d.get('fotoThumb')}")
        print(f"  asistenciasTotales: {d.get('asistenciasTotales')}")
        print(f"  ultimaAsistencia: {d.get('ultimaAsistencia')}")
        break

# Verificar tardanzas de Paolo
uid_paolo = 'ovR2LJVjtqZrfGGHhAHD1Qdw6qS2'
tardanzas_paolo = []
for fecha_col in asist_ref.collections():
    fecha = fecha_col.id
    doc = fecha_col.document(uid_paolo).get()
    if doc.exists:
        data = doc.to_dict()
        if data.get('presente'):
            tardanzas_paolo.append({
                'fecha': fecha,
                'tardanza': data.get('tardanzaMinutos', 0),
                'fechaHora': data.get('fechaHora')
            })

print(f"\nTardanzas de Paolo Alfaro ({len(tardanzas_paolo)} asistencias):")
total_tardanza = 0
count_tardanza = 0
for t in tardanzas_paolo:
    if t['tardanza'] > 0:
        total_tardanza += t['tardanza']
        count_tardanza += 1
    print(f"  {t['fecha']}: tardanza={t['tardanza']} min, fechaHora={t['fechaHora']}")

promedio = total_tardanza / count_tardanza if count_tardanza > 0 else 0
print(f"  Promedio tardanza: {promedio:.1f} min")
print(f"  Tardanzas > 10 min: {sum(1 for t in tardanzas_paolo if t['tardanza'] > 10)}")

# Verificar algunas fotos
print("\n🖼️  Verificación de fotos (muestra):")
count = 0
for doc in db.collection('members').stream():
    d = doc.to_dict()
    ft = d.get('fotoThumb', '')
    if ft and 'uc?export=view' in ft:
        print(f"  ✅ {d.get('nombre')}: {ft[:60]}...")
        count += 1
        if count >= 5:
            break

print("\n🎉 ¡Completado!")