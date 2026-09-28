# Assembly Engine Rewrite - Completion Summary

## Overview
Complete rewrite of the assembly/Kahoot engine around a single RTDB state machine with strict security rules, host election, idempotent scoring, server-time sync, and XSS prevention.

## Files Modified

### 1. assets/js/firebase-init.js (Core SDK + Helpers)
- **Fixed exports**: Proper re-export of all Firebase SDK functions (RTDB, Firestore, Auth)
- **rtdbTS**: Now a function returning `serverTimestamp` (not a const redeclaration)
- **syncServerTime**: Uses `onValue` on `.info/serverTimeOffset` for server-time sync
- **esc()**: XSS prevention helper
- **RTDB_PATHS**: Canonical paths for assembly state machine
- **isStaff()/isCoordinator()**: Role verification helpers

### 2. assets/js/asamblea-engine.js (State Machine)
- **initAsambleaEngine()**: Initializes all RTDB listeners (fase, cola, indice, preguntaActual, conectados, respuestas, puntos, resumen, acumulada, hostUid)
- **claimHost()/releaseHost()/isHost()**: Single-leader election via `/admins` RTDB
- **setSesionCola()**: Loads questions from Firestore `/preguntas` WITHOUT correcta
- **nextPregunta()**: Reads correcta from Firestore at launch, stores in `claves/{qid}` (admin-only)
- **cerrarPregunta()**: Idempotent - SUMS points via per-uid transactions, reveals correcta
- **finalizarSesion()**: Atomic transaction on `acumulada` flag, accumulates to `rankingGlobal` with email-sanitized keys, creates Firestore snapshots
- **apagarAsamblea()**: Soft reset (clears children, preserves parent for legacy rules)
- **responder()**: Write-once with `rtdbTS()` serverTimestamp, phase gating, qid validation

### 3. assets/js/admin.js (Admin Panel)
- **Removed duplicate blocks** that caused syntax error at line 80
- **Added rtdbTS import** and usage in `updateMemberRole`
- **Delegated all assembly actions** to asamblea-engine
- **Banco/Cola UI**: loadPreguntasBanco, savePreguntaAdmin, deletePreguntaAdmin, cargarColaSesion
- **Role-based tab access**: Coordinador sees all tabs, others restricted
- **updateMemberRole**: Syncs `/admins` RTDB (adds staff, removes miembro)

### 4. database.rules.json (RTDB Security)
- **Removed `asamblea/.read: true`** - was exposing claves and other users' responses
- **Per-child reads**: preguntaActual, conectados, resumen readable by all
- **claves**: Admin-only read/write
- **respuestas**: Write-once validation (qid match, ts===now, idx 0-3, phase gating, cierraEn check)
- **rankingGlobal**: Uses `$key` (email-sanitized), readable by all, writable by admins
- **Legacy rules preserved**: borradores, activa, estado, preguntaNum for migration

### 5. firestore.rules (Firestore Security)
- **suggestions/feedback read**: Changed from `true` to `isStaff()` - prevents public access
- **preguntas**: Staff read/write, Coordinator delete (contains correcta)
- **asambleas_kahoot/historico**: Staff write, auth read
- **members**: Self read, staff list, coordinator manages roles

### 6. pages/admin.html (Admin UI)
- **Added banco/cola UI**: preguntas-banco container with checkboxes, "Recargar banco" and "Cargar seleccionadas" buttons
- **Separated "Banco de Preguntas" (Firestore)** from "Borradores (RTDB)"
- **Tab navigation**: Protected by role (coordinador only for Gestión de Líderes, Sugerencias)

### 7. /admins RTDB (Backfilled)
- Added 3 coordinador UIDs with email, rol, timestamp
- Remaining 2 to be added when those users first login (via updateMemberRole)

## Key Bugs Fixed (from dd7b1e8 diagnostic)

| Bug | Fix |
|-----|-----|
| admin.js duplicate blocks + line 80 error | Removed duplicates, verified syntax |
| firebase-init.js: `rtdbTS` redeclaration, missing exports | Function export, full SDK re-export |
| asamblea-engine.js: puntos path `.replace()` on function | Uses `RTDB_PATHS.puntosRoot` |
| correcta always 'A' (read from cola without correcta) | Reads from Firestore at launch |
| cerrarPregunta overwrote points instead of summing | Per-uid transactions with SUMA |
| responder used client timestamp | Uses `rtdbTS()` serverTimestamp |
| rankingGlobal key mismatch (uid vs email) | Email-sanitized keys in transactions |
| deletePregunta used RTDB remove on Firestore doc | Uses `deleteDoc` |
| No auto-timers for countdown→pregunta, close at cierraEn | setTimeout in nextPregunta/cerrarPregunta |
| apagarAsamblea remove('asamblea') blocked by rules | Soft reset (remove children only) |
| database.rules: asamblea/.read:true exposes secrets | Removed, per-child reads added |
| database.rules: respuestas no write-once validation | Added .validate with qid, ts, idx, phase, cierraEn |
| firestore.rules: suggestions/feedback public read | Changed to isStaff() |

## Deployment Status
- ✅ Firestore rules deployed
- ✅ RTDB rules deployed
- ✅ Hosting deployed to https://luxto-nsp.web.app
- ✅ All changes committed (4372bdb) and pushed to feature/firebase-migration
- ✅ All syntax checks pass

## Next Steps (Post-Deploy Testing)
1. Manual test with 2 phones + projector (see TEST_PLAN.md)
2. Verify claves blocked for non-admin
3. Verify double-response rejected
4. Verify points accumulate correctly across questions
5. Verify rankingGlobal atomic accumulation
6. Verify snapshot creation in Firestore
7. Migrate proyector.html and asamblea.html to use engine

## Architecture Notes
- Single source of truth: RTDB state machine at `asamblea/sesion/`
- Firestore: Question bank (`/preguntas`), historical snapshots
- Host election: RTDB `/admins` sync with Firestore roles
- Server time: `.info/serverTimeOffset` for precise timers
- Security: Write-once responses, admin-only claves, role-gated actions
- Idempotency: Transactions on puntos, acumulada, rankingGlobal