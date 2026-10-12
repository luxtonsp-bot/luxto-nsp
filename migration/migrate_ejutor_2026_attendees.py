#!/usr/bin/env python3
"""
Migration script: Lista asistentes EJUTOR 2026 sheet to Firebase Firestore.
Extracts EJUTOR 2026 attendees data.
Expects:
- CSV file: migration/sheets_export/lista_asistentes_ejutor_2026.csv with columns:
    Nombre y Apellidos, Edad, DNI, Correo, Celular
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'ejutor_2026_attendees' with documents:
    Document ID: auto-generated ID or sanitized DNI
    Fields:
        full_name: string (Nombre y Apellidos)
        age: integer (Edad)
        dni: string (DNI)
        email: string (Correo)
        phone: string (Celular)
        registration_date: timestamp (when migrated)
        status: string (default 'active')
        created_at: timestamp
"""

import csv
import os
import sys
import re
from datetime import datetime

import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin SDK
def initialize_firebase(cred_path):
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)

def safe_strip(value):
    """Safely strip a value that might be None"""
    if value is None:
        return ''
    return str(value).strip()

def parse_int_from_float_str(val):
    """Parse string like '18.0' to integer"""
    val = safe_strip(val)
    if not val:
        return None
    try:
        return int(float(val))
    except ValueError:
        print(f"WARNING: Could not parse integer from: {val}")
        return None

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    ejutor_csv = os.path.join(sheets_dir, 'lista_asistentes_ejutor_2026.csv')

    if not os.path.isfile(ejutor_csv):
        print(f"ERROR: EJUTOR 2026 attendees CSV not found at {ejutor_csv}")
        sys.exit(1)
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

    print("Reading EJUTOR 2026 attendees CSV...")
    attendees_processed = 0
    skipped_count = 0

    with open(ejutor_csv, newline='', encoding='utf-8') as csvfile:
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
            # Safely extract values
            full_name = safe_strip(row.get('Nombre y Apellidos'))
            edad_str = safe_strip(row.get('Edad'))
            dni = safe_strip(row.get('DNI'))
            email = safe_strip(row.get('Correo'))
            celular_str = safe_strip(row.get('Celular'))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: name='{full_name}', edad='{edad_str}', dni='{dni}', email='{email}'")

            # Skip rows that are completely empty
            if not full_name and not edad_str and not dni and not email and not celular_str:
                skipped_count += 1
                continue

            if not full_name:
                print(f"Skipping row {row_num}: Missing full name")
                skipped_count += 1
                continue

            if not dni:
                print(f"Skipping row {row_num}: Missing DNI")
                skipped_count += 1
                continue

            # Parse age
            age = parse_int_from_float_str(edad_str)

            # Parse phone number
            phone = None
            if celular_str:
                phone = parse_int_from_float_str(celular_str)
                if phone is not None:
                    phone = str(phone)  # Convert back to string for storage
                else:
                    # If we couldn't parse as number, keep as string but clean it
                    phone = re.sub(r'[^\d+]', '', celular_str)  # Keep only digits and +

            # Prepare attendee document
            attendee_doc = {
                'full_name': full_name,
                'age': age,
                'dni': dni,
                'email': email,
                'phone': phone,
                'registration_date': datetime.now().isoformat(),
                'status': 'active',
                'created_at': datetime.now().isoformat()
            }

            # Remove None values
            attendee_doc = {k: v for k, v in attendee_doc.items() if v is not None}

            # Write to Firestore
            # Use DNI as document ID if available and valid, otherwise auto-generated
            doc_id = None
            if dni and len(dni) >= 6 and dni.isdigit():  # Basic validation for DNI
                doc_id = dni
            else:
                # Use auto-generated ID
                doc_ref = db.collection('ejutor_2026_attendees').document()
                doc_id = doc_ref.id
                doc_ref.set(attendee_doc)
                attendees_processed += 1
                if attendees_processed <= 3:  # Show first few for verification
                    print(f"Written EJUTOR 2026 attendee {attendees_processed}: {full_name} (DNI: {dni})")
                elif attendees_processed == 4:
                    print(f"... (continuing to process remaining attendees)")
                continue  # Skip the rest since we already wrote with auto-generated ID

            # If we have a DNI-based doc ID, write it
            try:
                db.collection('ejutor_2026_attendees').document(doc_id).set(attendee_doc)
                attendees_processed += 1
                if attendees_processed <= 3:  # Show first few for verification
                    print(f"Written EJUTOR 2026 attendee {attendees_processed}: {full_name} (DNI: {dni})")
                elif attendees_processed == 4:
                    print(f"... (continuing to process remaining attendees)")
            except Exception as e:
                print(f"ERROR writing EJUTOR 2026 attendee {full_name}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {attendees_processed} attendees")
    print(f"- Skipped: {skipped_count} entries")
    print(f"\nData stored in Firestore collection 'ejutor_2026_attendees'")
    print(f"Each document represents an EJUTOR 2026 attendee with contact information")

if __name__ == "__main__":
    main()