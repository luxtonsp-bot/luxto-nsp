#!/usr/bin/env python3
"""
Backfill script: Add fechaNacimientoMMdd field to all members in Firestore.
This field is required for the birthday email workflow to efficiently query birthdays.
"""
import os
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# Initialize Firebase Admin SDK
cred = credentials.Certificate('firebase-service-account.json')
firebase_admin.initialize_app(cred)

db = firestore.client()

def backfill_mmdd():
    members_ref = db.collection('members')
    members_snapshot = members_ref.get()

    if len(members_snapshot) == 0:
        print('No members found')
        return

    updated = 0
    skipped = 0
    errors = 0

    for doc in members_snapshot:
        member = doc.to_dict()
        nombre = member.get('nombre', 'Sin nombre')
        birthdate_field = member.get('fechaNacimiento') or member.get('birthDate')

        if not birthdate_field:
            print(f"⏭️  {nombre}: no birthdate field, skipping")
            skipped += 1
            continue

        # If already has MM-dd, skip
        if member.get('fechaNacimientoMMdd'):
            print(f"✅ {nombre}: already has fechaNacimientoMMdd = {member['fechaNacimientoMMdd']}")
            skipped += 1
            continue

        # Parse the birthdate and extract MM-dd
        try:
            if hasattr(birthdate_field, 'seconds'):
                # Firestore timestamp
                dt = datetime.fromtimestamp(birthdate_field.seconds)
            elif isinstance(birthdate_field, str):
                # Try to parse the string (ISO format from migration: '1997-04-15T00:00:00' or '1997-04-15')
                for fmt in ('%Y-%m-%dT%H:%M:%S', '%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y/%m/%d'):
                    try:
                        dt = datetime.strptime(birthdate_field, fmt)
                        break
                    except ValueError:
                        continue
                else:
                    print(f"❌ {nombre}: could not parse birthdate '{birthdate_field}'")
                    errors += 1
                    continue
            else:
                print(f"❌ {nombre}: unexpected birthdate type {type(birthdate_field)}")
                errors += 1
                continue

            mmdd = dt.strftime('%m-%d')

            # Update the document
            doc.reference.update({'fechaNacimientoMMdd': mmdd})
            print(f"✅ {nombre}: added fechaNacimientoMMdd = {mmdd}")
            updated += 1

        except Exception as e:
            print(f"❌ {nombre}: error processing birthdate: {e}")
            errors += 1

    print(f"\n--- Resumen ---")
    print(f"Actualizados: {updated}")
    print(f"Saltados (ya tenían o sin fecha): {skipped}")
    print(f"Errores: {errors}")

if __name__ == "__main__":
    backfill_mmdd()