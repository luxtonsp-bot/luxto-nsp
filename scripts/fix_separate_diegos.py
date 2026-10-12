#!/usr/bin/env python3
"""Revertir unificación: Diego y Diego García son personas diferentes"""

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

# 2. ATTENDANCE.CSV - tal cual (sin unificar)
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

excel_fechas = {}
for row in attendance:
    nombre = (row.get('Nombre') or '').strip()
    if not nombre or nombre == 'Total de asistentes:': continue
    fechas_set = set()
    for col_idx, fecha in fecha_cols:
        header_name = headers[col_idx]
        try:
            valor = float(row.get(header_name, '0') or '0')
        except: valor = 0
        if valor >= 1:
            fechas_set.add(fecha)
    excel_fechas[nombre] = fechas_set

excel_totals = {k: len(v) for k, v in excel_fechas.items()}

# 3. FIRESTORE MEMBERS
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

# 4. CREAR "Diego" como miembro nuevo (tiene 1 asistencia en Excel)
if 'Diego' in excel_totals and 'Diego' not in firestore_members:
    total = excel_totals['Diego']
    fechas = excel_fechas['Diego']
    ultima = max(fechas) if fechas else None

    data = {
        'nombre': 'Diego',
        'name': 'Diego',
        'rol': 'miembro',
        'estadoAnioActual': 'activo',
        'email': '',
        'asistenciasTotales': total,
        'ultimaAsistencia': ultima,
        'fotoDriveId': '',
    }
    db.collection('members').add(data)
    print(f"✅ Creado: Diego (total: {total}, fechas: {sorted(fechas)})")

# 5. ACTUALIZAR TODOS (incluyendo Diego García que ya existe)
def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

excel_norm = {normalize(k): k for k in excel_totals.keys()}
fs_norm = {normalize(k): k for k in firestore_members.keys()}

# Re-leer members después de crear Diego
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
fs_norm = {normalize(k): k for k in firestore_members.keys()}

manual_map = {
    'gabrielrevoller': 'Gabriel Revollar',
    'kayrelsuasnabar': 'Kayrel Suasnabar',
    'mariafe': 'María Fé',
    'sofia': 'Sofia',
}

asistencia_por_uid = {}
for excel_norm_name, excel_orig_name in excel_norm.items():
    total = excel_totals[excel_orig_name]
    fechas = excel_fechas[excel_orig_name]

    fs_orig = None
    if excel_norm_name in fs_norm:
        fs_orig = fs_norm[excel_norm_name]
    elif excel_norm_name in manual_map:
        mapped = manual_map[excel_norm_name]
        if mapped in firestore_members:
            fs_orig = mapped

    if fs_orig:
        uid = firestore_members[fs_orig]['uid']
        asistencia_por_uid[uid] = {'total': total, 'fechas': fechas}
    else:
        print(f"⚠️  Sin match: {excel_orig_name} ({total})")

# 6. ACTUALIZAR EN BATCH
print("\n🔢 Actualizando todos...")
batch = db.batch()
for doc in db.collection('members').stream():
    uid = doc.id
    data = asistencia_por_uid.get(uid, {'total': 0, 'fechas': set()})
    total = data['total']
    fechas = data['fechas']
    ultima = max(fechas) if fechas else None
    batch.update(doc.reference, {'asistenciasTotales': total, 'ultimaAsistencia': ultima})
batch.commit()
print("   ✅ Actualizados")

# 7. VERIFICACIÓN FINAL
print("\n🔍 Verificación final...")

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

# Top 10
print("\n🏆 Top 10 asistencias:")
for doc in db.collection('members').order_by('asistenciasTotales', direction=firestore.Query.DESCENDING).limit(10).stream():
    d = doc.to_dict()
    print(f"   {d.get('nombre')}: {d.get('asistenciasTotales')}")

print(f"\n📊 Total miembros en Firestore: {len(firestore_final)}")
print("🎉 ¡Completado!")