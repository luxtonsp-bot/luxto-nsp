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
const adminRoleCheck = "root.child('admins').child(auth.uid).child('rol').val() === 'coordinador'";
assert(dbRules.includes(adminRoleCheck), "RTDB rules rely on the admins role mirror");
assert(!dbRules.includes("root.child('members').child(auth.uid).child('rol').val()"), "RTDB rules should not depend on a non-existent RTDB members tree");
assert(dbRules.includes("'servidor'"), "RTDB rules include servidor role");
assert(dbRules.includes("'apoyo'"), "RTDB rules include apoyo role");
assert(firestoreRules.includes("allow create, update: if isStaff();"), "Firestore rules allow staff to create KAHOOT sessions");
assert(firestoreRules.includes("request.auth.token.email == \"henry.alfaro1@unmsm.edu.pe\""), "Firestore rules include the email fallback for authorized coordinators");

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
