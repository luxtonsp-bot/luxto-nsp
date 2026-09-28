#!/usr/bin/env python3
"""
Migration script: Sugerencias sheet to Firebase Firestore.
Extracts member suggestions.
Expects:
- CSV file: migration/sheets_export/suggestions.csv with columns:
    Fecha_Envio, Nombre, Email, Sugerencia, Semana
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'suggestions' with documents:
    Document ID: auto-generated ID
    Fields:
        date_sent: timestamp (ISO string)
        name: string
        email: string
        suggestion: string
        week: timestamp (ISO string) or string
        status: string (default 'new')
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

def parse_datetime(date_str):
    """Parse datetime string to ISO format"""
    date_str = safe_strip(date_str)
    if not date_str:
        return None

    # Handle format: "2026-05-11 21:04:00" or "2026-05-11"
    try:
        if ' ' in date_str:
            return datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S').isoformat()
        else:
            return datetime.strptime(date_str, '%Y-%m-%d').isoformat()
    except ValueError:
        print(f"WARNING: Could not parse datetime: {date_str}")
        return None

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    suggestions_csv = os.path.join(sheets_dir, 'suggestions.csv')

    if not os.path.isfile(suggestions_csv):
        print(f"ERROR: Suggestions CSV not found at {suggestions_csv}")
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

    print("Reading suggestions CSV...")
    suggestions_processed = 0
    skipped_count = 0

    with open(suggestions_csv, newline='', encoding='utf-8') as csvfile:
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
            date_sent_str = safe_strip(row.get('Fecha_Envio'))
            name = safe_strip(row.get('Nombre'))
            email = safe_strip(row.get('Email'))
            suggestion = safe_strip(row.get('Sugerencia'))
            semana_str = safe_strip(row.get('Semana'))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: name='{name}', email='{email}', suggestion_len={len(suggestion)}")

            if not name:
                print(f"Skipping row {row_num}: Missing name")
                skipped_count += 1
                continue

            if not suggestion:
                print(f"Skipping row {row_num}: Missing suggestion")
                skipped_count += 1
                continue

            # Parse dates
            date_sent = parse_datetime(date_sent_str)
            semana = parse_datetime(semana_str)

            # Prepare suggestion document
            suggestion_doc = {
                'date_sent': date_sent if date_sent else None,
                'name': name,
                'email': email,
                'suggestion': suggestion,
                'week': semana if semana else None,
                'status': 'new',  # default status
                'created_at': datetime.now().isoformat()
            }

            # Remove None values to keep Firestore clean
            suggestion_doc = {k: v for k, v in suggestion_doc.items() if v is not None}

            # Write to Firestore
            # Use auto-generated ID
            try:
                doc_ref = db.collection('suggestions').document()
                doc_ref.set(suggestion_doc)
                suggestions_processed += 1
                if suggestions_processed <= 3:  # Show first few for verification
                    print(f"Written suggestion {suggestions_processed} by {name}")
                elif suggestions_processed == 4:
                    print(f"... (continuing to process remaining suggestions)")
            except Exception as e:
                print(f"ERROR writing suggestion for {name}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {suggestions_processed} suggestions")
    print(f"- Skipped: {skipped_count} suggestions")
    print(f"\nData stored in Firestore collection 'suggestions'")
    print(f"Each document represents a member suggestion with metadata")

if __name__ == "__main__":
    main()