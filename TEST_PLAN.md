# Test Plan: Assembly Engine Rewrite

## Pre-deployment Checklist ✅

- [x] admin.js syntax valid (node --check)
- [x] asamblea-engine.js syntax valid
- [x] firebase-init.js syntax valid
- [x] database.rules.json deployed
- [x] firestore.rules deployed
- [x] hosting deployed to https://luxto-nsp.web.app
- [x] /admins RTDB populated with 3 coordinador UIDs
- [x] All changes committed and pushed

## Critical Tests (Manual - 2 phones + projector)

### Test 1: Admin Panel Load & Auth
- [ ] Open https://luxto-nsp.web.app/pages/admin.html
- [ ] Login as coordinador (one of the 5 hardcoded emails)
- [ ] Verify tabs: "Modo Asamblea", "Gestión de Líderes", "Sugerencias y Feedback"
- [ ] Verify non-coordinador roles don't see restricted tabs

### Test 2: Question Bank (Banco)
- [ ] Click "Recargar banco" - should load questions from Firestore /preguntas
- [ ] Verify questions show checkboxes, text, options, correcta hidden
- [ ] Select 3 questions, click "Cargar seleccionadas a la sesión"
- [ ] Verify toast "✅ 3 preguntas cargadas a la sesión"

### Test 3: Session Flow
- [ ] Toggle asamblea ON → should show "🟡 Lobby"
- [ ] Click "🟢 Iniciar sesión" (or via proyector) → should show "🟠 Cuenta regresiva" then "🟢 Pregunta activa"
- [ ] Verify preguntaActual shows question WITHOUT correcta
- [ ] Verify claves/{qid} in RTDB only readable by admins

### Test 4: Answer Submission (from phone)
- [ ] Open asamblea.html on phone, join with member account
- [ ] Submit answer during "pregunta" phase
- [ ] Verify write-once: second submission rejected
- [ ] Verify answer has serverTimestamp (ts === now)
- [ ] Verify idx validation (0-3)

### Test 5: Close Question & Scoring
- [ ] From admin: click "Cerrar pregunta"
- [ ] Verify phase → "🔵 Respuesta revelada" with correcta shown
- [ ] Verify points calculated per uid (deltaPuntos)
- [ ] Verify puntos/{uid} UPDATED (summed, not overwritten) via transaction
- [ ] Verify resumen shows ranking by session total points

### Test 6: Next Question / Ranking
- [ ] Click "Siguiente →" → should show "📊 Ranking" then "🟢 Pregunta activa" for Q2
- [ ] Repeat for Q3
- [ ] After last question: click "Finalizar asamblea" (coordinador only)

### Test 7: Finalize & Snapshot
- [ ] Click "🏁 Finalizar asamblea" → confirm
- [ ] Verify phase → "🏆 Podio"
- [ ] Verify rankingGlobal updated atomically (email-sanitized keys)
- [ ] Verify snapshot in Firestore: asambleas_kahoot/{fecha} + historico/{anio}/asambleas_kahoot/{fecha}
- [ ] Verify acumulada flag = true (prevents double-finalize)

### Test 8: Security Rules Verification
- [ ] Try to read /asamblea/sesion/claves/{qid} as non-admin → should be DENIED
- [ ] Try to read other users' respuestas → should be DENIED (no .read on respuestas)
- [ ] Try double-submit answer → should be DENIED (write-once)
- [ ] Try submit after cierraEn → should be DENIED
- [ ] Try read suggestions/feedback as non-staff → should be DENIED
- [ ] Verify rankingGlobal readable by all, writable only by admins

### Test 9: Host Election
- [ ] Open admin.html in two browser windows (different coordinador accounts)
- [ ] Both click "Iniciar sesión" - only one should succeed (claimHost)
- [ ] Verify isHost() returns true only for winner

### Test 10: Apagar Asamblea (Soft Reset)
- [ ] Toggle asamblea OFF
- [ ] Verify phase → "⚫ Inactivo" (apagada)
- [ ] Verify sesion/preguntaActual/respuestas/conectados cleared
- [ ] Verify parent node "asamblea" NOT removed (legacy rules compatibility)

## Expected Data Structures

### RTDB (canonical paths)
```
asamblea/
  sesion/
    fase: "pregunta" | "revelada" | "ranking" | "podio" | "lobby" | "countdown" | "apagada"
    cola: [{id, texto, opciones, duracion}]  // SIN correcta
    indice: 1
    claves/{qid}: {correcta: 0}  // admin-only read
    puntos/{uid}: 1500
    resumen: [{uid, nombre, pts}]  // top 20
    acumulada: false
    hostUid: "uid123"
  preguntaActual: {id, numero, texto, opciones, duracion, abreEn, cierraEn, correcta?, estado?}
  respuestas/{qid}/{uid}: {idx, ts: serverTimestamp, nombre}
  conectados/{uid}: {nombre, ts}

rankingGlobal/{email_sanitized}: {pts, nombre, email, fotoUrl, ultimaAsamblea}
admins/{uid}: {email, rol, ts}
borradores/{pushId}: {...}
```

### Firestore
```
preguntas/{id}: {texto, opciones, correcta, duracion, createdAt, updatedAt}
asambleas_kahoot/{fecha}: {fecha, puntosSesion, resumen, totalPreguntas, creadoEn}
historico/{anio}/asambleas_kahoot/{fecha}: {same}
suggestions/{id}: {uid, nombre, tema, descripcion, createdAt}
feedback/{id}: {uid, nombre, asambleaFecha, comentario, puntuacion, createdAt}
members/{uid}: {nombre, email, rol, fotoUrl, ...}
```

## Rollback Plan

If critical issues found:
1. `git revert 4372bdb`
2. `firebase deploy --only hosting,firestore,database`
3. Verify previous commit dd7b1e8 works

## Notes

- The 2 remaining coordinador emails (gianfracamones@gmail.com, alvarorodrigosalazar.2001@gmail.com) need to be added to /admins when those users first login
- updateMemberRole in admin.js handles adding/removing from /admins automatically
- Legacy paths (activa, estado, preguntaNum, borradores) kept for proyector/asamblea migration