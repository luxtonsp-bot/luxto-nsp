#!/usr/bin/env python3
"""Fix duplicados: Ricardo Castañeda→Mantilla, Alexis Sanchez→Sánchez"""

import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-b80cad13e2.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

print("🔧 Fixing duplicados...\n")

# 1. RICARDO: Eliminar Castañeda, mantener Mantilla
print("1️⃣ Ricardo Castañeda → Ricardo Mantilla")
castañeda_ref = db.collection('members').document('34D5BE2F24774949BFD0')
castañeda_doc = castañeda_ref.get()
if castañeda_doc.exists:
    print(f"   Eliminando Ricardo Castañeda (UID: 34D5BE2F24774949BFD0)")
    castañeda_ref.delete()
    print("   ✅ Eliminado")
else:
    print("   Ya no existe")

mantilla_ref = db.collection('members').document('Yv5QmDMMTORVzURlLsaE9m7uDff1')
mantilla_doc = mantilla_ref.get()
if mantilla_doc.exists:
    d = mantilla_doc.to_dict()
    print(f"   Manteniendo Ricardo Mantilla: asistenciasTotales={d.get('asistenciasTotales')}, email={d.get('email')}")

# 2. ALEXIS: Actualizar nombre a "Alexis Sánchez" (con tilde) y recalcular
print("\n2️⃣ Alexis Sanchez → Alexis Sánchez")
alexis_ref = db.collection('members').document('L9YelrRhwkQrz9q7dA75WYENYNJ2')
alexis_doc = alexis_ref.get()
if alexis_doc.exists:
    d = alexis_doc.to_dict()
    print(f"   Actual: nombre='{d.get('nombre')}', asistenciasTotales={d.get('asistenciasTotales')}")

    # Actualizar nombre con tilde
    alexis_ref.update({'nombre': 'Alexis Sánchez', 'name': 'Alexis Sánchez'})
    print("   ✅ Nombre actualizado a 'Alexis Sánchez'")

    # Recalcular asistencias desde histórico (buscar en asistencia/2026/)
    print("   Recalculando asistencias desde histórico...")
    asistencias = 0
    ultima = None
    for col in db.collection('asistencia').document('2026').collections():
        fecha = col.id
        doc = col.document('L9YelrRhwkQrz9q7dA75WYENYNJ2').get()
        if doc.exists and doc.to_dict().get('presente'):
            asistencias += 1
            if not ultima or fecha > ultima:
                ultima = fecha

    alexis_ref.update({'asistenciasTotales': asistencias, 'ultimaAsistencia': ultima})
    print(f"   ✅ Recalculado: asistenciasTotales={asistencias}, ultimaAsistencia={ultima}")

# 3. Verificar que no quede "Alexis Sánchez" duplicado
print("\n3️⃣ Verificando duplicados Alexis...")
for doc in db.collection('members').where('nombre', '==', 'Alexis Sánchez').stream():
    if doc.id != 'L9YelrRhwkQrz9q7dA75WYENYNJ2':
        print(f"   ⚠️ Duplicado encontrado: {doc.id} - ELIMINANDO")
        doc.reference.delete()

print("\n✅ Fix completado")