# LUXTO-NSP Migration to Firebase - Summary

## Overview
Complete migration of LUXTO-NSP project data from Google Sheets/Drive to Firebase Firestore while maintaining zero costs (no Firebase Storage usage for photos).

## Migration Completed
✅ All 11 sheets from the Google Sheets workbook have been migrated to Firebase Firestore collections:

| Source Sheet | Target Collection | Migration Script | Status |
|--------------|-------------------|------------------|--------|
| Lista de cumpleaños | members | migrate_members_improved.py | ✅ Completed |
| Asistencia | attendance | migrate_asistencia.py | ✅ Completed |
| Log_Asistencia | attendance_log | migrate_attendance_log.py | ✅ Completed |
| Configuracion | config | migrate_config.py | ✅ Completed |
| Sugerencias | suggestions | migrate_suggestions.py | ✅ Completed |
| Feedback | feedback | migrate_feedback.py | ✅ Completed |
| Caporales 2026 | caporales_2026 | migrate_caporales_2026.py | ✅ Completed |
| Polladas Pastoral | polladas_pastoral | migrate_polladas_pastoral.py | ✅ Completed |
| Votaciones_Aniversario | votaciones_aniversario | migrate_votaciones_aniversario.py | ✅ Completed |
| Lista asistentes EJUTOR 2026 | ejutor_2026_attendees | migrate_ejutor_2026_attendees.py | ✅ Completed |
| Estadistica | stats_dashboard | migrate_estadistica.py | ✅ Completed (structure only) |

## Zero-Cost Approach Maintained
- 📷 Photos remain in Google Drive (existing `convertirUrlDrive()` frontend function continues to work)
- 💾 No Firebase Storage used (avoids costs)
- 🔥 Firestore used only on free tier
- 📅 All dates stored as ISO strings
- 💰 Total cost: $0 (within Firebase free tier limits)

## Data Preserved
- 👥 Member information (45+ members with photos, emails, birthdates)
- 📅 Attendance records (daily attendance for all members)
- 📋 Detailed attendance logs (timestamps, lateness, etc.)
- ⚙️ Configuration data (assembly schedules, dates, times)
- 💬 Member suggestions and feedback
- 👥 Special group data (Caporales 2026, EJUTOR 2026 attendees)
- 📊 Event data (anniversary voting, polladas pastoral)
- 📈 Dashboard structure and labels (Estadistica sheet structure preserved)

## Verification
Each migration script includes:
- Detailed progress logging
- Error handling and reporting
- Data validation (skipping incomplete records)
- Firestore write verification
- Summary reports showing processed vs skipped counts

## Usage Instructions
To run migrations:
1. Place Firebase service account JSON at: `migration/firebase-service-account.json`
2. Ensure CSV exports are in: `migration/sheets_export/`
3. Run individual migrations: `python3 migration/migrate_[sheetname].py`
4. For member migration (includes photos): `python3 migration/migrate_members_improved.py`

## Collections Created in Firestore
- `members` - Core member data
- `attendance` - Daily attendance records
- `attendance_log` - Detailed attendance logs with timestamps
- `config` - Assembly schedules and configurations
- `suggestions` - Member suggestions
- `feedback` - Member feedback with ratings
- `caporales_2026` - Caporales group attendance and status
- `polladas_pastoral` - Pollada participation records
- `votaciones_aniversario` - Anniversary voting data
- `ejutor_2026_attendees` - EJUTOR 2026 attendee list
- `stats_dashboard` - Estadistica dashboard structure (metadata only)

## Frontend Compatibility
- Member photo loading continues to work via existing `convertirUrlDrive()` function
- All data access patterns can be updated to query Firestore collections
- No changes needed to photo display logic (still uses Drive IDs)
- Frontend can now access real-time data with Firestore listeners

## Next Steps for Production Cutover
1. Verify all data migrated correctly (spot-check samples)
2. Test frontend with Firestore data (update service calls)
3. Once verified, revoke write access to original Google Sheets (keep as read-only backup)
4. Monitor Firestore usage to ensure staying within free tier limits
5. Set up data backup procedures if needed (Firestore export)

## Total Migration Scripts Created
11 Python migration scripts in `/migration/` directory:
- migrate_asistencia.py
- migrate_attendance_log.py
- migrate_caporales_2026.py
- migrate_config.py
- migrate_ejutor_2026_attendees.py
- migrate_members_improved.py
- migrate_members_no_storage.py (alternative zero-storage version)
- migrate_members.py (original version)
- migrate_polladas_pastoral.py
- migrate_suggestions.py
- migrate_estadistica.py
- migrate_votaciones_aniversario.py
- migrate_feedback.py

## Documentation
- Detailed README: `migration/README.md`
- Migration plan: `migration/PLAN_MIGRATION.md`
- Individual script headers contain usage instructions
- This summary: `migration/MIGRATION_SUMMARY.md`

## Conclusion
Successfully migrated all LUXTO-NSP data from Google Sheets/Drive to Firebase Firestore with zero ongoing costs. The project now has a scalable, real-time backend while preserving all existing data and maintaining frontend compatibility for photo display.

---

## RE-ESTRUCTURACIÓN (2026-09-12): inflada al modelo del plan

La primera migración grabó todo en colecciones planas (`attendance`, `config`,
`caporales_2026`, ...), que NO coincidían con el modelo definido en
`PLAN_MIGRACION_LUXTO_NSP.md` (sección 3) ni con lo que el frontend consulta
(`asambleas`, `asistencia/{anio}/...`, `tablas_dinamicas`, ...).

`migrate_restructure.py` re-reparte los mismos CSVs hacia las colecciones del plan:

| Colección destino | Fuente | Documentos |
|---|---|---|
| `asambleas/{fecha}` | Configuracion | 52 |
| `asistencia/2026/{fecha}/{uid}` | Asistencia + Log_Asistencia (timestamps preservados) | 758 |
| `historico/2026/sugerencias/` | Sugerencias (2026 ya es histórico, sección 11.6) | 8 |
| `historico/2026/feedback/` | Feedback | 13 |
| `tablas_dinamicas/2026/{tablaId}/` | Caporales (32), Polladas (26), Votaciones (159), EJUTOR (28) | 245 |
| `tablas_definiciones/{tablaId}` | definición de columnas; EJUTOR marcada `restringida: true` (DNI) | 4 |
| `miembros_registro/{uid}` | solo nombre, lookup público para el registro sin sesión | 45 |

**Total: 1.125 documentos** escritos el 2026-09-12. IDs deterministas (`row-N`, `sug-N`,
`fb-N`): re-ejecutar sobrescribe, no duplica.

Las colecciones planas de la primera pasada quedan como respaldo — ya no son fuente de
verdad. `firestore.rules` las deja denegadas por defecto (acceder a ellas falla, a
propósito).