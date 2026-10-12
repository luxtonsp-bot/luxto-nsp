#!/usr/bin/env python3
"""
Migration script: Caporales 2026 sheet to Firebase Firestore.
Extracts member attendance records for rehearsals.
Expects:
- CSV file: migration/sheets_export/caporales_2026.csv with columns:
    Nombre, [date columns...], Asistencias, Faltas, %, Estado
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'caporales_2026' with documents:
    Document ID: member name (sanitized) or auto-generated
    Fields:
        name: string
        attendance: map of date strings to boolean values (true = present, false = absent)
        total_rehearsals: integer
        attended_count: integer (calculated from attendance)
        missed_count: integer (calculated from attendance)
        attendance_percentage: float (calculated)
        status: string (calculated from percentage)
        updated_at: timestamp
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

def extract_date_from_header(header):
    """Extract date from header like '2026-06-27 00:00:00'"""
    header = safe_strip(header)
    # Match YYYY-MM-DD HH:MM:SS format
    match = re.match(r'^(\d{4}-\d{2}-\d{2})', header)
    if match:
        return match.group(1)  # Return just YYYY-MM-DD part
    return None

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    caporales_csv = os.path.join(sheets_dir, 'caporales_2026.csv')

    if not os.path.isfile(caporales_csv):
        print(f"ERROR: Caporales 2026 CSV not found at {caporales_csv}")
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

    print("Reading caporales 2026 CSV...")
    members_processed = 0
    skipped_count = 0

    with open(caporales_csv, newline='', encoding='utf-8') as csvfile:
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

        # Identify date columns (skip first column which is Nombre, and last calculated columns)
        date_columns = []
        if reader.fieldnames:
            for i, field in enumerate(reader.fieldnames):
                if i == 0:  # First column is Nombre
                    continue
                date_key = extract_date_from_header(field)
                if date_key:
                    date_columns.append((i, field, date_key))
                else:
                    # Stop when we reach calculated columns (Asistencias, Faltas, %, Estado)
                    if field in ['Asistencias', 'Faltas', '%', 'Estado']:
                        break
                    # Otherwise it might be empty headers from the title row
                    if field.strip() == '':
                        continue

        print(f"Found {len(date_columns)} date columns (rehearsal dates) to process")

        for row_num, row in enumerate(reader, start=2):  # start at 2 since header is row 1
            # Safely extract member name (first column)
            member_name = None
            if reader.fieldnames and len(reader.fieldnames) > 0:
                first_col_name = reader.fieldnames[0]
                member_name = safe_strip(row.get(first_col_name))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: member_name='{member_name}'")

            # Skip empty rows or header rows
            if not member_name:
                skipped_count += 1
                continue

            # Process attendance data for this member
            attendance_data = {}
            dates_present = 0
            total_rehearsals = len(date_columns)

            for col_index, original_header, date_key in date_columns:
                # Get the value for this date column
                val = None
                if original_header in row:
                    val = row[original_header]
                else:
                    # Try to get by index if needed (fallback)
                    # For simplicity, we'll skip if not found by header
                    if row_num == 3:  # Only warn on first data row
                        print(f"Warning: Could not find column '{original_header}' in row")
                    continue

                present = parse_bool_value(val)
                attendance_data[date_key] = present
                if present:
                    dates_present += 1

            if total_rehearsals == 0:
                print(f"Warning: No rehearsal dates found for member '{member_name}' in row {row_num}")
                # Still create document but with empty attendance

            # Calculate derived fields
            attended_count = dates_present
            missed_count = total_rehearsals - attended_count
            attendance_percentage = (attended_count / total_rehearsals * 100) if total_rehearsals > 0 else 0.0

            # Determine status based on percentage (matching the sheet's logic)
            if attendance_percentage >= 90.0:
                status = "Excelente"
            elif attendance_percentage >= 70.0:
                status = "Regular"
            else:
                status = "Riesgo"

            # Prepare caporales member document
            member_doc = {
                'name': member_name,
                'attendance': attendance_data,
                'total_rehearsals': total_rehearsals,
                'attended_count': attended_count,
                'missed_count': missed_count,
                'attendance_percentage': round(attendance_percentage, 2),
                'status': status,
                'updated_at': datetime.now().isoformat()
            }

            # Write to Firestore
            # Use member name as document ID (sanitized)
            doc_id = re.sub(r'[^\w\-_.]', '_', member_name)  # Replace problematic chars with underscore
            doc_id = doc_id.strip('_')  # Remove leading/trailing underscores
            if not doc_id:
                doc_id = f"member_{row_num}"  # Fallback

            try:
                db.collection('caporales_2026').document(doc_id).set(member_doc)
                members_processed += 1
                if members_processed <= 3:  # Show first few for verification
                    print(f"Written caporales member {member_name}: {attended_count}/{total_rehearsals} attended ({attendance_percentage}%)")
                elif members_processed == 4:
                    print(f"... (continuing to process remaining members)")
            except Exception as e:
                print(f"ERROR writing caporales member {member_name}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {members_processed} members")
    print(f"- Skipped: {skipped_count} members")
    print(f"\nData stored in Firestore collection 'caporales_2026'")
    print(f"Each document contains a member's attendance record for all rehearsals")

if __name__ == "__main__":
    main()