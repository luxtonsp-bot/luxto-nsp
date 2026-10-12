#!/usr/bin/env python3
"""
Migration script: members and photos from Google Sheets/Drive to Firebase Firestore and Storage.
Expects:
- CSV file: migration/sheets_export/members.csv with columns:
    uid, name, email, birthDate (YYYY-MM-DD), photoDriveId (optional), generation, etc.
- Photos directory: migration/photos_export/ with files named <uid>.<ext> (or we can lookup by photoDriveId)
- Firebase service account JSON: migration/firebase-service-account.json
- Firebase Storage bucket: luxto-nsp.firebasestorage.app (default from project)

Writes to Firestore collection 'members' with fields:
    uid (doc id), name, email, birthDate (timestamp), fotoUrl (Storage download URL),
    rol (default 'miembro'), estadoAnioActual (default 'activo'), fechaIngresoGrupo (timestamp or date),
    generation (string), etc.
"""

import csv
import os
import sys
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore, storage

# Initialize Firebase Admin SDK
def initialize_firebase(cred_path):
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'storageBucket': 'luxto-nsp.firebasestorage.app'
        })

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    photos_dir = os.path.join(base_dir, 'photos_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    members_csv = os.path.join(sheets_dir, 'members.csv')

    if not os.path.isfile(members_csv):
        print(f"ERROR: Members CSV not found at {members_csv}")
        sys.exit(1)
    if not os.path.isdir(photos_dir):
        print(f"WARNING: Photos directory not found at {photos_dir}")
    if not os.path.isfile(cred_path):
        print(f"ERROR: Firebase service account not found at {cred_path}")
        print("Please download the Firebase service account JSON from the Firebase console and place it at:")
        print(f"  {cred_path}")
        sys.exit(1)

    print("Initializing Firebase...")
    try:
        initialize_firebase(cred_path)
    except Exception as e:
        print(f"ERROR: Failed to initialize Firebase: {e}")
        sys.exit(1)

    db = firestore.client()
    bucket = storage.bucket()

    print("Reading members CSV...")
    members_count = 0
    with open(members_csv, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            uid = row.get('uid', '').strip()
            if not uid:
                print(f"Skipping row with missing uid: {row}")
                continue
            name = row.get('name', '').strip()
            email = row.get('email', '').strip()
            birth_date_str = row.get('birthDate', '').strip()
            generation = row.get('generation', '').strip()
            ingreso_str = row.get('fechaIngresoGrupo', '').strip()

            # Prepare member data
            member_data = {
                'name': name,
                'email': email,
                'rol': 'miembro',  # default, can be updated later by admin
                'estadoAnioActual': 'activo',  # default
                'generation': generation,
            }

            # Convert birthDate to Firestore timestamp if present
            if birth_date_str:
                try:
                    # Assuming format YYYY-MM-DD
                    dt = datetime.strptime(birth_date_str, '%Y-%m-%d')
                    # Create a Firestore timestamp from datetime (at midnight UTC)
                    member_data['birthDate'] = firestore.firestore.Timestamp.from_datetime(dt)
                except ValueError:
                    print(f"WARNING: Invalid birthDate format for uid {uid}: {birth_date_str}")
                    # Store as string fallback (not ideal)
                    member_data['birthDate'] = birth_date_str

            # Fecha ingreso grupo (optional)
            if ingreso_str:
                try:
                    dt_ingreso = datetime.strptime(ingreso_str, '%Y-%m-%d')
                    member_data['fechaIngresoGrupo'] = firestore.firestore.Timestamp.from_datetime(dt_ingreso)
                except ValueError:
                    print(f"WARNING: Invalid fechaIngresoGrupo format for uid {uid}: {ingreso_str}")
                    member_data['fechaIngresoGrupo'] = ingreso_str  # fallback

            # Handle photo
            foto_url = None
            # Try to find photo by uid in photos directory
            found = False
            for ext in ['jpg', 'jpeg', 'png']:
                photo_path = os.path.join(photos_dir, f"{uid}.{ext}")
                if os.path.isfile(photo_path):
                    found = True
                    # Upload to Firebase Storage under memberPhotos/{uid}.{ext}
                    blob = bucket.blob(f"memberPhotos/{uid}.{ext}")
                    # Set metadata?
                    blob.upload_from_filename(photo_path)
                    # Make publicly readable (optional, but we need public URL for profile)
                    blob.make_public()
                    foto_url = blob.public_url
                    print(f"Uploaded photo for uid {uid} -> {foto_url}")
                    break
            if not found:
                print(f"WARNING: No photo found for uid {uid} in {photos_dir}")
                # Optionally, we could fallback to a default photo

            if foto_url:
                member_data['fotoUrl'] = foto_url

            # Write to Firestore
            try:
                db.collection('members').document(uid).set(member_data)
                members_count += 1
                print(f"Written member {uid} to Firestore")
            except Exception as e:
                print(f"ERROR writing member {uid}: {e}")

    print(f"Migration completed. Processed {members_count} members.")

if __name__ == "__main__":
    main()