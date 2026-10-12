#!/usr/bin/env python3
"""
Process member photos from the downloaded zip file.
Extracts photos and renames them to match the UID from the CSV.

Assumptions:
- The zip file contains photos named foto_usuario_X.jpg
- These photos correspond to members in the CSV in order (skipping rows without UID/name)
- We'll match by order: first valid member gets first photo, etc.
"""

import os
import zipfile
import csv
import re
import shutil
from pathlib import Path

def extract_uid(codigo_foto, columna_1):
    """Extract UID from either Columna 1 or Codigo Foto URL"""
    if columna_1 and str(columna_1).strip():
        return str(columna_1).strip()

    if codigo_foto and str(codigo_foto).strip():
        codigo_foto_str = str(codigo_foto).strip()
        match = re.search(r'[?&]id=([^&\s]+)', codigo_foto_str)
        if match:
            return match.group(1)
        if len(codigo_foto_str) > 10 and not codigo_foto_str.startswith('http'):
            return codigo_foto_str

    return None

def main():
    # Paths
    base_dir = "/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp"
    zip_path = os.path.join(base_dir, "fotos_miembros", "drive-download-20260911T232148Z-1-001.zip")
    csv_path = os.path.join(base_dir, "migration", "sheets_export", "members.csv")
    photos_export_dir = os.path.join(base_dir, "migration", "photos_export")
    temp_extract_dir = os.path.join(base_dir, "temp_photos")

    # Ensure directories exist
    Path(photos_export_dir).mkdir(parents=True, exist_ok=True)
    Path(temp_extract_dir).mkdir(parents=True, exist_ok=True)

    print(f"Extracting photos from: {zip_path}")
    print(f"Extracting to: {temp_extract_dir}")

    # Extract zip
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(temp_extract_dir)

    # Get list of extracted photos and sort by number
    photo_files = []
    for f in os.listdir(temp_extract_dir):
        if f.lower().endswith(('.jpg', '.jpeg', '.png')):
            # Extract number from foto_usuario_X.jpg
            match = re.search(r'foto_usuario_(\d+)', f, re.IGNORECASE)
            if match:
                num = int(match.group(1))
                photo_files.append((num, f))
            else:
                # If no number found, put at beginning
                photo_files.append((0, f))

    # Sort by the number we extracted
    photo_files.sort(key=lambda x: x[0])
    photo_files = [f[1] for f in photo_files]  # Keep just the filename

    print(f"Found {len(photo_files)} photos in zip, sorted by number")

    # Read CSV to get members with UIDs and names
    members_with_uids = []

    with open(csv_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        # Clean up fieldnames (strip whitespace)
        if reader.fieldnames:
            reader.fieldnames = [name.strip() if name else name for name in reader.fieldnames]

        for row_num, row in enumerate(reader, start=2):  # start at 2 (header is row 1)
            # Get values with safe handling for None
            name_val = row.get('Nombres')
            name = str(name_val).strip() if name_val is not None else ''

            correo_val = row.get('Correo')
            email = str(correo_val).strip() if correo_val is not None else ''

            fecha_val = row.get('Fecha de Cumpleaños')
            birth_date_str = str(fecha_val).strip() if fecha_val is not None else ''

            codigo_foto_val = row.get('Codigo Foto')
            codigo_foto = str(codigo_foto_val).strip() if codigo_foto_val is not None else ''

            columna_1_val = row.get('Columna 1')
            columna_1 = str(columna_1_val).strip() if columna_1_val is not None else ''

            uid = extract_uid(codigo_foto, columna_1)

            # Only consider members that have both a name and a UID
            if name and uid:
                members_with_uids.append({
                    'row': row_num,
                    'name': name,
                    'uid': uid,
                    'email': email,
                    'birth_date_str': birth_date_str
                })

    print(f"Found {len(members_with_uids)} members with both name and UID in CSV")

    # Match photos to members by order
    print("\nMatching photos to members...")
    matched = 0
    used_photos = set()

    for i, member in enumerate(members_with_uids):
        if i < len(photo_files):
            photo_filename = photo_files[i]
            photo_path = os.path.join(temp_extract_dir, photo_filename)

            # Create destination filename: <UID>.jpg (we'll use jpg for all, but keep original extension)
            file_ext = os.path.splitext(photo_filename)[1].lower()
            if file_ext not in ['.jpg', '.jpeg', '.png']:
                file_ext = '.jpg'  # default

            dest_filename = f"{member['uid']}{file_ext}"
            dest_path = os.path.join(photos_export_dir, dest_filename)

            # Copy the photo
            try:
                shutil.copy2(photo_path, dest_path)
                print(f"Matched: {member['name']} (UID: {member['uid']}) <- {photo_filename} -> {dest_filename}")
                matched += 1
                used_photos.add(photo_filename)
            except Exception as e:
                print(f"Error copying photo for {member['name']}: {e}")
        else:
            print(f"Warning: Not enough photos for member {member['name']} (UID: {member['uid']})")

    print(f"\nSuccessfully matched {matched} members to photos.")
    print(f"Photos are ready in: {photos_export_dir}")

    # Cleanup
    shutil.rmtree(temp_extract_dir, ignore_errors=True)
    print(f"Cleaned up temporary directory: {temp_extract_dir}")

if __name__ == "__main__":
    main()