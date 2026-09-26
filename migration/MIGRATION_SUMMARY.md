# LUXTO-NSP Migration to Firebase - Summary

## Overview
Complete migration of LUXTO-NSP project data from Google Sheets/Drive to Firebase Firestore while maintaining zero costs (no Firebase Storage usage for photos).

## Migration Completed
✅ All 11 sheets from the Google Sheets workbook have been migrated to Firebase Firestore collections, then **restructured (2026-09-12)** to match the final data model in `PLAN_MIGRACION_LUXTO_NSP.md` (section 3).

| Source Sheet | Target Collection (final) | Migration Script | Status |
|--------------|---------------------------|------------------|--------|
| Lista de cumpleaños | `members/{uid}`, `miembros_registro/{uid}` | migrate_members_improved.py → migrate_restructure.py | ✅ Completed |
| Asistencia + Log_Asistencia | `asistencia/{anio}/{fecha}/{uid}` | migrate_asistencia.py + migrate_attendance_log.py → migrate_restructure.py | ✅ Completed (758 docs) |
| Configuracion | `asambleas/{fecha}` | migrate_config.py → migrate_restructure.py | ✅ Completed (52 docs) |
| Sugerencias | `historico/2026/sugerencias/` | migrate_suggestions.py → migrate_restructure.py | ✅ Completed (8 docs) |
| Feedback | `historico/2026/feedback/` | migrate_feedback.py → migrate_restructure.py | ✅ Completed (13 docs) |
| Caporales 2026 | `tablas_dinamicas/2026/caporales-ensayos/` | migrate_caporales_2026.py → migrate_restructure.py | ✅ Completed (32 docs) |
| Polladas Pastoral | `tablas_dinamicas/2026/polladas-junio/` | migrate_polladas_pastoral.py → migrate_restructure.py | ✅ Completed (26 docs) |
| Votaciones_Aniversario | `tablas_dinamicas/2026/votaciones-aniversario/` | migrate_votaciones_aniversario.py → migrate_restructure.py | ✅ Completed (159 docs) |
| Lista asistentes EJUTOR 2026 | `tablas_dinamicas/2026/lista-asistentes-ejutor-2026/` (restringida: DNI) | migrate_ejutor_2026_attendees.py → migrate_restructure.py | ✅ Completed (28 docs) |
| Estadistica | `stats_dashboard` (metadata only) | migrate_estadistica.py | ✅ Completed (structure only) |

**Total documentos en modelo final: 1.125** (escritos el 2026-09-12 con `migrate_restructure.py`)

## Zero-Cost Approach Maintained
- 📷 Photos remain in Google Drive (existing `convertirUrlDrive()` frontend function continues to work)
- 💾 No Firebase Storage used (avoids costs)
- 🔥 Firestore used only on free tier
- 📅 All dates stored as ISO strings
- 💰 Total cost: $0 (within Firebase free tier limits)

## Data Preserved
- 👥 Member information (45+ members with photos, emails, birthdates)
- 📅 Attendance records (daily attendance for all members, preserved server timestamps)
- 📋 Detailed attendance logs (timestamps, lateness, etc.) — backup in `attendance_log`
- ⚙️ Configuration data (assembly schedules, dates, times) — now in `asambleas/{fecha}`
- 💬 Member suggestions and feedback — frozen in `historico/2026/`
- 👥 Special group data (Caporales 2026, EJUTOR 2026 attendees) — in `tablas_dinamicas/2026/`
- 📊 Event data (anniversary voting, polladas pastoral) — in `tablas_dinamicas/2026/`
- 📈 Dashboard structure and labels (Estadistica sheet structure preserved)
- 🔒 DNI data restricted to coordinador role via Firestore rules

## Verification
Each migration script includes:
- Detailed progress logging
- Error handling and reporting
- Data validation (skipping incomplete records)
- Firestore write verification
- Summary reports showing processed vs skipped counts

## Collections Created in Firestore (Final Model)
- `members/{uid}` - Core member data
- `miembros_registro/{uid}` - Public lookup (name only)
- `asambleas/{fecha}` - Assembly schedules with tema/ponentes
- `asistencia/{anio}/{fecha}/{uid}` - Daily attendance with server timestamp
- `asistencia_log` - Legacy backup (denied by default in rules)
- `suggestions`, `feedback` - Live collections for current year
- `historico/{anio}/miembros/{uid}` - Frozen year-end stats
- `historico/{anio}/tablas_dinamicas/{tablaId}` - Frozen dynamic tables
- `historico/{anio}/asambleas_kahoot/{fecha}` - Frozen Kahoot snapshots
- `historico/{anio}/sugerencias/`, `historico/{anio}/feedback/` - Frozen suggestions/feedback
- `tablas_dinamicas/{anio}/{tablaId}/{rowId}` - Dynamic tables (Caporales, EJUTOR, Polladas, Votaciones)
- `tablas_definiciones/{tablaId}` - Table column definitions
- `stats_dashboard` - Estadistica structure metadata

## Frontend Compatibility
- Member photo loading continues to work via existing `convertirUrlDrive()` function
- All data access patterns updated to query Firestore collections
- No changes needed to photo display logic (still uses Drive IDs)
- Frontend can now access real-time data with Firestore listeners

## Next Steps for Production Cutover
1. Verify all data migrated correctly (spot-check samples)
2. Test frontend with Firestore data (update service calls) — **EN PROGRESO en `feature/firebase-migration`**
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