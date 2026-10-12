# Inventario Completo de Accesos RTDB — luxto-nsp

Este documento lista **todas** las rutas RTDB accedidas desde el código cliente (`asamblea-engine.js`, `asamblea-participant.js`, `proyector_logic.js`, `admin.js`) con su operación (read/write), el rol requerido por las reglas actuales y el archivo de origen.

---

## Rutas de Asamblea (`asamblea/`)

| Ruta RTDB | Operación | Rol Requerido (Reglas Actuales) | Archivo(s) Origen | Descripción |
|-----------|-----------|----------------------------------|-------------------|-------------|
| `asamblea/sesion/fase` | READ | `auth != null` | asamblea-engine.js (L134) | Listener fase actual |
| `asamblea/sesion/fase` | WRITE | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L112), admin.js (L420) | Cambiar fase |
| `asamblea/activa` | READ | `auth != null` | asamblea-engine.js (L128) | Estado asamblea activa |
| `asamblea/activa` | WRITE | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L116), admin.js (L419, L431) | Activar/desactivar asamblea |
| `asamblea/sesion/cola` | READ | `auth != null` | asamblea-engine.js (L142) | Cola de preguntas |
| `asamblea/sesion/cola` | WRITE | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L374, L839), admin.js (L426) | Setear cola |
| `asamblea/sesion/indice` | READ | `auth != null` | asamblea-engine.js (L148) | Índice pregunta actual |
| `asamblea/sesion/indice` | WRITE | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L375, L456, L840), admin.js (L426) | Avanzar/indice |
| `asamblea/sesion/claves/{qid}` | READ | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L524, L938) | Leer clave respuesta correcta |
| `asamblea/sesion/claves/{qid}` | WRITE | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L480) | Guardar clave correcta |
| `asamblea/preguntaActual` | READ | `auth != null` | asamblea-engine.js (L154), asamblea-participant.js (via engine) | Pregunta actual completa |
| `asamblea/preguntaActual` | WRITE | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L483, L561) | Setear/actualizar pregunta |
| `asamblea/preguntaActual` | VALIDATE | Estructura + opciones 2-4 + duracion 1-300 | asamblea-engine.js | Validación estructura |
| `asamblea/conectados` | READ | `auth != null` | asamblea-engine.js (L160) | Lista conectados |
| `asamblea/conectados/{uid}` | READ | `auth != null` | asamblea-engine.js (via conectados) | Perfil conectado |
| `asamblea/conectados/{uid}` | WRITE | `propietario (uid)` o `staff` | asamblea-engine.js (L1067), asamblea-participant.js (L220) | Registrar presencia |
| `asamblea/conectados/{uid}` | VALIDATE | nombre (string ≤80) + ts (number) | asamblea-engine.js | Validación presencia |
| `asamblea/conectados/{uid}` | DELETE (onDisconnect) | `propietario (uid)` | asamblea-engine.js (L1073) | Auto-remove al desconectar |
| `asamblea/respuestas` | READ | `auth != null` | asamblea-engine.js (L166), proyector_logic.js (L181) | Todas las respuestas |
| `asamblea/respuestas/{qid}/{uid}` | READ | `propietario (uid)` o `staff` | asamblea-engine.js (L523, L937) | Leer respuesta propia/ajena |
| `asamblea/respuestas/{qid}/{uid}` | WRITE | `propietario (uid)` + condiciones fase/estado | asamblea-engine.js (L1107), asamblea-participant.js (via responder) | Responder pregunta |
| `asamblea/respuestas/{qid}/{uid}` | VALIDATE | idx 0-3 + ts + nombre ≤80 | asamblea-engine.js | Validación respuesta |
| `asamblea/respuestas` | DELETE | `coordinador`, `servidor`, `apoyo` | admin.js (L422, L855, L873) | Limpiar respuestas |
| `asamblea/sesion/puntos/{uid}` | READ | `propietario (uid)` o `staff` | asamblea-engine.js (L172, L553) | Puntos por usuario |
| `asamblea/sesion/puntos/{uid}` | WRITE | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L542, L581, L916) | Actualizar puntos (transaction) |
| `asamblea/sesion/puntos` | READ | `auth != null` | asamblea-engine.js (L553) | Todos los puntos |
| `asamblea/sesion/resumen` | READ | `auth != null` | asamblea-engine.js (L177) | Ranking top 20 |
| `asamblea/sesion/resumen` | WRITE | `coordinador`, `servidor`, `apoyo` | asamblea-engine.js (L558) | Actualizar ranking |
| `asamblea/sesion/acumulada` | READ | `staff` | asamblea-engine.js (L182) | Modo acumulado |
| `asamblea/sesion/acumulada` | WRITE | `staff` | asamblea-engine.js (L581, L667, L673, L837) | Setear acumulada |
| `asamblea/sesion/hostUid` | READ | `auth != null` | asamblea-engine.js (L188) | Host actual |
| `asamblea/sesion/hostUid` | WRITE | `staff` | asamblea-engine.js (L276, L296), admin.js (L420) | Reclamar/transferir host |
| `asamblea/sesion/sesionId` | READ | `auth != null` | asamblea-engine.js (L194) | ID sesión actual |
| `asamblea/sesion/sesionId` | WRITE | `staff` | asamblea-engine.js (L373, L668, L838), admin.js | Setear ID sesión |
| `asamblea/sesion/cerradas/{sid}/{qid}` | READ | `staff` | asamblea-engine.js (L516, L938) | Preguntas cerradas históricas |
| `asamblea/sesion/cerradas/{sid}/{qid}` | WRITE | `staff` | asamblea-engine.js (L516) | Guardar pregunta cerrada |
| `asamblea/sesion/meta` | READ | `auth != null` | asamblea-engine.js (L200) | Meta sesión KAHOOT |
| `asamblea/sesion/meta` | WRITE | `staff` | asamblea-engine.js (L843), admin.js | Meta sesión |
| `asamblea/borradores` | READ | `staff` | admin.js (L127, L916, L956) | Borradores preguntas |
| `asamblea/borradores` | WRITE | `staff` | admin.js (L903) | Crear borrador |
| `asamblea/borradores/{key}` | READ | `staff` | admin.js (L956) | Leer borrador |
| `asamblea/borradores/{key}` | DELETE | `staff` | admin.js (L982) | Eliminar borrador |
| `asamblea/estado` | READ | `auth != null` | proyector_logic.js (L541) | Estado asamblea |
| `asamblea/estado` | WRITE | `staff` | proyector_logic.js (L597) | Setear estado |
| `asamblea/preguntaNum` | READ | `auth != null` | proyector_logic.js (L117) | Número pregunta |
| `asamblea/preguntaNum` | WRITE | `staff` | proyector_logic.js (L653) | Setear número |
| `asamblea/preguntaActual/estado` | WRITE | `staff` | proyector_logic.js (L573, L595) | Estado pregunta (legacy) |

