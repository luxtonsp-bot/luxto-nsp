#!/usr/bin/env python3
"""
Migration script: Feedback sheet to Firebase Firestore.
Extracts member feedback.
Expects:
- CSV file: migration/sheets_export/feedback.csv with columns:
    [Timestamp], Nombre, Email, ⭐ Calificacion, Comentario, Fecha_Asamblea
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'feedback' with documents:
    Document ID: auto-generated ID
    Fields:
        date_submitted: timestamp (ISO string)
        name: string
        email: string
        rating: integer (extracted from "5 ⭐" format)
        comment: string
        assembly_date: timestamp (ISO string) or string
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

    # Handle format: "2026-05-11 17:49:00" or "2026-05-11"
    try:
        if ' ' in date_str:
            return datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S').isoformat()
        else:
            return datetime.strptime(date_str, '%Y-%m-%d').isoformat()
    except ValueError:
        print(f"WARNING: Could not parse datetime: {date_str}")
        return None

def extract_rating(rating_str):
    """Extract numerical rating from string like '5 ⭐'"""
    rating_str = safe_strip(rating_str)
    if not rating_str:
        return None

    # Extract first number from the string
    match = re.search(r'(\d+)', rating_str)
    if match:
        try:
            rating = int(match.group(1))
            # Validate rating is in reasonable range (1-5)
            if 1 <= rating <= 5:
                return rating
        except ValueError:
            pass

    print(f"WARNING: Could not extract rating from: {rating_str}")
    return None

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    feedback_csv = os.path.join(sheets_dir, 'feedback.csv')

    if not os.path.isfile(feedback_csv):
        print(f"ERROR: Feedback CSV not found at {feedback_csv}")
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

    print("Reading feedback CSV...")
    feedback_processed = 0
    skipped_count = 0

    with open(feedback_csv, newline='', encoding='utf-8') as csvfile:
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
            # Note: First column name might be empty, let's get by index if needed
            date_submitted_str = safe_strip(list(row.values())[0]) if len(row.values()) > 0 else ''
            name = safe_strip(row.get('Nombre'))
            email = safe_strip(row.get('Email'))
            rating_str = safe_strip(row.get('⭐ Calificacion'))
            comment = safe_strip(row.get('Comentario'))
            assembly_date_str = safe_strip(row.get('Fecha_Asamblea'))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: name='{name}', email='{email}', rating='{rating_str}', comment_len={len(comment)}")

            # Skip rows that are completely empty
            if not name and not email and not rating_str and not comment and not assembly_date_str:
                skipped_count += 1
                continue

            if not name:
                print(f"Skipping row {row_num}: Missing name")
                skipped_count += 1
                continue

            # Parse dates
            date_submitted = parse_datetime(date_submitted_str)
            assembly_date = parse_datetime(assembly_date_str)

            # Extract rating
            rating = extract_rating(rating_str)

            # Prepare feedback document
            feedback_doc = {
                'date_submitted': date_submitted if date_submitted else None,
                'name': name,
                'email': email,
                'rating': rating,
                'comment': comment,
                'assembly_date': assembly_date if assembly_date else None,
                'created_at': datetime.now().isoformat()
            }

            # Remove None values to keep Firestore clean
            feedback_doc = {k: v for k, v in feedback_doc.items() if v is not None}

            # Write to Firestore
            # Use auto-generated ID
            try:
                doc_ref = db.collection('feedback').document()
                doc_ref.set(feedback_doc)
                feedback_processed += 1
                if feedback_processed <= 3:  # Show first few for verification
                    print(f"Written feedback {feedback_processed} by {name} (rating: {rating})")
                elif feedback_processed == 4:
                    print(f"... (continuing to process remaining feedback)")
            except Exception as e:
                print(f"ERROR writing feedback for {name}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {feedback_processed} feedback entries")
    print(f"- Skipped: {skipped_count} empty/invalid entries")
    print(f"\nData stored in Firestore collection 'feedback'")
    print(f"Each document represents member feedback with rating and comments")

if __name__ == "__main__":
    main()