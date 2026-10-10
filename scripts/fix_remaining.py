#!/usr/bin/env python3
"""Completar fixes pendientes: recálculo batch, eliminar duplicados"""

import firebase_admin
from firebase_admin import credentials, firestore
import csv
import re

cred = credentials.Certificate('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-b80cad13e2.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

# 1. ELIMINAR DUPLICADOS CREADOS ERRÓNEAMENTE
print("🗑️  Eliminando duplicados...")

# Alexis Sanchez (sin tilde) - duplicado de Alexis Sánchez (con tilde)
for doc in db.collection('members').where('nombre', '==', 'Alexis Sanchez').stream():
    print(f"   Eliminando Alexis Sanchez (sin tilde): {doc.id}")
    doc.reference.delete()

# Ricardo Castañeda - duplicado sin email, ya tenemos a Ricardo Mantilla
for doc in db.collection('members').where('nombre', '==', 'Ricardo Castañeda').stream():
    print(f"   Eliminando Ricardo Castañeda (duplicado): {doc.id}")
    doc.reference.delete()

# 2. FECHAS HABILITADAS
enabled_dates = set()
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/config.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        fecha = (row.get('Fecha') or '').strip()
        hay = (row.get('Hay_Asamblea') or '0').strip()
        if hay in ('1.0', '1'): enabled_dates.add(fecha)

# 3. CONTAR ASISTENCIAS POR UID (BATCH READ)
print("\n📊 Contando asistencias por UID...")
asistencia_por_uid = {}
fechas_con_datos = []

for col in db.collection('asistencia').document('2026').collections():
    fecha = col.id
    if fecha not in enabled_dates: continue
    docs = list(col.stream())
    if docs:
        fechas_con_datos.append(fecha)
        for doc in docs:
            d = doc.to_dict()
            if d.get('presente'):
                uid = doc.id
                asistencia_por_uid[uid] = asistencia_por_uid.get(uid, 0) + 1

print(f"Fechas con datos: {len(fechas_con_datos)}")
for f in sorted(fechas_con_datos): print(f"   {f}")

# 4. ACTUALIZAR TOTALES EN BATCHES
print("\n🔢 Actualizando asistenciasTotales en batches...")
batch = db.batch()
count = 0
updated = 0

members_snap = list(db.collection('members').stream())
print(f"Total members: {len(members_snap)}")

for doc in members_snap:
    uid = doc.id
    total = asistencia_por_uid.get(uid, 0)

    # Buscar última fecha
    ultima = None
    if total > 0:
        for fecha in sorted(fechas_con_datos, reverse=True):
            d = db.collection('asistencia').document('2026').collection(fecha).document(uid).get()
            if d.exists and d.to_dict().get('presente'):
                ultima = fecha
                break

    batch.update(doc.reference, {'asistenciasTotales': total, 'ultimaAsistencia': ultima})
    count += 1
    updated += 1

    if count >= 400:
        batch.commit()
        print(f"   Batch committed: {updated}/{len(members_snap)}")
        batch = db.batch()
        count = 0

if count > 0:
    batch.commit()
    print(f"   Final batch committed: {updated}/{len(members_snap)}")

print(f"\n✅ Totales actualizados: {updated} miembros")

# 5. VERIFICACIÓN FINAL
print("\n🔍 Verificación final (comparando con Excel fechas habilitadas):")

# Leer Excel totales (solo fechas habilitadas)
def parseExcelDate(cell):
    if not cell: return None
    s = str(cell).strip()
    if re.match(r'^\d{2}/\d{2}$', s):
        d, m = s.split('/')
        return f"2026-{m.zfill(2)}-{d.zfill(2)}"
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s.split(' ')[0]
    return None

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
firestore_members = {}
for doc in db.collection('members').stream():
    d = doc.to_dict()
    nombre = d.get('nombre', '').strip()
    if nombre:
        firestore_members[nombre] = d.get('asistenciasTotales', 0)

matches = 0
mismatches = 0
all_names = set(excel_totals.keys()) | set(firestore_members.keys())

print(f"\n{'NOMBRE':<30} {'EXCEL':>6} {'FIRESTORE':>10} {'DIFF':>6} {'STATUS'}")
print("="*70)

for nombre in sorted(all_names):
    excel_total = excel_totals.get(nombre, 0)
    fs_total = firestore_members.get(nombre, 0)
    diff = excel_total - fs_total
    if diff == 0:
        status = "✅"
        matches += 1
    else:
        status = f"❌ {diff}"
        mismatches += 1
    print(f"{nombre:<30} {excel_total:>6} {fs_total:>10} {diff:>6} {status}")

print("="*70)
print(f"✅ Coinciden: {matches} | ❌ Diferencias: {mismatches}")

# Top 10
print("\n🏆 Top 10 asistencias:")
for doc in db.collection('members').order_by('asistenciasTotales', direction=firestore.Query.DESCENDING).limit(10).stream():
    d = doc.to_dict()
    print(f"   {d.get('nombre')}: {d.get('asistenciasTotales')}")

print("\n🎉 Completado!")