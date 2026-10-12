#!/usr/bin/env python3
"""
RECONCILIACIÓN COMPLETA - Python + firebase-admin
Migra TODA la asistencia histórica del Excel, fotos, y recalcula totales.
"""

import firebase_admin
from firebase_admin import credentials, firestore
import csv
import re
from datetime import datetime

# Inicializar Firebase Admin
cred = credentials.Certificate('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-b80cad13e2.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

def log(msg, level='info'):
    prefix = {'info': '🔄', 'ok': '✅', 'warn': '⚠️', 'err': '❌'}.get(level, '🔄')
    print(f"{prefix} {msg}")

def convertirUrlDrive(url):
    if not url: return ""
    if "drive.google.com/thumbnail" in url: return url
    m = re.search(r'[?&]id=([a-zA-Z0-9_-]{20,})', url) or re.search(r'/d/([a-zA-Z0-9_-]{20,})', url) or re.search(r'/file/d/([a-zA-Z0-9_-]{20,})', url)
    if m: return f"https://drive.google.com/thumbnail?id={m.group(1)}&sz=w400"
    return url

def parseExcelDate(cell):
    if not cell: return None
    s = str(cell).strip()
    if re.match(r'^\d{2}/\d{2}$', s):
        d, m = s.split('/')
        return f"2026-{m.zfill(2)}-{d.zfill(2)}"
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s.split(' ')[0]
    return None

def parseCsv(path):
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader)

