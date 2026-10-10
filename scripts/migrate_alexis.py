#!/usr/bin/env python3
"""Migrar asistencias de Alexis Sánchez desde Excel"""

import firebase_admin
from firebase_admin import credentials, firestore
import csv
import re
from datetime import datetime

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

# Leer attendance CSV
attendance = []
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance.csv', 'r') as f:
    reader = csv.DictReader(f)
    attendance = list(reader)

headers = list(attendance[0].keys())
fecha_cols = []
for i, h in enumerate(headers[1:-1], 1):
    f = parseExcelDate(h)
    if f: fecha_cols.append((i, f))

# Buscar fila de Alexis Sánchez
alexis_row = None
for row in attendance:
    if (row.get('Nombre') or '').strip() == 'Alexis Sánchez':
        alexis_row = row
        break

if not alexis_row:
    print("❌ No se encontró Alexis Sánchez en attendance.csv")
    exit(1)

print(f"Fila encontrada: {alexis_row['Nombre']}")

# Migrar cada fecha
batch = db.batch()
batch_count = 0
total = 0

for col_idx, fecha in fecha_cols:
    header_name = headers[col_idx]
    try:
        valor = float(alexis_row.get(header_name, '0') or '0')
    except: valor = 0

    if valor >= 1:
        doc_ref = db.collection('asistencia').document('2026').collection(fecha).document('L9YelrRhwkQrz9q7dA75WYENYNJ2')
        batch.set(doc_ref, {
            'uid': 'L9YelrRhwkQrz9q7dA75WYENYNJ2',
            'presente': True,
            'fecha': fecha,
            'timestamp': datetime.fromisoformat(f'{fecha}T16:00:00-05:00'),
            'tardanzaMinutos': 0,
            'esTardanza': False
        }, merge=True)
        total += 1
        batch_count += 1
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0
        print(f"   {fecha}: presente")

if batch_count > 0: batch.commit()

print(f"\n✅ Migradas {total} asistencias para Alexis Sánchez")

# Recalcular totales
asistencias = 0
ultima = None
for col in db.collection('asistencia').document('2026').collections():
    fecha = col.id
    doc = col.document('L9YelrRhwkQrz9q7dA75WYENYNJ2').get()
    if doc.exists and doc.to_dict().get('presente'):
        asistencias += 1
        if not ultima or fecha > ultima:
            ultima = fecha

db.collection('members').document('L9YelrRhwkQrz9q7dA75WYENYNJ2').update({
    'asistenciasTotales': asistencias,
    'ultimaAsistencia': ultima
})
print(f"✅ Totales actualizados: asistenciasTotales={asistencias}, ultimaAsistencia={ultima}")