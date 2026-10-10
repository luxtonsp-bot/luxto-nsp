#!/usr/bin/env python3
"""Verificación exhaustiva: Excel vs Firestore por cada miembro"""

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

# 1. LEER EXCEL ASISTENCIA
attendance = []
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance.csv', 'r') as f:
    reader = csv.DictReader(f)
    attendance = list(reader)

headers = list(attendance[0].keys())
fecha_cols = []
for i, h in enumerate(headers[1:-1], 1):
    f = parseExcelDate(h)
    if f: fecha_cols.append((i, f))

# Calcular totales por nombre desde Excel
excel_totals = {}
for row in attendance:
    nombre = (row.get('Nombre') or '').strip()
    if not nombre: continue
    total = 0
    for col_idx, fecha in fecha_cols:
        header_name = headers[col_idx]
        try:
            valor = float(row.get(header_name, '0') or '0')
        except: valor = 0
        if valor >= 1: total += 1
    excel_totals[nombre] = total

print(f"📊 Excel: {len(excel_totals)} nombres con asistencias")

# 2. LEER FIRESTORE MEMBERS
firestore_members = {}
for doc in db.collection('members').stream():
    d = doc.to_dict()
    nombre = d.get('nombre', '').strip()
    if nombre:
        firestore_members[nombre] = {
            'uid': doc.id,
            'asistenciasTotales': d.get('asistenciasTotales', 0),
            'email': d.get('email', ''),
            'foto': d.get('fotoThumb') or d.get('fotoDriveId') or 'NO'
        }

print(f"🔥 Firestore members: {len(firestore_members)}")

# 3. LEER ASISTENCIA FIRESTORE POR FECHA (recalcular por UID)
firestore_attendance = {}
for col in db.collection('asistencia').document('2026').collections():
    fecha = col.id
    for doc in col.stream():
        d = doc.to_dict()
        if d.get('presente'):
            uid = doc.id
            if uid not in firestore_attendance:
                firestore_attendance[uid] = 0
            firestore_attendance[uid] += 1

# Mapear UID → nombre desde members
uid_to_nombre = {v['uid']: k for k, v in firestore_members.items()}

# 4. COMPARAR
print("\n" + "="*80)
print(f"{'NOMBRE':<30} {'EXCEL':>6} {'FIRESTORE':>10} {'DIFF':>6} {'STATUS'}")
print("="*80)

all_names = set(excel_totals.keys()) | set(firestore_members.keys())
mismatches = 0
matches = 0
missing_in_firestore = []
missing_in_excel = []

for nombre in sorted(all_names):
    excel_total = excel_totals.get(nombre, 0)
    fs_data = firestore_members.get(nombre)

    if fs_data:
        fs_total = fs_data['asistenciasTotales']
        # También verificar contra asistencia histórica real
        uid = fs_data['uid']
        hist_total = firestore_attendance.get(uid, 0)

        diff = excel_total - fs_total
        hist_diff = excel_total - hist_total

        if diff == 0 and hist_diff == 0:
            status = "✅ OK"
            matches += 1
        else:
            status = f"❌ DIFF (excel:{excel_total} fs:{fs_total} hist:{hist_total})"
            mismatches += 1
            print(f"{nombre:<30} {excel_total:>6} {fs_total:>10} {diff:>6} {status}")
    else:
        missing_in_firestore.append(nombre)
        print(f"{nombre:<30} {excel_total:>6} {'N/A':>10} {'N/A':>6} ❌ NO EN FIRESTORE")
        mismatches += 1

# Nombres en Firestore pero no en Excel
for nombre in sorted(firestore_members.keys()):
    if nombre not in excel_totals:
        missing_in_excel.append(nombre)
        fs_data = firestore_members[nombre]
        print(f"{nombre:<30} {'N/A':>6} {fs_data['asistenciasTotales']:>10} {'N/A':>6} ❌ NO EN EXCEL")
        mismatches += 1

print("="*80)
print(f"✅ Coinciden: {matches} | ❌ Diferencias: {mismatches}")

if missing_in_firestore:
    print(f"\n📋 En Excel pero NO en Firestore ({len(missing_in_firestore)}):")
    for n in missing_in_firestore: print(f"   - {n}")

if missing_in_excel:
    print(f"\n📋 En Firestore pero NO en Excel ({len(missing_in_excel)}):")
    for n in missing_in_excel: print(f"   - {n} (uid: {firestore_members[n]['uid']}, total: {firestore_members[n]['asistenciasTotales']})")

# 5. VERIFICAR FOTOS
print("\n🖼️  FOTOS:")
with_photo = sum(1 for v in firestore_members.values() if v['foto'] != 'NO')
print(f"   Con foto: {with_photo}/{len(firestore_members)}")
without_photo = [k for k, v in firestore_members.items() if v['foto'] == 'NO']
print(f"   Sin foto: {len(without_photo)}")
for n in sorted(without_photo)[:20]:
    print(f"      - {n}")
if len(without_photo) > 20: print(f"      ... y {len(without_photo)-20} más")