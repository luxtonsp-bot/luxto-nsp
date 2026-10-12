#!/usr/bin/env python3
"""Test script to verify UID extraction logic from the members.csv"""

import csv
import re

def extract_uid(codigo_foto, columna_1):
    """Extract UID from either Columna 1 or Codigo Foto URL"""
    # If Columna 1 has a value, use it as UID
    if columna_1 and str(columna_1).strip():
        return str(columna_1).strip()

    # If Columna 1 is empty, try to extract from Codigo Foto URL
    if codigo_foto and str(codigo_foto).strip():
        codigo_foto_str = str(codigo_foto).strip()
        # Match pattern: https://drive.google.com/uc?export=view&id=<UID>
        match = re.search(r'[?&]id=([^&\s]+)', codigo_foto_str)
        if match:
            return match.group(1)
        # Also handle case where it might be just the ID
        if len(codigo_foto_str) > 10 and not codigo_foto_str.startswith('http'):
            return codigo_foto_str

    return None

# Test with the actual CSV
csv_path = "/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/members.csv"

print("Testing UID extraction from members.csv:")
print("=" * 50)

tested = 0
success = 0

with open(csv_path, newline='', encoding='utf-8') as csvfile:
    reader = csv.DictReader(csvfile)
    for row_num, row in enumerate(reader, start=2):
        name = row.get('Nombres', '').strip()
        email = row.get('Correo', '').strip()
        birth_date_str = row.get('Fecha de Cumpleaños', '').strip()
        codigo_foto = row.get('Codigo Foto', '').strip()
        columna_1 = row.get('Columna 1', '').strip()

        uid = extract_uid(codigo_foto, columna_1)

        if uid:
            success += 1
            print(f"Row {row_num:3d}: ✓ UID='{uid}' | Name: {name[:20]:<20} | Email: {email[:25]:<25}")
        else:
            print(f"Row {row_num:3d}: ✗ FAILED | Name: {name[:20]:<20} | Codigo Foto: {codigo_foto[:30]:<30} | Columna 1: {columna_1}")

        tested += 1
        if tested >= 10:  # Just test first 10 rows for brevity
            break

print("=" * 50)
print(f"Tested: {tested} rows")
print(f"Successful UID extractions: {success}")
print(f"Success rate: {success/tested*100:.1f}%")