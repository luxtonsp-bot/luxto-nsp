#!/usr/bin/env python3
"""Simple test to verify Firebase connectivity"""

import firebase_admin
from firebase_admin import credentials, firestore

# Path to service account
cred_path = "/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/firebase-service-account.json"

try:
    # Initialize Firebase
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print("Firebase initialized successfully")

    # Try to access Firestore
    db = firestore.client()
    print("Firestore client obtained successfully")

    # Try to write a test document
    test_ref = db.collection('test').document('connection_test')
    test_ref.set({
        'message': 'Firebase connection test',
        'timestamp': firestore.SERVER_TIMESTAMP
    })
    print("Test document written successfully")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()