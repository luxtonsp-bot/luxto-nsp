#!/usr/bin/env python3
"""Test to get Firebase project info"""

import firebase_admin
from firebase_admin import credentials

# Path to service account
cred_path = "/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/firebase-service-account.json"

try:
    # Initialize Firebase
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print("Firebase initialized successfully")

    # Try to get app info
    from firebase_admin import app as firebase_app
    app = firebase_app.get_app()
    print(f"App name: {app.name}")
    print(f"App project ID: {app.project_id}")

    # Try to get service account info (this might not work directly)
    # But we can at least verify the credentials loaded correctly

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()