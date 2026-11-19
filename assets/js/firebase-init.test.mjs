/**
 * Tests unitarios simples para firebase-init.js
 * Ejecutar con: node assets/js/firebase-init.test.mjs
 */

import fs from 'node:fs';
import { esc } from './esc.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    console.error(`     Expected: ${JSON.stringify(expected)}`);
    console.error(`     Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log("\n=== firebase-init: esc() - XSS Prevention ===");

// esc() returns actual HTML entities - using double quotes for strings with single quotes
assertEqual(esc("a & b"), "a \u0026amp; b", "should escape & to &");
assertEqual(esc("&"), "\u0026amp;", "should escape single &");
assertEqual(esc("<script>"), "\u0026lt;script\u0026gt;", "should escape < to <");
assertEqual(esc("<"), "\u0026lt;", "should escape single <");
assertEqual(esc(">test"), "\u0026gt;test", "should escape > to >");
assertEqual(esc(">"), "\u0026gt;", "should escape single >");
assertEqual(esc('"quotes"'), "\u0026quot;quotes\u0026quot;", "should escape \" to \"");
assertEqual(esc('"'), "\u0026quot;", "should escape single \"");
assertEqual(esc("'single'"), "\u0026#39;single\u0026#39;", "should escape single quote to '");
assertEqual(esc("'"), "\u0026#39;", "should escape single quote to '");
assertEqual(esc("<img src=x onerror=alert(1)>"), "\u0026lt;img src=x onerror=alert(1)\u0026gt;", "should handle XSS payload - no < >");
assertEqual(esc("javascript:alert(1)"), "javascript:alert(1)", "should handle javascript: protocol");
assertEqual(esc(""), "", "should handle empty string");
assertEqual(esc(null), "", "should handle null");
assertEqual(esc(undefined), "", "should handle undefined");
assertEqual(esc(123), "123", "should handle numbers");
assertEqual(esc(0), "0", "should handle zero");
assertEqual(esc(true), "true", "should handle true");
assertEqual(esc(false), "false", "should handle false");

// Verificar que no contiene caracteres peligrosos
const xssResult = esc("<img onerror=1> \"a\" & b");
assert(!xssResult.includes("<"), "escaped result must not contain <");
assert(!xssResult.includes(">"), "escaped result must not contain >");
assert(!xssResult.includes("\""), "escaped result must not contain \"");

console.log("\n=== firebase-init: Role Helpers ===");
const isCoordinator = (role) => role === "coordinador";
assertEqual(isCoordinator("coordinador"), true, "should identify coordinador");
assertEqual(isCoordinator("servidor"), false, "should not identify servidor as coordinador");
assertEqual(isCoordinator("miembro"), false, "should not identify miembro as coordinador");

const isStaff = (role) => ["servidor", "apoyo", "coordinador"].includes(role);
assertEqual(isStaff("servidor"), true, "should identify servidor as staff");
assertEqual(isStaff("apoyo"), true, "should identify apoyo as staff");
assertEqual(isStaff("coordinador"), true, "should identify coordinador as staff");
assertEqual(isStaff("miembro"), false, "should not identify miembro as staff");

console.log("\n=== firebase-init: RTDB Paths ===");
const paths = {
  meta: "asamblea/kahoot/meta",
  sesionActivaFlag: "asamblea/kahoot/sesionActiva",
  respuestas: "asamblea/kahoot/respuestas",
  conectados: "asamblea/conectados",
  rankingSesion: "asamblea/kahoot/rankingSesion",
  rankingGlobal: (uid) => `rankingGlobal/${uid}`
};

assertEqual(paths.meta, "asamblea/kahoot/meta", "meta path correct");
assertEqual(paths.sesionActivaFlag, "asamblea/kahoot/sesionActiva", "sesionActivaFlag path correct");
assertEqual(paths.respuestas, "asamblea/kahoot/respuestas", "respuestas path correct");
assertEqual(paths.conectados, "asamblea/conectados", "conectados path correct");
assertEqual(paths.rankingSesion, "asamblea/kahoot/rankingSesion", "rankingSesion path correct");
assertEqual(paths.rankingGlobal("abc123"), "rankingGlobal/abc123", "rankingGlobal path correct");

const uid = "user-uid-123";
const path = paths.rankingGlobal(uid);
assertEqual(path, `rankingGlobal/${uid}`, "rankingGlobal uses UID directly");
assert(!path.includes("@"), "rankingGlobal should not contain @");
assert(!path.includes("."), "rankingGlobal should not contain .");
assert(!path.includes("#"), "rankingGlobal should not contain #");
assert(!path.includes("$"), "rankingGlobal should not contain $");
assert(!path.includes("["), "rankingGlobal should not contain [");
assert(!path.includes("]"), "rankingGlobal should not contain ]");

console.log("\n=== firebase-init: Rules / Staff permissions ===");
const dbRules = fs.readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8');
const firestoreRules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const registrationHtml = fs.readFileSync(new URL('../../pages/registro.html', import.meta.url), 'utf8');
const adminJs = fs.readFileSync(new URL('./admin.js', import.meta.url), 'utf8');
const proyectorJs = fs.readFileSync(new URL('./proyector_logic.js', import.meta.url), 'utf8');
const groupHtml = fs.readFileSync(new URL('../../pages/gestion-grupo.html', import.meta.url), 'utf8');
const tablesHtml = fs.readFileSync(new URL('../../pages/tablas.html', import.meta.url), 'utf8');
const attendanceHtml = fs.readFileSync(new URL('../../pages/tomar-asistencia.html', import.meta.url), 'utf8');
const adminRoleCheck = "root.child('admins').child(auth.uid).child('rol').val() === 'coordinador'";
assert(dbRules.includes(adminRoleCheck), "RTDB rules rely on the admins role mirror");
assert(dbRules.includes("auth.uid === $uid && newData.val() === null"), "Users can only self-delete a stale RTDB role mirror");
assert(!dbRules.includes("root.child('members').child(auth.uid).child('rol').val()"), "RTDB rules should not depend on a non-existent RTDB members tree");
assert(dbRules.includes("'servidor'"), "RTDB rules include servidor role");
assert(dbRules.includes("'apoyo'"), "RTDB rules include apoyo role");
assert(firestoreRules.includes("allow create, update: if isStaff();"), "Firestore rules allow staff to create KAHOOT sessions");
assert(!firestoreRules.includes("isAdminEmail"), "Firestore role checks do not use hardcoded email bypasses");
assert(firestoreRules.includes("allow update: if isCoordinator() || (isAuth() && getUserRole(request.auth.uid) == \"servidor\");"), "Only server and coordinator can correct attendance");
assert(firestoreRules.includes("allow create, update, delete: if isCoordinator();"), "Only coordinators can manage dynamic table definitions");
assert(firestoreRules.includes("request.resource.data.estadoAnioActual == 'perseverante'"), "Staff status changes are limited to attendance reactivation");
assert(firestoreRules.includes("request.resource.data.asistenciasTotales == resource.data.get('asistenciasTotales', 0) + 1"), "Attendance reactivation requires an attendance-count increment");
assert(firestoreRules.includes("match /role_transfer_state/{stateId}"), "Coordinator handoffs are represented by a rules-validated transfer");
assert(firestoreRules.includes("roleTransferMatches(memberId, true)"), "Coordinator promotion requires the paired transfer");
assert(firestoreRules.includes("getAfter(transferPath).data.fromMemberId == memberId"), "Coordinator demotion is tied to the outgoing member in the same transfer");
assert(firestoreRules.includes("getAfter(transferPath).data.toMemberId != memberId"), "Coordinator demotion cannot reuse the outgoing profile as the handoff target");
assert(adminJs.includes('doc(fsdb, "role_transfer_state", "current")'), "Coordinator handoff writes transfer state with the role batch");
assert(adminJs.indexOf('writeAdminMirror(incomingPaths, memberData, "coordinador")') < adminJs.indexOf("await batch.commit()"), "Incoming RTDB role mirror is written before the outgoing coordinator loses RTDB write permission");
assert(!adminJs.includes("ADMINS"), "The administration panel has no hardcoded email privilege list");
assert(adminJs.includes('where("rol", "==", "coordinador")'), "Coordinator handoff verifies the current active coordinator");
assert(adminJs.includes("batch.update(currentUserRef"), "Coordinator handoff demotes the outgoing coordinator in the same Firestore batch");
assert(!proyectorJs.includes("ADMINS"), "The projector has no hardcoded email privilege list");
assert(proyectorJs.includes('firestoreDoc(fsdb, "uid_map", user.uid)'), "Projector controls resolve the current role through the linked member profile");
assert(groupHtml.includes("Solo el coordinador puede definir la perseverancia anual."), "Annual perseverance decisions are coordinator-only in the interface");
assert(tablesHtml.includes("currentUserRole !== 'coordinador'"), "Table management is hidden from non-coordinators");
assert(attendanceHtml.includes("currentUserRole === 'apoyo'"), "Support cannot use the attendance correction interface");
assert(firestoreRules.includes("getAfter(/databases/$(database)/documents/uid_map/$(request.auth.uid)).data.memberId == resource.data.memberId"), "registration lookup update must match the new uid_map member");
assert(firestoreRules.includes("resource.data.get('tieneCuenta', false) == false"), "registration lookup cannot be claimed a second time");
assert(firestoreRules.includes("resource.data.get('uid', null) in [null, '']"), "registration cannot overwrite a member already linked to another account");
assert(!registrationHtml.includes('fechaIngresoGrupo: memberData.fechaPrimeraAsamblea'), "registration must not change the protected member start date");
assert(registrationHtml.includes('fechaNacimiento: fechaNac'), "registration must save the birthday confirmed by the member");
assert(registrationHtml.includes('fechaNacimientoMMdd: fechaNacMMdd'), "registration must update the birthday lookup field");
assert(!registrationHtml.includes('registration/birthdate-mismatch'), "an existing birthday must not block member registration");

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
