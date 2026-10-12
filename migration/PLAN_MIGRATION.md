# Migration Plan: Remaining Sheets to Firebase

This document outlines the migration strategy for all remaining Google Sheets data to Firebase Firestore, following the zero-cost approach (no Firebase Storage for photos, keeping photos in Google Drive).

## Sheets Migration Status

Based on the exported CSV files in `migration/sheets_export/`, the following sheets have been migrated:

✅ **members.csv** (Lista de cumpleaños) - migrated via `migrate_members_improved.py`
✅ **asistencia.csv** (Asistencia sheet) - migrated via `migrate_asistencia.py`
✅ **attendance_log.csv** (Log_Asistencia sheet) - migrated via `migrate_attendance_log.py`
✅ **config.csv** (Configuracion sheet) - migrated via `migrate_config.py`
✅ **suggestions.csv** (Sugerencias sheet) - migrated via `migrate_suggestions.py`
✅ **feedback.csv** (Feedback sheet) - migrated via `migrate_feedback.py`
✅ **caporales_2026.csv** (Caporales 2026 sheet) - migrated via `migrate_caporales_2026.py`
✅ **polladas_pastoral.csv** (Polladas Pastoral sheet) - migrated via `migrate_polladas_pastoral.py`
✅ **votaciones_aniversario.csv** (Votaciones_Aniversario sheet) - migrated via `migrate_votaciones_aniversario.py`
✅ **lista_asistentes_ejutor_2026.csv** (Lista asistentes EJUTOR 2026) - migrated via `migrate_ejutor_2026_attendees.py`
✅ **stats.csv** (Estadistica sheet) - migrated via `migrate_estadistica.py` (dashboard structure only)

## Migration Approach Used

For each sheet, we created a Python migration script that:
1. Read the CSV file from `migration/sheets_export/`
2. Processed and cleaned the data (handling empty values, parsing dates, converting values)
3. Wrote to appropriate Firestore collections
4. Followed the zero-cost approach (no Firebase Storage usage)
5. Provided detailed logging for verification

## Firestore Data Model Implemented

### collections/members (from Lista de cumpleaños)
- Document ID: UID (from Columna 1 or extracted from Codigo Foto URL)
- Fields: name, email, birthDate (ISO string), fotoDriveId (Drive ID or URL), rol, estadoAnioActual, etc.

### collections/asambleas/{fecha} (from Configuracion)
- Document ID: fecha (YYYY-MM-DD)
- Fields: date, has_assembly (bool), start_time, observations, tema, ponentes, created_at

### collections/asistencia/{anio}/{fecha}/{uid} (from Asistencia + Log_Asistencia)
- Fields: presente (bool), horaLlegadaServidor (server timestamp), tardanzaMinutos, esTardanza (bool)

### collections/attendance_log (from Log_Asistencia - legacy backup)
- Document ID: auto-generated ID
- Fields: timestamp, name, trimester, cell, present, lateness_minutes, date, created_at

### collections/config (from Configuracion - legacy backup)
- Document ID: date (YYYY-MM-DD)
- Fields: date, has_assembly, start_time, observations, created_at

### collections/suggestions (from Sugerencias)
- Document ID: auto-generated ID
- Fields: date_sent, name, email, suggestion, week, status, created_at

### collections/feedback (from Feedback)
- Document ID: auto-generated ID
- Fields: date_submitted, name, email, rating, comment, assembly_date, created_at

### collections/caporales_2026 (from Caporales 2026 sheet)
- Document ID: sanitized member name
- Fields: name, attendance (map), total_rehearsals, attended_count, missed_count, attendance_percentage, status, updated_at

### collections/polladas_pastoral (from Polladas Pastoral sheet)
- Document ID: auto-generated ID
- Fields: name, received_pollada, cancelled, payment_method, cost_per_person, total_cost, recorded_at

### collections/votaciones_aniversario (from Votaciones_Aniversario sheet)
- Document ID: auto-generated ID
- Fields: timestamp, voter_name, category, voted_for, session_id, date, created_at

### collections/ejutor_2026_attendees (from Lista asistentes EJUTOR 2026)
- Document ID: DNI (if valid) or auto-generated
- Fields: full_name, age, dni, email, phone, registration_date, status, created_at

### collections/stats_dashboard (from Estadistica sheet)
- Document ID: 'metadata'
- Fields: dashboard_title, dashboard_subtitle, section_headers, column_headers, formulas_info, note, timestamps

### collections/tablas_dinamicas/{anio}/{tablaId}/{rowId} (restructured 2026-09-12)
- Migrated from Caporales, Polladas, Votaciones, EJUTOR sheets

### collections/tablas_definiciones/{tablaId} (restructured 2026-09-12)
- Column definitions for dynamic tables; EJUTOR marked `restringida: true` (DNI)

### collections/miembros_registro/{uid} (restructured 2026-09-12)
- Public lookup for registration (name only)

### collections/historico/{anio}/... (restructured 2026-09-12)
- Frozen snapshots of suggestions, feedback, asambleas_kahoot, tablas_dinamicas, members

## Zero-Cost Constraints Followed
- Photos remain in Google Drive (using existing `convertirUrlDrive()` frontend function)
- No Firebase Storage usage to avoid costs
- Firestore only on free tier
- All dates stored as ISO strings to avoid timestamp complications

## Verification Completed
After each migration, verification was performed to ensure:
- Data integrity (no data loss)
- Proper Firestore document structure
- Record counts matched source CSV data
- Frontend compatibility maintained (for member data and photos)

## Migration Order Used
1. config.csv (simple structure, good for testing)
2. suggestions.csv and feedback.csv (similar structure)
3. attendance_log.csv (detailed attendance records)
4. config-dependent sheets (caporales, polladas, votaciones, ejutor)
5. core data (members, asistencia)
6. stats.csv (last, as it contains mostly formulas)

## Next Steps

**✅ MIGRACIÓN COMPLETADA (2026-09-12)** — 1.125 documentos escritos al modelo final definido en `PLAN_MIGRACION_LUXTO_NSP.md` (sección 3). Las colecciones planas de la primera pasada (`attendance`, `config`, `caporales_2026`, etc.) quedan solo como respaldo histórico; **ya no son la fuente de verdad**.

Para validar y pasar a producción:
1. **Validar con el coordinador** en el link de preview:  
   `https://luxtonsp-bot.github.io/luxto-nsp/preview/feature-firebase-migration/`
2. **Merge a `main`** tras aprobación → despliegue automático a producción.
3. (Opcional) Revocar acceso de escritura a Google Sheets/Drive originales.