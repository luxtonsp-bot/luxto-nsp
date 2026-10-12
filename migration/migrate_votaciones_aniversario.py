#!/usr/bin/env python3
"""
Migration script: Votaciones_Aniversario sheet to Firebase Firestore.
Extracts anniversary voting data.
Expects:
- CSV file: migration/sheets_export/votaciones_aniversario.csv with columns:
    Timestamp, Votante, Categoria, Votado, ID_Sesion
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'votaciones_aniversario' with documents:
    Document ID: auto-generated ID
    Fields:
        timestamp: vote timestamp (ISO string)
        voter_name: string (Votante)
        category: string (Categoria)
        voted_for: string (Votado)
        session_id: string (ID_Sesion)
        date: date extracted from timestamp (YYYY-MM-DD)
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

    # Handle format: "25/4/2026, 5:31:22 p. m." (day/month/year with AM/PM)
    # Also handle: "25/4/2026, 5:31:22 a. m."
    try:
        # Normalize the string: replace "p. m." with "PM", "a. m." with "AM"
        normalized = date_str.replace('p. m.', 'PM').replace('a. m.', 'AM')
        # Now parse: day/month/year, hour:minute:second AM/PM
        return datetime.strptime(normalized, '%d/%m/%Y, %I:%M:%S %p').isoformat()
    except ValueError:
        try:
            # Try without seconds
            normalized = date_str.replace('p. m.', 'PM').replace('a. m.', 'AM')
            return datetime.strptime(normalized, '%d/%m/%Y, %I:%M %p').isoformat()
        except ValueError:
            print(f"WARNING: Could not parse datetime: {date_str}")
            return None

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    votaciones_csv = os.path.join(sheets_dir, 'votaciones_aniversario.csv')

    if not os.path.isfile(votaciones_csv):
        print(f"ERROR: Votaciones aniversario CSV not found at {votaciones_csv}")
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

    print("Reading votaciones aniversario CSV...")
    votes_processed = 0
    skipped_count = 0

    with open(votaciones_csv, newline='', encoding='utf-8') as csvfile:
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
            timestamp_str = safe_strip(row.get('Timestamp'))
            voter_name = safe_strip(row.get('Votante'))
            category = safe_strip(row.get('Categoria'))
            voted_for = safe_strip(row.get('Votado'))
            session_id = safe_strip(row.get('ID_Sesion'))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: voter='{voter_name}', category='{category}', voted_for='{voted_for}'")

            # Skip rows that are completely empty
            if not voter_name and not category and not voted_for and not timestamp_str and not session_id:
                skipped_count += 1
                continue

            if not voter_name:
                print(f"Skipping row {row_num}: Missing voter name")
                skipped_count += 1
                continue

            if not category:
                print(f"Skipping row {row_num}: Missing category")
                skipped_count += 1
                continue

            if not voted_for:
                print(f"Skipping row {row_num}: Missing voted_for")
                skipped_count += 1
                continue

            # Parse timestamp
            timestamp = parse_datetime(timestamp_str)
            if not timestamp:
                print(f"Skipping row {row_num}: Could not parse timestamp '{timestamp_str}'")
                skipped_count += 1
                continue

            # Extract date from timestamp (YYYY-MM-DD)
            date_only = timestamp.split('T')[0] if 'T' in timestamp else None

            # Prepare vote document
            vote_doc = {
                'timestamp': timestamp,
                'voter_name': voter_name,
                'category': category,
                'voted_for': voted_for,
                'session_id': session_id,
                'date': date_only,
                'created_at': datetime.now().isoformat()
            }

            # Remove None values
            vote_doc = {k: v for k, v in vote_doc.items() if v is not None}

            # Write to Firestore
            # Use auto-generated ID
            try:
                doc_ref = db.collection('votaciones_aniversario').document()
                doc_ref.set(vote_doc)
                votes_processed += 1
                if votes_processed <= 3:  # Show first few for verification
                    print(f"Written vote {votes_processed} by {voter_name} for {voted_for} in category {category}")
                elif votes_processed == 4:
                    print(f"... (continuing to process remaining votes)")
            except Exception as e:
                print(f"ERROR writing vote for {voter_name}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {votes_processed} votes")
    print(f"- Skipped: {skipped_count} entries")
    print(f"\nData stored in Firestore collection 'votaciones_aniversario'")
    print(f"Each document represents a vote in the anniversary voting event")

if __name__ == "__main__":
    main()