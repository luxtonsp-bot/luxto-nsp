#!/usr/bin/env python3
"""Verificación correcta: solo 34 fechas habilitadas en Configuracion"""

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

# 1. LEER CONFIGURACION - SOLO FECHAS CON HAY_ASAMBLEA=1
enabled_dates = set()
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/config.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        fecha = (row.get('Fecha') or '').strip()
        hay = (row.get('Hay_Asamblea') or '0').strip()
        if hay == '1.0' or hay == '1':
            enabled_dates.add(fecha)

print(f"📅 Fechas habilitadas en Configuracion: {len(enabled_dates)}")
for f in sorted(enabled_dates): print(f"   {f}")

# 2. LEER EXCEL ASISTENCIA - SOLO FECHAS HABILITADAS
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

print(f"\n📊 Columnas de asistencia que coinciden con habilitadas: {len(fecha_cols)}")

# Calcular totales Excel SOLO fechas habilitadas
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

# 4. RECALCULAR FIRESTORE HISTÓRICO SOLO FECHAS HABILITADAS
firestore_hist = {}
for col in db.collection('asistencia').document('2026').collections():
    fecha = col.id
    if fecha not in enabled_dates: continue
    for doc in col.stream():
        d = doc.to_dict()
        if d.get('presente'):
            uid = doc.id
            firestore_hist[uid] = firestore_hist.get(uid, 0) + 1

uid_to_nombre = {v['uid']: k for k, v in firestore_members.items()}

# 5. COMPARAR EXCEL vs FIRESTORE HISTÓRICO (solo fechas habilitadas)
print(f"\n{'NOMBRE':<30} {'EXCEL':>6} {'FS_HIST':>10} {'FS_TOTAL':>10} {'DIFF':>6} {'STATUS'}")
print("="*80)

matches = 0
mismatches = 0
all_names = set(excel_totals.keys()) | set(firestore_members.keys())

for nombre in sorted(all_names):
    excel_total = excel_totals.get(nombre, 0)
    fs_data = firestore_members.get(nombre)

    if fs_data:
        fs_total = fs_data['asistenciasTotales']
        uid = fs_data['uid']
        fs_hist = firestore_hist.get(uid, 0)

        diff = excel_total - fs_hist
        if diff == 0:
            status = "✅ OK"
            matches += 1
        else:
            status = f"❌ DIFF {diff}"
            mismatches += 1
        print(f"{nombre:<30} {excel_total:>6} {fs_hist:>10} {fs_total:>10} {diff:>6} {status}")
    else:
        print(f"{nombre:<30} {excel_total:>6} {'N/A':>10} {'N/A':>10} {'N/A':>6} ❌ NO EN FIRESTORE")
        mismatches += 1

print("="*80)
print(f"✅ Coinciden PERFECTO: {matches} | ❌ Diferencias: {mismatches}")

# 6. NOMBRES EN FIRESTORE PERO NO EN EXCEL
print("\n📋 En Firestore pero NO en Excel:")
for nombre, data in firestore_members.items():
    if nombre not in excel_totals:
        print(f"   - {nombre} (uid: {data['uid']}, total: {data['asistenciasTotales']})")

# 7. FECHAS EN FIRESTORE VS HABILITADAS
print("\n📅 Fechas en Firestore vs Habilitadas:")
for col in db.collection('asistencia').document('2026').collections():
    fecha = col.id
    docs = list(col.stream())
    presentes = sum(1 for d in docs if d.to_dict().get('presente'))
    if presentes > 0:
        marker = " ✅" if fecha in enabled_dates else " ❌ NO HABILITADA"
        print(f"   {fecha}: {presentes} presentes{marker}")

# 8. Verificar que TODAS las habilitadas están en Firestore
print("\n📅 Fechas habilitadas SIN datos en Firestore:")
for fecha in sorted(enabled_dates):
    col = db.collection('asistencia').document('2026').collection(fecha)
    docs = list(col.stream())
    presentes = sum(1 for d in docs if d.to_dict().get('presente'))
    if presentes == 0:
        print(f"   ❌ {fecha}: SIN DATOS (debería tener asistencia)")