#!/usr/bin/env python3
"""Recalcular totales desde attendance_log.csv deduplicando por (fecha, nombre) - SOLO fechas habilitadas"""

import firebase_admin
from firebase_admin import credentials, firestore
import csv
import re

cred = credentials.Certificate('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-b80cad13e2.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

def parseExcelDate(cell):
    if not cell: return None
    s = str(cell).strip()
    if re.match(r'^\d{2}/\d{2}$', s):
        d, m = s.split('/')
        return f"2026-{m.zfill(2)}-{d.zfill(2)}"
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s.split(' ')[0]
    return None

# 1. FECHAS HABILITADAS
enabled_dates = set()
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/config.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        fecha = (row.get('Fecha') or '').strip()
        hay = (row.get('Hay_Asamblea') or '0').strip()
        if hay in ('1.0', '1'): enabled_dates.add(fecha)

print(f"Fechas habilitadas: {len(enabled_dates)}")

# 2. LEER attendance_log.csv Y DEDUPLICAR (fecha, nombre) -> presente=1
log_asistencias = {}  # nombre -> set(fechas)

with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance_log.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        ts = (row.get('Timestamp') or '').strip()
        nombre = (row.get('Nombre') or '').strip()
        if not ts or not nombre: continue

        # Extraer fecha del timestamp
        fecha = ts.split(' ')[0]
        if fecha not in enabled_dates: continue

        if nombre not in log_asistencias:
            log_asistencias[nombre] = set()
        log_asistencias[nombre].add(fecha)

print(f"Nombres en log deduplicado: {len(log_asistencias)}")

# 3. MAPEAR NOMBRES LOG -> UID FIRESTORE (fuzzy match)
firestore_members = {}
for doc in db.collection('members').stream():
    d = doc.to_dict()
    nombre = d.get('nombre', '').strip()
    if nombre:
        firestore_members[nombre] = {
            'uid': doc.id,
            'asistenciasTotales': d.get('asistenciasTotales', 0),
            'email': d.get('email', ''),
        }

# Función fuzzy match
def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

log_norm = {normalize(k): k for k in log_asistencias.keys()}
fs_norm = {normalize(k): k for k in firestore_members.keys()}

asistencia_por_uid = {}
matched = 0
unmatched_log = []
unmatched_fs = []

for log_norm_name, log_orig_name in log_norm.items():
    fechas = log_asistencias[log_orig_name]
    total = len(fechas)

    # Buscar match exacto o fuzzy
    if log_norm_name in fs_norm:
        fs_orig = fs_norm[log_norm_name]
        uid = firestore_members[fs_orig]['uid']
        asistencia_por_uid[uid] = total
        matched += 1
    else:
        unmatched_log.append(log_orig_name)

# Nombres en Firestore que no están en log
for fs_orig_name in firestore_members:
    if normalize(fs_orig_name) not in log_norm:
        unmatched_fs.append(fs_orig_name)

print(f"Matched: {matched}")
print(f"En log pero NO en Firestore: {len(unmatched_log)}")
for n in sorted(unmatched_log): print(f"   - {n}")
print(f"En Firestore pero NO en log: {len(unmatched_fs)}")
for n in sorted(unmatched_fs): print(f"   - {n} (uid: {firestore_members[n]['uid']})")

# 4. ACTUALIZAR EN BATCH
print("\n🔢 Actualizando asistenciasTotales...")
batch = db.batch()
count = 0
updated = 0

for doc in db.collection('members').stream():
    uid = doc.id
    total = asistencia_por_uid.get(uid, 0)

    # Última fecha
    ultima = None
    if total > 0:
        # Buscar en log_asistencias
        d = doc.to_dict()
        nombre = d.get('nombre', '').strip()
        if nombre in log_asistencias and log_asistencias[nombre]:
            ultima = max(log_asistencias[nombre])

    batch.update(doc.reference, {'asistenciasTotales': total, 'ultimaAsistencia': ultima})
    count += 1
    updated += 1

    if count >= 400:
        batch.commit()
        print(f"   Batch: {updated}")
        batch = db.batch()
        count = 0

if count > 0:
    batch.commit()
    print(f"   Final batch: {updated}")

print(f"\n✅ Totales actualizados: {updated} miembros")

# 5. VERIFICACIÓN FINAL CONTRA attendance.csv (resumen oficial)
print("\n🔍 Verificación contra attendance.csv (resumen oficial)...")

attendance = []
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance.csv', 'r') as f:
    reader = csv.DictReader(f)
    attendance = list(reader)

headers = list(attendance[0].keys())
fecha_cols = []
for i, h in enumerate(headers[1:-1], 1):
    f = parseExcelDate(h)
    if f and f in enabled_dates:
        fecha_cols.append((i, f))

excel_totals = {}
for row in attendance:
    nombre = (row.get('Nombre') or '').strip()
    if not nombre or nombre == 'Total de asistentes:': continue
    total = 0
    for col_idx, fecha in fecha_cols:
        header_name = headers[col_idx]
        try:
            valor = float(row.get(header_name, '0') or '0')
        except: valor = 0
        if valor >= 1: total += 1
    excel_totals[nombre] = total

# Comparar
firestore_final = {}
for doc in db.collection('members').stream():
    d = doc.to_dict()
    nombre = d.get('nombre', '').strip()
    if nombre:
        firestore_final[nombre] = d.get('asistenciasTotales', 0)

matches = 0
mismatches = 0
all_names = set(excel_totals.keys()) | set(firestore_final.keys())

print(f"\n{'NOMBRE':<30} {'EXCEL':>6} {'FIRESTORE':>10} {'DIFF':>6} {'STATUS'}")
print("="*70)

for nombre in sorted(all_names):
    excel_total = excel_totals.get(nombre, 0)
    fs_total = firestore_final.get(nombre, 0)
    diff = excel_total - fs_total
    if diff == 0:
        status = "✅"
        matches += 1
    else:
        status = f"❌ {diff}"
        mismatches += 1
    print(f"{nombre:<30} {excel_total:>6} {fs_total:>10} {diff:>6} {status}")

print("="*70)
print(f"✅ Coinciden PERFECTO: {matches} | ❌ Diferencias: {mismatches}")

# 6. TOP 10
print("\n🏆 Top 10 asistencias:")
for doc in db.collection('members').order_by('asistenciasTotales', direction=firestore.Query.DESCENDING).limit(10).stream():
    d = doc.to_dict()
    print(f"   {d.get('nombre')}: {d.get('asistenciasTotales')}")

print("\n🎉 ¡Completado!")