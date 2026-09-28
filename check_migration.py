#!/usr/bin/env python3
"""Check what was migrated to Firestore"""

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

    # Get Firestore client
    db = firestore.client()

    # Get all members
    members_ref = db.collection('members')
    members = members_ref.stream()

    count = 0
    print("Members in Firestore:")
    print("=" * 80)
    for member in members:
        count += 1
        data = member.to_dict()
        print(f"UID: {member.id}")
        print(f"  Name: {data.get('name', 'N/A')}")
        print(f"  Email: {data.get('email', 'N/A')}")
        print(f"  Role: {data.get('rol', 'N/A')}")
        print(f"  Status: {data.get('estadoAnioActual', 'N/A')}")
        if 'birthDate' in data:
            print(f"  Birth Date: {data['birthDate']}")
        if 'fotoDriveId' in data:
            foto_val = data['fotoDriveId']
            if foto_val:
                print(f"  Foto Reference: {foto_val[:60]}{'...' if len(foto_val) > 60 else ''}")
            else:
                print(f"  Foto Reference: (empty)")
        print()

    print(f"Total members in Firestore: {count}")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()