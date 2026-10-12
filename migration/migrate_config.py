#!/usr/bin/env python3
"""
Migration script: Configuracion sheet to Firebase Firestore.
Extracts assembly schedule data.
Expects:
- CSV file: migration/sheets_export/config.csv with columns:
    Fecha, Hay_Asamblea, Hora_Inicio, Observación
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'config' with documents:
    Document ID: date (YYYY-MM-DD)
    Fields:
        date: string (YYYY-MM-DD)
        has_assembly: boolean (0.0 or 1.0 -> false/true)
        start_time: string (HH:MM format)
        observations: string
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

def parse_bool_value(val):
    """Convert 0.0/1.0 to boolean"""
    val = safe_strip(val)
    if val == '1.0':
        return True
    elif val == '0.0':
        return False
    else:
        # Default to False for unclear values
        return False

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    config_csv = os.path.join(sheets_dir, 'config.csv')

    if not os.path.isfile(config_csv):
        print(f"ERROR: Config CSV not found at {config_csv}")
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

    print("Reading config CSV...")
    configs_processed = 0
    skipped_count = 0

    with open(config_csv, newline='', encoding='utf-8') as csvfile:
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
            date_str = safe_strip(row.get('Fecha'))
            hay_asamblea_str = safe_strip(row.get('Hay_Asamblea'))
            hora_inicio = safe_strip(row.get('Hora_Inicio'))
            observacion = safe_strip(row.get('Observación'))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: date='{date_str}', hay_asamblea='{hay_asamblea_str}', hora='{hora_inicio}', obs='{observacion[:50]}...'")

            if not date_str:
                print(f"Skipping row {row_num}: Missing date")
                skipped_count += 1
                continue

            # Validate date format (YYYY-MM-DD)
            if not re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
                print(f"Skipping row {row_num}: Invalid date format '{date_str}'")
                skipped_count += 1
                continue

            # Parse boolean value
            has_assembly = parse_bool_value(hay_asamblea_str)

            # Prepare config document
            config_doc = {
                'date': date_str,
                'has_assembly': has_assembly,
                'start_time': hora_inicio,
                'observations': observacion,
                'created_at': datetime.now().isoformat()
            }

            # Write to Firestore
            # Use date as document ID (YYYY-MM-DD format is valid for Firestore doc IDs)
            doc_id = date_str

            try:
                db.collection('config').document(doc_id).set(config_doc)
                configs_processed += 1
                if configs_processed <= 3:  # Show first few for verification
                    print(f"Written config for {date_str}: assembly={has_assembly}, time={hora_inicio}")
                elif configs_processed == 4:
                    print(f"... (continuing to process remaining configs)")
            except Exception as e:
                print(f"ERROR writing config for {date_str}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {configs_processed} config entries")
    print(f"- Skipped: {skipped_count} entries")
    print(f"\nData stored in Firestore collection 'config'")
    print(f"Each document represents assembly configuration for a specific date")

if __name__ == "__main__":
    main()