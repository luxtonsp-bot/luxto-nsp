#!/usr/bin/env python3
"""Corrección completa: limpiar fechas no habilitadas, mergear kayrel, crear faltantes, recalcular"""

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

# 1. FECHAS NO HABILITADAS CON DATOS EN FIRESTORE (eliminar)
fechas_no_habilitadas_con_datos = [
    '2026-04-04',  # Sábado de Gloria
    '2026-05-23',  # Pentecostés
    '2026-06-20',  # Día del Padre
    '2026-09-05',  # Novena
]

print("🗑️  Eliminando asistencia de fechas NO habilitadas...")
for fecha in fechas_no_habilitadas_con_datos:
    col = db.collection('asistencia').document('2026').collection(fecha)
    docs = list(col.stream())
    if docs:
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        print(f"   ✅ {fecha}: eliminados {len(docs)} documentos")
    else:
        print(f"   ℹ️  {fecha}: sin datos")

# 2. MERGEAR KAYREL SUASNABAR (minúsculas) → Kayrel Suasnabar (Excel)
print("\n🔀 Mergeando kayrel suasnabar → Kayrel Suasnabar...")
kayrel_lower_ref = db.collection('members').document('LHzZ99TAbqZRo0Ola0uJfgO0Gqg2')
kayrel_lower_doc = kayrel_lower_ref.get()

# Buscar Kayrel Suasnabar en Excel members.csv
kayrel_excel = None
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/members.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        if (row.get('Nombres ') or '').strip().lower() == 'kayrel suasnabar':
            kayrel_excel = row
            break

if kayrel_excel and kayrel_lower_doc.exists:
    # Actualizar nombre correcto y datos del Excel
    kayrel_lower_ref.update({
        'nombre': 'Kayrel Suasnabar',
        'name': 'Kayrel Suasnabar',
        'email': kayrel_excel.get('Correo', '').strip().lower() or 'ksuasnabarh@gmail.com',
        'fechaNacimiento': kayrel_excel.get('Fecha de Cumpleaños', '').split(' ')[0] if kayrel_excel.get('Fecha de Cumpleaños') else None,
    })
    print(f"   ✅ Actualizado: Kayrel Suasnabar (email: {kayrel_excel.get('Correo', 'N/A')})")
elif kayrel_lower_doc.exists:
    # Solo corregir nombre
    kayrel_lower_ref.update({'nombre': 'Kayrel Suasnabar', 'name': 'Kayrel Suasnabar'})
    print("   ✅ Nombre corregido a 'Kayrel Suasnabar'")
else:
    print("   ⚠️  kayrel suasnabar no existe en Firestore")

# 3. CREAR MIEMBROS FALTANTES DEL EXCEL (excepto Total de asistentes:)
print("\n➕ Creando miembros faltantes...")
existing_names = set()
for doc in db.collection('members').stream():
    d = doc.to_dict()
    if d.get('nombre'): existing_names.add(d['nombre'].strip().lower())

with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/members.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        excel_nombre = (row.get('Nombres ') or '').strip()
        if not excel_nombre or excel_nombre == 'Total de asistentes:': continue
        if excel_nombre.lower() in existing_names: continue

        # Crear nuevo miembro
        email = (row.get('Correo') or '').strip().lower()
        foto = (row.get('Codigo Foto') or '').strip()
        foto_drive_id = ''
        if 'drive.google.com' in foto:
            m = re.search(r'[?&]id=([a-zA-Z0-9_-]{20,})', foto)
            if m: foto_drive_id = m.group(1)

        data = {
            'nombre': excel_nombre,
            'name': excel_nombre,
            'rol': 'miembro',
            'estadoAnioActual': 'activo',
            'email': email,
            'asistenciasTotales': 0,
            'ultimaAsistencia': None,
            'fotoDriveId': foto_drive_id,
        }
        if foto.startswith('http'): data['fotoThumb'] = foto
        if row.get('Fecha de Cumpleaños'):
            data['fechaNacimiento'] = row['Fecha de Cumpleaños'].split(' ')[0]

        db.collection('members').add(data)
        print(f"   ✅ Creado: {excel_nombre} (email: {email or 'N/A'})")

# 4. RECALCULAR asistenciasTotales PARA TODOS (solo fechas habilitadas)
print("\n🔢 Recalculando asistenciasTotales...")

# Leer fechas habilitadas
enabled_dates = set()
with open('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/config.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        fecha = (row.get('Fecha') or '').strip()
        hay = (row.get('Hay_Asamblea') or '0').strip()
        if hay in ('1.0', '1'): enabled_dates.add(fecha)

# Contar asistencias por UID solo fechas habilitadas
asistencia_por_uid = {}
for col in db.collection('asistencia').document('2026').collections():
    fecha = col.id
    if fecha not in enabled_dates: continue
    for doc in col.stream():
        d = doc.to_dict()
        if d.get('presente'):
            uid = doc.id
            asistencia_por_uid[uid] = asistencia_por_uid.get(uid, 0) + 1

# Actualizar members
members_snap = db.collection('members').stream()
actualizados = 0
for doc in members_snap:
    uid = doc.id
    total = asistencia_por_uid.get(uid, 0)
    ultima = None
    if total > 0:
        # Buscar última fecha con asistencia
        fechas_uid = []
        for col in db.collection('asistencia').document('2026').collections():
            fecha = col.id
            if fecha not in enabled_dates: continue
            d = col.document(uid).get()
            if d.exists and d.to_dict().get('presente'):
                fechas_uid.append(fecha)
        if fechas_uid: ultima = max(fechas_uid)

    doc.reference.update({'asistenciasTotales': total, 'ultimaAsistencia': ultima})
    actualizados += 1
    if total > 0:
        nombre = doc.to_dict().get('nombre', uid)
        print(f"   {nombre}: {total} asistencias, última: {ultima}")

print(f"\n✅ Totales recalculados: {actualizados} miembros")

# 5. VERIFICACIÓN FINAL
print("\n🔍 Verificación final (top 10):")
for doc in db.collection('members').order_by('asistenciasTotales', direction=firestore.Query.DESCENDING).limit(10).stream():
    d = doc.to_dict()
    print(f"   {d.get('nombre')}: {d.get('asistenciasTotales')} asistencias")

print("\n🎉 Corrección completa!")