def main():
    log("Iniciando reconciliación completa (Python)...")

    # 1. LEER CSVs
    members = parseCsv('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/members.csv')
    attendance = parseCsv('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance.csv')
    log(f"Excel members: {len(members)} | attendance: {len(attendance)}")

    # 2. FIRESTORE MEMBERS → maps
    firestore_members_email = {}
    firestore_members_name = {}
    for doc in db.collection('members').stream():
        d = doc.to_dict()
        if d.get('email'): firestore_members_email[d['email'].lower().strip()] = (doc.id, d)
        if d.get('nombre'): firestore_members_name[d['nombre'].lower().strip()] = (doc.id, d)
    log(f"Firestore: {len(firestore_members_email)} con email, {len(firestore_members_name)} con nombre")

    # 3. MAPEAR EXCEL → FIRESTORE
    member_map = {}  # excel_nombre -> {uid, email, fotoThumb, fotoDriveId}
    mapped = unmapped = 0
    for em in members:
        excel_nombre = (em.get('Nombres ') or '').strip()
        excel_email = (em.get('Correo') or '').strip().lower()
        excel_foto = (em.get('Codigo Foto') or '').strip()
        excel_uid = (em.get('Columna 1') or '').strip()
        if not excel_nombre: continue

        match = None
        if excel_email and excel_email in firestore_members_email:
            match = firestore_members_email[excel_email]
        elif excel_nombre.lower() in firestore_members_name:
            match = firestore_members_name[excel_nombre.lower()]
        elif excel_uid:
            doc = db.collection('members').document(excel_uid).get()
            if doc.exists: match = (doc.id, doc.to_dict())

        if match:
            uid, _ = match
            foto_drive_id = ''
            if 'drive.google.com' in excel_foto:
                m = re.search(r'[?&]id=([a-zA-Z0-9_-]{20,})', excel_foto)
                if m: foto_drive_id = m.group(1)
            member_map[excel_nombre] = {
                'uid': uid,
                'email': excel_email,
                'fotoThumb': excel_foto if excel_foto.startswith('http') else '',
                'fotoDriveId': foto_drive_id
            }
            mapped += 1
        else:
            log(f'Sin mapear: "{excel_nombre}" (email: {excel_email or "N/A"})', 'warn')
            unmapped += 1
    log(f"Mapeados: {mapped} | Sin mapear: {unmapped}", 'ok' if mapped else 'err')

    # 4. FECHAS EN EXCEL
    headers = list(attendance[0].keys()) if attendance else []
    fecha_cols = []
    for i, h in enumerate(headers[1:-1], 1):  # excluir 'Nombre' y 'Total'
        f = parseExcelDate(h)
        if f: fecha_cols.append((i, f))
    log(f"Fechas detectadas: {len(fecha_cols)}", 'ok')
    for _, f in fecha_cols: log(f"   {f}")

    # 5. MIGRAR ASISTENCIA HISTÓRICA
    log("\nMigrando asistencia histórica...")
    total_written = 0
    asistencia_por_uid = {}  # uid -> set(fechas)

    batch = db.batch()
    batch_count = 0

    for col_idx, fecha in fecha_cols:
        header_name = headers[col_idx]
        escritos_fecha = 0
        for row in attendance:
            excel_nombre = (row.get('Nombre') or '').strip()
            if not excel_nombre: continue
            map_entry = member_map.get(excel_nombre)
            if not map_entry: continue

            try:
                valor = float(row.get(header_name, '0') or '0')
            except: valor = 0
            if valor >= 1:
                uid = map_entry['uid']
                doc_ref = db.collection('asistencia').document('2026').collection(fecha).document(uid)
                batch.set(doc_ref, {
                    'uid': uid, 'presente': True, 'fecha': fecha,
                    'timestamp': datetime.fromisoformat(f'{fecha}T16:00:00-05:00'),
                    'tardanzaMinutos': 0, 'esTardanza': False
                }, merge=True)
                if uid not in asistencia_por_uid: asistencia_por_uid[uid] = set()
                asistencia_por_uid[uid].add(fecha)
                escritos_fecha += 1
                total_written += 1
                batch_count += 1
                if batch_count >= 400: batch.commit(); batch = db.batch(); batch_count = 0
        log(f"   {fecha}: {escritos_fecha} registros")

    if batch_count > 0: batch.commit()
    log(f"\nTotal asistencia migrada: {total_written} documentos", 'ok')

    # 6. MIGRAR FOTOS
    log("\nMigrando fotos a members...")
    fotos_actualizadas = 0
    for excel_nombre, entry in member_map.items():
        uid = entry['uid']
        updates = {}
        if entry['fotoThumb']: updates['fotoThumb'] = entry['fotoThumb']
        if entry['fotoDriveId']: updates['fotoDriveId'] = entry['fotoDriveId']
        if updates:
            db.collection('members').document(uid).update(updates)
            fotos_actualizadas += 1
    log(f"Fotos actualizadas: {fotos_actualizadas}", 'ok')

    # 7. RECALCULAR asistenciasTotales
    log("\nRecalculando asistenciasTotales...")
    totales_actualizados = 0
    for uid, fechas in asistencia_por_uid.items():
        total = len(fechas)
        ultima = max(fechas) if fechas else None
        db.collection('members').document(uid).update({
            'asistenciasTotales': total,
            'ultimaAsistencia': ultima
        })
        totales_actualizados += 1
        log(f"   {uid}: {total} asistencias totales")

    # Members sin historial → 0
    for doc in db.collection('members').stream():
        if doc.id not in asistencia_por_uid:
            doc.reference.update({'asistenciasTotales': 0, 'ultimaAsistencia': None})
            totales_actualizados += 1
    log(f"\nTotales recalculados: {totales_actualizados} miembros", 'ok')

    # 8. VERIFICACIÓN
    log("\nVerificación (muestra):")
    test_names = ['Bryan Ballon', 'Diego García', 'Gianfranco Camones', 'Maje Roncal', 'Paolo Alfaro', 'Ricardo Mantilla']
    for nombre in test_names:
        entry = member_map.get(nombre)
        if entry:
            doc = db.collection('members').document(entry['uid']).get()
            d = doc.to_dict() if doc.exists else {}
            asistio = len(asistencia_por_uid.get(entry['uid'], set()))
            foto_ok = 'OK' if d.get('fotoThumb') else 'NO'
            log(f"   {nombre}: asistenciasTotales={d.get('asistenciasTotales',0)}, calculado={asistio}, foto={foto_ok}", 'ok')
        else:
            log(f"   {nombre}: NO MAPEADO", 'warn')

    log("\n🎉 ¡RECONCILIACIÓN COMPLETA!", 'ok')

if __name__ == '__main__':
    main()