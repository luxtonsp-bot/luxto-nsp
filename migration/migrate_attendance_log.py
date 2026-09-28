#!/usr/bin/env python3
"""
Migration script: Log_Asistencia sheet to Firebase Firestore.
Extracts detailed attendance logs with timestamps.
Expects:
- CSV file: migration/sheets_export/attendance_log.csv with columns:
    Timestamp, Nombre, Trimestre, Celda, Valor, Tardanza (Min), ...
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'attendance_log' with documents:
    Document ID: auto-generated ID
    Fields:
        timestamp: when record was logged (ISO string)
        name: student name
        trimester: string (T1, T2, etc.)
        cell: string (D3, D4, etc.)
        present: boolean (from Valor: 1.0 or 0.0)
        lateness_minutes: integer (from Tardanza (Min))
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

    # Handle format: "2026-01-17 15:35:36" or "2026-01-17"
    try:
        if ' ' in date_str:
            return datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S').isoformat()
        else:
            return datetime.strptime(date_str, '%Y-%m-%d').isoformat()
    except ValueError:
        print(f"WARNING: Could not parse datetime: {date_str}")
        return None

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

def parse_int_value(val):
    """Safely parse integer value"""
    val = safe_strip(val)
    if not val:
        return 0
    try:
        return int(float(val))  # Handle cases like "5.0"
    except ValueError:
        print(f"WARNING: Could not parse integer from: {val}")
        return 0

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    attendance_log_csv = os.path.join(sheets_dir, 'attendance_log.csv')

    if not os.path.isfile(attendance_log_csv):
        print(f"ERROR: Attendance log CSV not found at {attendance_log_csv}")
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

    print("Reading attendance log CSV...")
    logs_processed = 0
    skipped_count = 0

    with open(attendance_log_csv, newline='', encoding='utf-8') as csvfile:
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
            name = safe_strip(row.get('Nombre'))
            trimester = safe_strip(row.get('Trimestre'))
            cell = safe_strip(row.get('Celda'))
            valor_str = safe_strip(row.get('Valor'))
            tardanza_str = safe_strip(row.get('Tardanza (Min)'))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: name='{name}', timestamp='{timestamp_str}', valor='{valor_str}', tardanza='{tardanza_str}'")

            # Skip rows that are completely empty or header rows
            if not name and not timestamp_str:
                skipped_count += 1
                continue

            if not name:
                print(f"Skipping row {row_num}: Missing name")
                skipped_count += 1
                continue

            if not timestamp_str:
                print(f"Skipping row {row_num}: Missing timestamp")
                skipped_count += 1
                continue

            # Parse timestamp
            timestamp = parse_datetime(timestamp_str)
            if not timestamp:
                print(f"Skipping row {row_num}: Could not parse timestamp '{timestamp_str}'")
                skipped_count += 1
                continue

            # Extract date from timestamp (YYYY-MM-DD)
            date_only = timestamp.split('T')[0] if 'T' in timestamp else timestamp_str.split(' ')[0] if ' ' in timestamp_str else timestamp_str

            # Parse boolean value for attendance
            present = parse_bool_value(valor_str)

            # Parse lateness minutes
            lateness_minutes = parse_int_value(tardanza_str)

            # Prepare attendance log document
            log_doc = {
                'timestamp': timestamp,
                'name': name,
                'trimester': trimester,
                'cell': cell,
                'present': present,
                'lateness_minutes': lateness_minutes,
                'date': date_only,
                'created_at': datetime.now().isoformat()
            }

            # Remove None values
            log_doc = {k: v for k, v in log_doc.items() if v is not None}

            # Write to Firestore
            # Use auto-generated ID
            try:
                doc_ref = db.collection('attendance_log').document()
                doc_ref.set(log_doc)
                logs_processed += 1
                if logs_processed <= 3:  # Show first few for verification
                    print(f"Written attendance log {logs_processed} for {name} on {date_only}")
                elif logs_processed == 4:
                    print(f"... (continuing to process remaining logs)")
            except Exception as e:
                print(f"ERROR writing attendance log for {name}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {logs_processed} attendance log entries")
    print(f"- Skipped: {skipped_count} entries")
    print(f"\nData stored in Firestore collection 'attendance_log'")
    print(f"Each document represents a detailed attendance record with timestamp")

if __name__ == "__main__":
    main()