---

## Rutas Globales (raíz)

| Ruta RTDB | Operación | Rol Requerido | Archivo(s) Origen | Descripción |
|-----------|-----------|---------------|-------------------|-------------|
| `preguntaActual` (raíz) | READ | `auth != null` | admin.js, proyector_logic.js | Pregunta actual (legacy/duplicada) |
| `preguntaActual` (raíz) | WRITE | `coordinador` | admin.js | Setear pregunta (legacy) |
| `preguntaActual` (raíz) | VALIDATE | Estructura + opciones 2-4 + duracion | admin.js | Validación |
| `rankingGlobal` | READ | `auth != null` | asamblea-engine.js (L1212), admin.js (L777) | Ranking global |
| `rankingGlobal` | WRITE | `coordinador` | asamblea-engine.js (L612, L916), admin.js (L634, L872, L883) | Actualizar ranking global |
| `rankingGlobal/{uid}` | READ | `propietario` o `staff` | asamblea-engine.js (L1202) | Ver ranking usuario |
| `rankingGlobal/{uid}` | WRITE | `coordinador` | asamblea-engine.js, admin.js | Setear ranking usuario |
| `rankingGlobal/{uid}` | VALIDATE | pts ≥0 + nombre ≤80 | - | Validación |
| `admins` | READ | `coordinador`, `servidor`, `apoyo` | admin.js | Listar admins |
| `admins/{uid}` | READ | `propietario (uid)` o `staff` | admin.js, asamblea-engine.js (via roles) | Ver rol propio/ajeno |
| `admins/{uid}` | WRITE | `coordinador` | admin.js (L90, L1137), asamblea-engine.js (auth-permissions) | Crear/actualizar admin |
| `admins/{uid}` | DELETE | `coordinador` | admin.js (L96, L1143) | Eliminar admin |
| `admins/{uid}` | VALIDATE | rol ∈ {servidor, apoyo, coordinador} | - | Validación rol |
| `kahoot/sesionActiva` | READ | `auth != null` | asamblea-engine.js (L867, L1052) | Sesión KAHOOT activa |
| `kahoot/sesionActiva` | WRITE | `coordinador` | asamblea-engine.js (L838), admin.js | Activar sesión KAHOOT |
| `kahoot/sesionActiva` | DELETE | `coordinador` | asamblea-engine.js (L665, L1052) | Desactivar sesión |

