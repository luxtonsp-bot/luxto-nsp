# Data Migration Guide — Sheets/Drive → Firebase

This folder contains tools and instructions to migrate existing data from Google Sheets and Google Drive to Firebase (Firestore and Storage) for the LUXTO-NSP project.

## Prerequisites
- Google Service Account JSON with access to the target Google Sheet and Drive folder.
- Firebase Service Account JSON (required for Admin SDK). Obtain from Firebase Console > Project Settings > Service Accounts > Generate new private key.
- Node.js >= 14 or Python 3.8+ (choose your preferred language).

## Steps

### 1. Export Sheets Data
- Make a copy of the production spreadsheet (or request export from coordinator).
- Export each relevant sheet as CSV:
  - `Lista de cumpleaños` → `members.csv`
  - `Estadistica` → `stats.csv`
  - `Asistencia` → `attendance.csv`
  - `Log_Asistencia` → `attendance_log.csv` (if separate)
  - `Configuracion` → `config.csv`
  - `Caporales 2026`, `Polladas Pastoral`, `Votaciones_Aniversario`, `Caja Luxto`, `Lista asistentes EJUTOR 2026` → each as separate CSV.
  - `Sugerencias` → `suggestions.csv`
  - `Feedback` → `feedback.csv`

Place exported CSVs in this folder under `sheets_export/`.

### 2. Export Drive Photos
- Use Google Drive API or Apps Script to download each member's photo using the `Codigo Foto` (Drive file ID) from the `Lista de cumpleaños` sheet.
- Save each photo as `<uid>.<ext>` in `photos_export/`.
- Maintain a mapping CSV: `uid, original_filename, mime_type` if needed.

### 3. Run Migration Script
- Choose language: Python (recommended) or Node.js.
- **Use the improved script**: `migrate_members_improved.py` which properly handles your specific Excel data format:
  1. Reads CSVs and builds member documents.
  2. Extracts UID correctly from either "Columna 1" or "Codigo Foto" URL.
  3. Parses dates from Excel format.
  4. Uploads photos to Firebase Storage (`memberPhotos/{uid}.{ext}`).
  5. Writes member documents to Firestore (`members/{uid}`) with fields: name, email, birthDate (timestamp), fotoUrl (Storage download URL), rol (default "miembro"), estadoAnioActual, fechaIngresoGrupo (timestamp), generation, etc.
- To migrate other collections (stats, attendance, config, etc.), similar scripts can be created following the same pattern: read CSV, process data, write to appropriate Firestore collections and/or Firebase Storage.

### 4. Verify
- Compare row counts between CSV and Firestore collections.
- Spot-check a few members: name, email, photo URL resolves.
- Ensure security rules allow correct access.

### 5. Cutover
- Once verified, revoke write access to the original Sheet and Drive folder (keep as read-only backup).
- Update any frontend constants if needed (currently none; all data comes from Firestore/Storage).

## Scripts
- `migrate_members.py` — original basic Python script using `firebase-admin`.
- `migrate_members_improved.py` — **recommended** Python script that properly handles the specific format of your exported Excel data:
  - Extracts UID correctly from either "Columna 1" or "Codigo Foto" URL
  - Parses dates from Excel format
  - Handles missing data gracefully
- `upload_photos.py` — placeholder for photo upload; the member migration script handles photo upload.

## Notes
- The Firestore data model is defined in `PLAN_MIGRAT...md` and reflected in `firestore.rules`.
- This migration is a one-time cutover; ongoing writes will go directly to Firebase via frontend/admin tools.