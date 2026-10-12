#!/usr/bin/env python3
"""Recalcular totales usando attendance.csv (resumen oficial) como fuente de verdad"""

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

def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

# 1. FECHAS HABILITADAS
enabled_dates = set()
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/config.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        fecha = (row.get('Fecha') or '').strip()
        hay = (row.get('Hay_Asamblea') or '0').strip()
        if hay in ('1.0', '1'): enabled_dates.add(fecha)

# 2. ATTENDANCE.CSV (resumen oficial - YA DEDUPLICADO Y UNIFICADO)
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
excel_fechas = {}  # nombre -> set(fechas)
for row in attendance:
    nombre = (row.get('Nombre') or '').strip()
    if not nombre or nombre == 'Total de asistentes:': continue
    fechas_set = set()
    total = 0
    for col_idx, fecha in fecha_cols:
        header_name = headers[col_idx]
        try:
            valor = float(row.get(header_name, '0') or '0')
        except: valor = 0
        if valor >= 1:
            total += 1
            fechas_set.add(fecha)
    excel_totals[nombre] = total
    excel_fechas[nombre] = fechas_set

print(f"Nombres en attendance.csv: {len(excel_totals)}")

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

print(f"Miembros en Firestore: {len(firestore_members)}")

# 4. MAPEAR EXCEL NOMBRE -> UID FIRESTORE (fuzzy + manual)
excel_norm = {normalize(k): k for k in excel_totals.keys()}
fs_norm = {normalize(k): k for k in firestore_members.keys()}

# Mapeos manuales para casos difíciles
manual_map = {
    'gabrielrevoller': 'Gabriel Revollar',  # log tiene Revollar/Revoller, excel tiene Revollar
    'kayrelsuasnabar': 'Kayrel Suasnabar',  # log tiene kayrel/Kayrel, excel tiene Kayrel
    'diego': 'Diego García',  # excel tiene "Diego" y "Diego García" - son el mismo
    'mariafe': 'María Fé',
}

asistencia_por_uid = {}
matched = 0
unmatched_excel = []

for excel_norm_name, excel_orig_name in excel_norm.items():
    total = excel_totals[excel_orig_name]
    fechas = excel_fechas[excel_orig_name]

    # Buscar match
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
        matched += 1
    else:
        unmatched_excel.append(excel_orig_name)

print(f"Matched: {matched}")
print(f"En Excel NO matched en Firestore: {len(unmatched_excel)}")
for n in sorted(unmatched_excel): print(f"   - {n}: {excel_totals[n]}")

# 5. ACTUALIZAR FIRESTORE EN BATCH
print("\n🔢 Actualizando asistenciasTotales desde attendance.csv...")
batch = db.batch()
count = 0
updated = 0

for doc in db.collection('members').stream():
    uid = doc.id
    data = asistencia_por_uid.get(uid, {'total': 0, 'fechas': set()})
    total = data['total']
    fechas = data['fechas']

    ultima = max(fechas) if fechas else None

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

# 6. CREAR MIEMBROS FALTANTES (María Fé, etc.)
print("\n➕ Creando miembros faltantes del Excel...")
existing_norm = set(fs_norm.keys())
for excel_orig_name in excel_totals:
    if normalize(excel_orig_name) not in existing_norm:
        # Buscar datos en members.csv
        member_data = None
        with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/members.csv', 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if (row.get('Nombres ') or '').strip() == excel_orig_name:
                    member_data = row
                    break

        if member_data:
            email = (member_data.get('Correo') or '').strip().lower()
            foto = (member_data.get('Codigo Foto') or '').strip()
            foto_drive_id = ''
            if 'drive.google.com' in foto:
                m = re.search(r'[?&]id=([a-zA-Z0-9_-]{20,})', foto)
                if m: foto_drive_id = m.group(1)

            data = {
                'nombre': excel_orig_name,
                'name': excel_orig_name,
                'rol': 'miembro',
                'estadoAnioActual': 'activo',
                'email': email,
                'asistenciasTotales': excel_totals[excel_orig_name],
                'ultimaAsistencia': max(excel_fechas[excel_orig_name]) if excel_fechas[excel_orig_name] else None,
                'fotoDriveId': foto_drive_id,
            }
            if foto.startswith('http'): data['fotoThumb'] = foto
            if member_data.get('Fecha de Cumpleaños'):
                data['fechaNacimiento'] = member_data['Fecha de Cumpleaños'].split(' ')[0]

            db.collection('members').add(data)
            print(f"   ✅ Creado: {excel_orig_name} (total: {excel_totals[excel_orig_name]})")
        else:
            print(f"   ⚠️  No encontrado en members.csv: {excel_orig_name}")

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

print("\n🎉 ¡Completado!")