---

## Resumen por Rol

### `miembro` (auth sin rol en /admins)
- **READ**: `asamblea/activa`, `asamblea/sesion/fase`, `asamblea/sesion/cola`, `asamblea/sesion/indice`, `asamblea/preguntaActual`, `asamblea/conectados`, `asamblea/respuestas` (propias), `asamblea/sesion/puntos` (propias), `asamblea/sesion/resumen`, `asamblea/sesion/hostUid`, `asamblea/sesion/sesionId`, `preguntaActual` (raíz), `rankingGlobal`, `rankingGlobal/{uid}` (propia), `kahoot/sesionActiva`
- **WRITE**: `asamblea/conectados/{uid}` (propia), `asamblea/respuestas/{qid}/{uid}` (propia, en fase pregunta y tiempo)
- **DELETE**: `asamblea/conectados/{uid}` (onDisconnect propia)

### `servidor` / `apoyo` (staff)
- **READ**: Todo lo de miembro + `asamblea/sesion/claves`, `asamblea/sesion/acumulada`, `asamblea/sesion/puntos` (todos), `asamblea/sesion/cerradas`, `asamblea/borradores`, `admins` (todos)
- **WRITE**: Todo lo de miembro + `asamblea/sesion/fase`, `asamblea/activa`, `asamblea/sesion/cola`, `asamblea/sesion/indice`, `asamblea/sesion/claves`, `asamblea/preguntaActual`, `asamblea/respuestas` (limpiar), `asamblea/sesion/puntos`, `asamblea/sesion/resumen`, `asamblea/sesion/acumulada`, `asamblea/sesion/hostUid`, `asamblea/sesion/sesionId`, `asamblea/sesion/cerradas`, `asamblea/sesion/meta`, `asamblea/borradores`, `asamblea/estado`, `asamblea/preguntaNum`, `admins` (leer), `kahoot/sesionActiva`

### `coordinador`
- **READ/WRITE/DELETE**: Todo lo de staff + `admins/{uid}` (crear/eliminar), `rankingGlobal` (escribir), `preguntaActual` (raíz escribir)

---

## Tests por Ruta y Rol

