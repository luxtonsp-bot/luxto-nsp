#!/usr/bin/env python3
"""
Migration script: Estadistica sheet to Firebase Firestore.
Extracts dashboard structure and static elements from the Estadistica sheet.
Note: This sheet contains mostly formulas that reference other sheets. The actual
data is preserved in the source collections (members, attendance, etc.).
Expects:
- CSV file: migration/sheets_export/stats.csv with dashboard/formula data
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'stats_dashboard' with documents:
    Document ID: auto-generated ID
    Fields:
        dashboard_title: string (from row 1)
        dashboard_subtitle: string (from row 2)
        section_headers: array of strings (from row 3)
        column_headers: array of strings (from row 11)
        formulas_info: object describing formula columns (for documentation)
        last_updated: timestamp
        note: string explaining that actual data is in source collections
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

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    stats_csv = os.path.join(sheets_dir, 'stats.csv')

    if not os.path.isfile(stats_csv):
        print(f"ERROR: Estadistica CSV not found at {stats_csv}")
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

    print("Reading estadistica CSV...")
    dashboard_processed = 0
    skipped_count = 0

    with open(stats_csv, newline='', encoding='utf-8') as csvfile:
        # Use csv.Sniffer to detect dialect if needed
        sample = csvfile.read(1024)
        csvfile.seek(0)
        sniffer = csv.Sniffer()
        dialect = sniffer.sniff(sample)
        csvfile.seek(0)

        reader = csv.reader(csvfile, dialect=dialect)  # Use reader instead of DictReader for formula handling

        # Read all rows to understand the structure
        rows = list(reader)

        if not rows:
            print("ERROR: No data found in estadistica CSV")
            sys.exit(1)

        print(f"Read {len(rows)} rows from estadistica CSV")

        # Extract dashboard information from early rows
        dashboard_title = safe_strip(rows[0][0]) if len(rows) > 0 and len(rows[0]) > 0 else ""
        dashboard_subtitle = safe_strip(rows[1][0]) if len(rows) > 1 and len(rows[1]) > 0 else ""
        section_headers = [safe_strip(cell) for cell in rows[2]] if len(rows) > 2 else []

        # Find the column headers row (look for "Nombre" in first column)
        column_headers_row = None
        column_headers = []
        for i, row in enumerate(rows):
            if len(row) > 0 and safe_strip(row[0]) == "Nombre":
                column_headers_row = i
                column_headers = [safe_strip(cell) for cell in row]
                break

        if column_headers is None:
            print("WARNING: Could not find column headers row with 'Nombre'")
            # Try to use row 10 or 11 as fallback
            if len(rows) > 11:
                column_headers = [safe_strip(cell) for cell in rows[11]]
                column_headers_row = 11

        print(f"Dashboard title: '{dashboard_title}'")
        print(f"Dashboard subtitle: '{dashboard_subtitle}'")
        print(f"Section headers: {section_headers}")
        print(f"Column headers: {column_headers}")

        # Analyze formula patterns in data rows (after headers)
        formula_patterns = []
        if column_headers_row is not None:
            # Look at a few data rows to understand formula structure
            for row_idx in range(column_headers_row + 1, min(column_headers_row + 6, len(rows))):
                row = rows[row_idx]
                if len(row) > 0 and safe_strip(row[0]):  # Has a name in first column
                    member_name = safe_strip(row[0])
                    formulas_in_row = []
                    for col_idx, cell in enumerate(row[1:], start=1):  # Skip name column
                        cell_content = safe_strip(cell)
                        if cell_content and ('=' in cell_content or 'IFERROR' in cell_content or 'AVERAGEIF' in cell_content or 'COUNTIFS' in cell_content or 'MAXIFS' in cell_content or 'SUM(' in cell_content):
                            formulas_in_row.append({
                                'column': column_headers[col_idx] if col_idx < len(column_headers) else f'Column_{col_idx}',
                                'formula': cell_content[:100] + ('...' if len(cell_content) > 100 else '')  # Truncate long formulas
                            })
                    if formulas_in_row:
                        formula_patterns.append({
                            'member_name': member_name,
                            'formulas': formulas_in_row
                        })

        # Prepare dashboard document
        dashboard_doc = {
            'dashboard_title': dashboard_title,
            'dashboard_subtitle': dashboard_subtitle,
            'section_headers': section_headers,
            'column_headers': column_headers,
            'formulas_info': {
                'note': 'This sheet contains calculated formulas that reference other sheets. Actual data is preserved in source collections.',
                'sample_formulas': formula_patterns[:3] if formula_patterns else [],  # First 3 samples
                'total_data_rows': max(0, len(rows) - (column_headers_row + 1) if column_headers_row is not None else 0)
            },
            'last_updated': datetime.now().isoformat(),
            'note': 'Actual member statistics data should be computed from the source collections (members, attendance, etc.) as needed. This document preserves only the dashboard structure and labels.',
            'created_at': datetime.now().isoformat()
        }

        # Remove empty/None values
        dashboard_doc = {k: v for k, v in dashboard_doc.items() if v}

        # Write to Firestore
        # Use a fixed ID for the dashboard metadata since there's only one
        try:
            db.collection('stats_dashboard').document('metadata').set(dashboard_doc)
            dashboard_processed = 1
            print(f"Written estadistica dashboard metadata to Firestore")
            print(f"  Title: {dashboard_title}")
            print(f"  Columns: {len(column_headers)} headers found")
        except Exception as e:
            print(f"ERROR writing estadistica dashboard metadata: {e}")
            skipped_count = 1

    print(f"\nMigration completed:")
    print(f"- Dashboard metadata written: {dashboard_processed}")
    print(f"- Skipped: {skipped_count}")
    print(f"\nData stored in Firestore collection 'stats_dashboard' document 'metadata'")
    print(f"This preserves the dashboard structure and labels.")
    print(f"Note: The actual statistical data should be computed from source collections as needed,")
    print(f"since the Estadistica sheet contained mostly formulas referencing other sheets.")

if __name__ == "__main__":
    main()