#!/usr/bin/env python3
"""
Migration script: Polladas Pastoral sheet to Firebase Firestore.
Extracts pollada participation and payment records.
Expects:
- CSV file: migration/sheets_export/polladas_pastoral.csv with columns:
    Nombres, RECIBIDO, CANCELADO, EFECTIVO, YAPE, (empty), COSTO, ...
- Firebase service account JSON: migration/firebase-service-account.json
Writes to Firestore collection 'polladas_pastoral' with documents:
    Document ID: auto-generated ID
    Fields:
        name: string
        received_pollada: boolean (from RECIBIDO: ✅ or other)
        cancelled: boolean (from CANCELADO: ✅ or other)
        payment_method: string ('efectivo', 'yape', 'none', or 'both')
        cost_per_person: float (from COSTO column)
        total_cost: float (calculated: cost_per_person if not cancelled and received, else 0)
        recorded_at: timestamp
"""

import csv
import os
import sys
import re

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

def parse_checkbox(val):
    """Parse checkbox value (✅ or ❌ or empty) to boolean"""
    val = safe_strip(val)
    return val == '✅'

def parse_cost(val):
    """Parse cost value to float"""
    val = safe_strip(val)
    if not val:
        return 0.0
    try:
        return float(val)
    except ValueError:
        # Handle cases where it might have extra characters
        match = re.search(r'[\d,]+\.?\d*', val)
        if match:
            try:
                return float(match.group().replace(',', ''))
            except ValueError:
                pass
        print(f"WARNING: Could not parse cost from: {val}")
        return 0.0

def main():
    # Paths
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sheets_dir = os.path.join(base_dir, 'sheets_export')
    cred_path = os.path.join(base_dir, 'firebase-service-account.json')
    polladas_csv = os.path.join(sheets_dir, 'polladas_pastoral.csv')

    if not os.path.isfile(polladas_csv):
        print(f"ERROR: Polladas pastoral CSV not found at {polladas_csv}")
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

    print("Reading polladas pastoral CSV...")
    records_processed = 0
    skipped_count = 0

    with open(polladas_csv, newline='', encoding='utf-8') as csvfile:
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
            name = safe_strip(row.get('Nombres'))
            recibido = safe_strip(row.get('RECIBIDO'))
            cancelado = safe_strip(row.get('CANCELADO'))
            efectivo = safe_strip(row.get('EFECTIVO'))  # First EFECTIVO column
            yapecol = safe_strip(row.get('YAPE'))       # First YAPE column
            costo_str = safe_strip(row.get('COSTO'))

            # Debug first few rows
            if row_num <= 5:
                print(f"DEBUG Row {row_num}: name='{name}', recibido='{recibido}', cancelado='{cancelado}', efectivo='{efectivo}', yape='{yapecol}', costo='{costo_str}'")

            # Skip empty rows
            if not name:
                skipped_count += 1
                continue

            # Parse values
            received_pollada = parse_checkbox(recibido)
            cancelled = parse_checkbox(cancelado)

            # Determine payment method
            pago_efectivo = parse_checkbox(efectivo)
            pago_yape = parse_checkbox(yapecol)

            if pago_efectivo and pago_yape:
                payment_method = 'both'
            elif pago_efectivo:
                payment_method = 'efectivo'
            elif pago_yape:
                payment_method = 'yape'
            else:
                payment_method = 'none'

            # Parse cost
            cost_per_person = parse_cost(costo_str)

            # Calculate total cost (only if not cancelled and they received it)
            # If cancelled, they typically don't pay/receive
            # If not received, they might not pay either (depends on policy)
            total_cost = 0.0
            if not cancelled and received_pollada and cost_per_person > 0:
                total_cost = cost_per_person

            # Prepare pollada participation document
            pollada_doc = {
                'name': name,
                'received_pollada': received_pollada,
                'cancelled': cancelled,
                'payment_method': payment_method,
                'cost_per_person': cost_per_person,
                'total_cost': total_cost,
                'recorded_at': datetime.now().isoformat()
            }

            # Write to Firestore
            # Use auto-generated ID
            try:
                doc_ref = db.collection('polladas_pastoral').document()
                doc_ref.set(pollada_doc)
                records_processed += 1
                if records_processed <= 3:  # Show first few for verification
                    status = "RECIBIDO" if received_pollada else "CANCELADO" if cancelled else "PENDIENTE"
                    print(f"Written pollada record {records_processed} for {name}: {status}, pago={payment_method}")
                elif records_processed == 4:
                    print(f"... (continuing to process remaining records)")
            except Exception as e:
                print(f"ERROR writing pollada record for {name}: {e}")
                skipped_count += 1

    print(f"\nMigration completed:")
    print(f"- Successfully processed: {records_processed} pollada participation records")
    print(f"- Skipped: {skipped_count} empty entries")
    print(f"\nData stored in Firestore collection 'polladas_pastoral'")
    print(f"Each document represents a member's participation in a pollada event")

if __name__ == "__main__":
    main()