| # | Ruta | Operación | Rol Test | Esperado | Test Archivo |
|---|------|-----------|----------|----------|--------------|
| 1 | `/admins/{uid}` | WRITE | miembro | DENY | regression-test.mjs #1 |
| 2 | `/asamblea/sesion/fase` | WRITE | miembro | DENY | regression-test.mjs #2 |
| 3 | `/asamblea/sesion/hostUid` | WRITE | miembro | DENY | regression-test.mjs #3 |
| 4 | `/asamblea/preguntaActual` | WRITE | miembro | DENY | regression-test.mjs #4 |
| 5 | `/asamblea/sesion/claves/{qid}` | READ | miembro | DENY | regression-test.mjs #5 |
| 6 | `/asamblea/sesion/cola` | WRITE | miembro | DENY | regression-test.mjs #6 |
| 7 | `/asamblea/respuestas/{qid}/{uid}` | WRITE | miembro | ALLOW (válido) | regression-test.mjs #7 |
| 8 | `/asamblea/conectados/{uid}` | WRITE | miembro | ALLOW (válido) | regression-test.mjs #8 |
| 9 | `/asamblea/preguntaActual` | READ | miembro | ALLOW | regression-test.mjs #9 |
| 10 | `/asamblea/respuestas/{qid}/{uid}` | READ | miembro | ALLOW (propia) | regression-test.mjs #10 |
| 11 | `/asamblea/sesion/fase` | WRITE | servidor | ALLOW | regression-test.mjs #11 |
| 12 | `/asamblea/sesion/hostUid` | WRITE | servidor | ALLOW | regression-test.mjs #12 |
| 13 | `/asamblea/preguntaActual` | WRITE | servidor | ALLOW | regression-test.mjs #13 |
| 14 | `/asamblea/sesion/claves/{qid}` | READ | servidor | ALLOW | regression-test.mjs #14 |
| 15 | `/asamblea/sesion/cola` | WRITE | servidor | ALLOW | regression-test.mjs #15 |
| 16 | `/admins/{uid}` | WRITE | coordinador | ALLOW | regression-test.mjs #16 |
| 17 | `/admins/{uid}` | DELETE | coordinador | ALLOW | regression-test.mjs #17 |
| 18 | `/rankingGlobal/{uid}` | WRITE | coordinador | ALLOW | regression-test.mjs #18 |
| 19 | `/asamblea/respuestas/{qid}/{uid}` | WRITE | miembro | DENY (idx=5) | regression-test.mjs #19 |
| 20 | `/asamblea/respuestas/{qid}/{uid}` | WRITE | miembro | DENY (sin nombre) | regression-test.mjs #20 |
| 21 | `/asamblea/preguntaActual` | WRITE | servidor | DENY (1 opción) | regression-test.mjs #21 |
| 22 | `/asamblea/conectados/{uid}` | WRITE | miembro | DENY (sin nombre) | regression-test.mjs #22 |
| 23 | `/admins/{uid}` | WRITE | coordinador | DENY (rol=hacker) | regression-test.mjs #23 |

### Tests Adicionales Necesarios (cobertura completa)

| # | Ruta | Operación | Rol | Esperado |
|---|------|-----------|-----|----------|
| 24 | `/asamblea/sesion/puntos/{uid}` | WRITE | servidor | ALLOW (transaction) |
| 25 | `/asamblea/sesion/puntos/{uid}` | READ | miembro | ALLOW (propia) |
| 26 | `/asamblea/sesion/resumen` | WRITE | servidor | ALLOW |
| 27 | `/asamblea/sesion/acumulada` | WRITE | servidor | ALLOW |
| 28 | `/asamblea/sesion/sesionId` | WRITE | servidor | ALLOW |
| 29 | `/asamblea/sesion/cerradas/{sid}/{qid}` | WRITE | servidor | ALLOW |
| 30 | `/asamblea/sesion/meta` | WRITE | servidor | ALLOW |
| 31 | `/asamblea/borradores` | WRITE | servidor | ALLOW |
| 32 | `/asamblea/borradores/{key}` | DELETE | servidor | ALLOW |
| 33 | `/asamblea/estado` | WRITE | servidor | ALLOW |
| 34 | `/asamblea/preguntaNum` | WRITE | servidor | ALLOW |
| 35 | `/asamblea/preguntaActual/estado` | WRITE | servidor | ALLOW (legacy) |
| 36 | `/rankingGlobal` | WRITE | coordinador | ALLOW |
| 37 | `/kahoot/sesionActiva` | WRITE | coordinador | ALLOW |
| 38 | `/kahoot/sesionActiva` | DELETE | coordinador | ALLOW |
| 39 | `/asamblea/conectados/{uid}` | DELETE (onDisconnect) | miembro | ALLOW (propia) |
| 40 | `/asamblea/respuestas` | DELETE | servidor | ALLOW |
| 41 | `/asamblea/sesion/claves/{qid}` | WRITE | servidor | ALLOW |

---

## Estado Actual Tests (23/23 pasando)

✅ Todos los tests de regresión actuales pasan. Faltan tests 24-41 para cobertura completa.