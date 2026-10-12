#!/usr/bin/env python3
"""Test Firebase Storage connectivity"""

import firebase_admin
from firebase_admin import credentials, storage

# Path to service account
cred_path = "/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/firebase-service-account.json"

try:
    # Initialize Firebase WITHOUT storageBucket (we'll specify it when getting bucket)
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        print("Firebase initialized successfully")

    # Try to get the bucket by specifying the name explicitly
    bucket_name = "luxto-nsp.firebasestorage.app"
    bucket = storage.bucket(name=bucket_name)
    print(f"Bucket obtained: {bucket.name}")

    # Try to get a blob (file) reference and check if we can upload a small test file
    test_blob = bucket.blob("test/connection_test.txt")
    print(f"Testing upload to: {test_blob.name}")
    test_blob.upload_from_string("Firebase Storage connection test")
    print("Test file uploaded successfully")

    # Make it publicly readable (optional)
    test_blob.make_public()
    print(f"Public URL: {test_blob.public_url}")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()