#!/usr/bin/env python3
"""
Migration script: Asistencia (attendance) from Google Sheets to Firebase Firestore.
Extracts student names and their daily attendance records (0.0 = absent, 1.0 = present).
Expects:
- CSV file: migration/sheets_export/asistencia.csv with format:
    First column: Student names
    Subsequent columns: Dates (MM/DD format) with values 0.0 or 1.0
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'attendance' with documents:
    Document ID: student name (or UID if available)
    Fields:
        name: student name
        attendance: map of date strings to boolean values (true = present, false = absent)
        lastUpdated: timestamp
Keeps the existing frontend structure intact.
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

def parse_attendance_value(val):
    """Convert attendance value to boolean"""
    val = safe_strip(val)
    if val == '1.0':
        return True
    elif val == '0.0':
        return False
    else:
        # Treat empty or non-standard values as absent
        return False

def extract_date_from_header(header):
    """Extract date from header like '03/01' or '10/01'"""
    header = safe_strip(header)
    # Match MM/DD format
    match = re.match(r'^(\d{1,2})/(\d{1,2})$', header)
    if match:
        month, day = match.groups()
        # Assume current year for simplicity - adjust if needed if historical data spans years
        # For now, we'll store as MM-DD string to keep it simple and year-independent
        return f"{month.zfill(2)}-{day.zfill(2)}"
    return None

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    asistencia_csv = os.path.join(sheets_dir, 'asistencia.csv')

    if not os.path.isfile(asistencia_csv):
        print(f"ERROR: Asistencia CSV not found at {asistencia_csv}")
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

    print("Reading asistencia CSV...")
    students_processed = 0
    skipped_count = 0
    total_dates_processed = 0

    with open(asistencia_csv, newline='', encoding='utf-8') as csvfile:
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

        # Identify date columns (skip the first column which is student names)
        date_columns = []
        if reader.fieldnames:
            for i, field in enumerate(reader.fieldnames):
                if i == 0:  # First column is student names
                    continue
                date_key = extract_date_from_header(field)
                if date_key:
                    date_columns.append((i, field, date_key))
                else:
                    # Might be summary columns or other non-date data
                    print(f"Skipping non-date column: '{field}'")

        print(f"Found {len(date_columns)} date columns to process")

        for row_num, row in enumerate(reader, start=2):  # start at 2 since header is row 1
            # Safely extract student name (first column)
            student_name = None
            if reader.fieldnames and len(reader.fieldnames) > 0:
                first_col_name = reader.fieldnames[0]
                student_name = safe_strip(row.get(first_col_name))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: student_name='{student_name}'")

            if not student_name:
                print(f"Skipping row {row_num}: Missing student name")
                skipped_count += 1
                continue

            # Process attendance data for this student
            attendance_data = {}
            dates_found_for_student = 0

            for col_index, original_header, date_key in date_columns:
                # Get the value for this date column
                # We need to get by index since headers might not be unique/reliable
                # Let's try to get by header first, fallback to index if needed
                val = None
                if original_header in row:
                    val = row[original_header]
                else:
                    # Try by index if header lookup failed
                    # This is a bit tricky with DictReader, so let's reconstruct
                    # For now, we'll skip if not found by header and warn
                    if row_num == 2:  # Only warn on first data row to avoid spam
                        print(f"Warning: Could not find column '{original_header}' in row")
                    continue

                attendance_bool = parse_attendance_value(val)
                attendance_data[date_key] = attendance_bool
                dates_found_for_student += 1

            if dates_found_for_student == 0:
                print(f"Warning: No attendance data found for student '{student_name}' in row {row_num}")
                # Still create document but with empty attendance

            # Prepare attendance document
            attendance_doc = {
                'name': student_name,
                'attendance': attendance_data,
                'lastUpdated': datetime.now().isoformat(),
                'totalDatesRecorded': dates_found_for_student
            }

            # Write to Firestore
            # Use student name as document ID (sanitized)
            # Firestore document IDs can't contain certain characters, so we'll sanitize
            doc_id = re.sub(r'[^\w\-_.]', '_', student_name)  # Replace problematic chars with underscore
            doc_id = doc_id.strip('_')  # Remove leading/trailing underscores
            if not doc_id:
                doc_id = f"student_{row_num}"  # Fallback

            try:
                db.collection('attendance').document(doc_id).set(attendance_doc)
                students_processed += 1
                total_dates_processed += dates_found_for_student
                if students_processed <= 3:  # Show first few for verification
                    print(f"Written attendance for {student_name} (ID: {doc_id}) with {dates_found_for_student} dates")
                elif students_processed == 4:
                    print(f"... (continuing to process remaining students)")
            except Exception as e:
                print(f"ERROR writing attendance for {student_name}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {students_processed} students")
    print(f"- Total attendance records processed: {total_dates_processed}")
    print(f"- Skipped: {skipped_count} students")
    print(f"\nData stored in Firestore collection 'attendance'")
    print(f"Each document contains a student's attendance record as a map of dates to boolean values")

if __name__ == "__main__":
    main()