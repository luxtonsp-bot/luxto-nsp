#!/usr/bin/env python3
"""
Improved migration script: members and photos from Google Sheets/Drive to Firebase Firestore and Storage.
Handles the specific format of the exported Lista de cumpleaños sheet.

Expects:
- CSV file: migration/sheets_export/members.csv with columns:
    Nombres, Fecha de Cumpleaños, Correo, Codigo Foto, Columna 1
- Photos directory: migration/photos_export/ with files named <uid>.<ext>
  (or we can extract from Codigo Foto URLs and download them - but for now expects local files)
- Firebase service account JSON: migration/firebase-service-account.json
- Firebase Storage bucket: luxto-nsp.firebasestorage.app (default from project)

Extracts UID from:
1. Columna 1 (preferred) - direct UID string
2. If Columna 1 is empty, extracts from Codigo Foto URL:
   https://drive.google.com/uc?export=view&id=<UID>

Writes to Firestore collection 'members' with fields:
    uid (doc id), name, email, birthDate (timestamp), fotoUrl (Storage download URL),
    rol (default 'miembro'), estadoAnioActual (default 'activo'), fechaIngresoGrupo (timestamp or date),
    generation (string or extracted from other data), etc.
"""

import csv
import os
import sys
import re
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

def extract_uid(codigo_foto, columna_1):
    """Extract UID from either Columna 1 or Codigo Foto URL"""
    if columna_1 and str(columna_1).strip():
        return str(columna_1).strip()

    if codigo_foto and str(codigo_foto).strip():
        codigo_foto_str = str(codigo_foto).strip()
        match = re.search(r'[?&]id=([^&\s]+)', codigo_foto_str)
        if match:
            return match.group(1)
        # Also handle case where it might be just the ID
        if len(codigo_foto_str) > 10 and not codigo_foto_str.startswith('http'):
            return codigo_foto_str

    return None

def safe_strip(value):
    """Safely strip a value that might be None"""
    if value is None:
        return ''
    return str(value).strip()

def parse_date(date_str):
    """Parse date string from Excel format to datetime object"""
    date_str = safe_strip(date_str)
    if not date_str:
        return None

    # Handle format: "2003-06-21 00:00:00" or "2003-06-21"
    try:
        if ' ' in date_str:
            date_part = date_str.split(' ')[0]
        else:
            date_part = date_str
        return datetime.strptime(date_part, '%Y-%m-%d')
    except ValueError:
        try:
            # Try alternative format
            return datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            print(f"WARNING: Could not parse date: {date_str}")
            return None

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

    # Try to get storage bucket - handle if it doesn't exist
    try:
        bucket = storage.bucket()
        print(f"Storage bucket obtained: {bucket.name}")
        storage_available = True
    except Exception as e:
        print(f"WARNING: Could not access storage bucket: {e}")
        print("Continuing without photo upload to Firebase Storage")
        bucket = None
        storage_available = False

    print("Reading members CSV...")
    members_count = 0
    skipped_count = 0
    photo_upload_count = 0

    with open(members_csv, newline='', encoding='utf-8') as csvfile:
        # Use csv.Sniffer to detect dialect if needed
        sample = csvfile.read(1024)
        csvfile.seek(0)
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(sample)
        csvfile.seek(0)

        reader = csv.DictReader(csvfile, dialect=dialect)

        # Debug: Print fieldnames to see what we're working with
        print(f"CSV Fieldnames: {reader.fieldnames}")

        # Clean fieldnames (strip whitespace)
        if reader.fieldnames:
            reader.fieldnames = [name.strip() if name else name for name in reader.fieldnames]
            print(f"Cleaned Fieldnames: {reader.fieldnames}")

        for row_num, row in enumerate(reader, start=2):  # start at 2 since header is row 1
            # Safely extract and strip values
            name = safe_strip(row.get('Nombres'))
            email = safe_strip(row.get('Correo'))
            birth_date_str = safe_strip(row.get('Fecha de Cumpleaños'))
            codigo_foto = safe_strip(row.get('Codigo Foto'))
            columna_1 = safe_strip(row.get('Columna 1'))

            # Extract UID
            uid = extract_uid(codigo_foto, columna_1)

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: name='{name}', email='{email}', uid='{uid}'")

            if not uid:
                print(f"Skipping row {row_num}: Could not extract UID. Nombre: '{name}'")
                skipped_count += 1
                continue

            if not name:
                print(f"Skipping row {row_num}: Missing name for UID '{uid}'")
                skipped_count += 1
                continue

            # Parse birth date
            birth_date = parse_date(birth_date_str)

            # Prepare member data
            member_data = {
                'name': name,
                'email': email,
                'rol': 'miembro',  # default, can be updated later by admin
                'estadoAnioActual': 'activo',  # default
            }

            # Add birthDate as Firestore timestamp if available
            if birth_date:
                # Store as ISO string for now to avoid timestamp issues
                member_data['birthDate'] = birth_date.isoformat()

            # Handle photo - look for local photo file first
            foto_url = None
            found = False

            if storage_available:
                for ext in ['jpg', 'jpeg', 'png']:
                    photo_path = os.path.join(photos_dir, f"{uid}.{ext}")
                    if os.path.isfile(photo_path):
                        found = True
                        try:
                            # Upload to Firebase Storage under memberPhotos/{uid}.{ext}
                            blob = bucket.blob(f"memberPhotos/{uid}.{ext}")
                            blob.upload_from_filename(photo_path)
                            # Make publicly readable (needed for profile display)
                            blob.make_public()
                            foto_url = blob.public_url
                            print(f"Uploaded photo for uid {uid} -> {foto_url}")
                            photo_upload_count += 1
                            break
                        except Exception as e:
                            print(f"ERROR uploading photo for uid {uid}: {e}")
                            # Continue without fotoUrl
            else:
                # Storage not available, just check if photo exists locally
                for ext in ['jpg', 'jpeg', 'png']:
                    photo_path = os.path.join(photos_dir, f"{uid}.{ext}")
                    if os.path.isfile(photo_path):
                        found = True
                        # Note: We can't provide a URL without storage, but we know the photo exists
                        print(f"Photo found locally for uid {uid} (storage not available for upload)")
                        break

            if not found and storage_available:
                print(f"WARNING: No local photo found for uid {uid} in {photos_dir}")

            if foto_url:
                member_data['fotoUrl'] = foto_url

            # Write to Firestore
            try:
                db.collection('members').document(uid).set(member_data)
                members_count += 1
                print(f"Written member {uid} ({name}) to Firestore")
            except Exception as e:
                print(f"ERROR writing member {uid}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {members_count} members")
    print(f"- Photos uploaded to storage: {photo_upload_count}")
    print(f"- Skipped: {skipped_count} members")
    print(f"- Total rows processed: {members_count + skipped_count}")

if __name__ == "__main__":
    main()