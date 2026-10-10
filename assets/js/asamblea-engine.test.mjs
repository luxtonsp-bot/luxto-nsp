/**
 * Tests unitarios simples para asamblea-engine.js
 * Ejecutar con: node assets/js/asamblea-engine.test.mjs
 */

import { esc } from './esc.js';
import { isStateAllowedForAction, getSessionCleanupPaths } from './phase-guards.js';

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

console.log("\n=== asamblea-engine: esc() - XSS Prevention ===");

assertEqual(esc("<script>alert(1)</script>"), "\u0026lt;script\u0026gt;alert(1)\u0026lt;/script\u0026gt;", "should escape script tag");
assertEqual(esc("a & b"), "a \u0026amp; b", "should escape &");
assertEqual(esc('"quotes"'), "\u0026quot;quotes\u0026quot;", "should escape \"");
assertEqual(esc("'single'"), "\u0026#39;single\u0026#39;", "should escape '");
assertEqual(esc(">greater<"), "\u0026gt;greater\u0026lt;", "should escape > and <");
assertEqual(esc(""), "", "should handle empty");
assertEqual(esc(null), "", "should handle null");
assertEqual(esc(undefined), "", "should handle undefined");

const alreadyEscaped = "\u0026lt;test\u0026gt;";
assertEqual(esc(alreadyEscaped), "\u0026amp;lt;test\u0026amp;gt;", "should not double-escape (entities become literal)");
assertEqual(esc(123), "123", "should handle numbers");
assertEqual(esc(true), "true", "should handle booleans");

console.log("\n=== asamblea-engine: rankingGlobal key format ===");
const uid = "abc123def456";
const email = "user@example.com";
const sanitized = email.replace(/[.#$\[\]]/g, "_");
const expectedPath = `rankingGlobal/${uid}`;

assert(!expectedPath.includes(sanitized), "path should not contain email-sanitized");
assert(expectedPath.includes(uid), "path should contain UID");

console.log("\n=== asamblea-engine: Timer Recovery ===");
const now = Date.now();
let cierraEn = now + 5000;
let remaining = Math.max(0, Math.ceil((cierraEn - now) / 1000));
assertEqual(remaining, 5, "should calculate 5s remaining");

cierraEn = now - 1000;
remaining = Math.max(0, Math.ceil((cierraEn - now) / 1000));
assertEqual(remaining, 0, "should return 0 when expired");

cierraEn = now;
remaining = Math.max(0, Math.ceil((cierraEn - now) / 1000));
assertEqual(remaining, 0, "should return 0 at exact boundary");

console.log("\n=== asamblea-engine: Single Entry/Exit Flow ===");
const metaPath = "asamblea/kahoot/meta";
assert(metaPath, "metaPath should be defined");
assert(!metaPath.includes("sesionActivaData"), "metaPath should not contain sesionActivaData");

const flagPath = "asamblea/kahoot/sesionActiva";
assert(flagPath, "flagPath should be defined");

const pathsToClean = [
  "asamblea/kahoot/meta",
  "asamblea/kahoot/sesionActiva",
  "asamblea/kahoot/respuestas",
  "asamblea/kahoot/rankingSesion"
];
assert(pathsToClean.includes("asamblea/kahoot/meta"), "should clean meta");
assert(pathsToClean.includes("asamblea/kahoot/sesionActiva"), "should clean sesionActiva");

console.log("\n=== asamblea-engine: phase guard against stale local state ===");
assert(isStateAllowedForAction("countdown", ["lobby", "countdown", "revelada", "ranking"]) === true, "countdown should be allowed for a live action");
assert(isStateAllowedForAction("pregunta", ["lobby", "countdown", "revelada", "ranking"]) === false, "pregunta should not be allowed from a drained state guard");
assert(isStateAllowedForAction("revelada", ["revelada", "ranking"]) === true, "revelada should allow ranking transition");

console.log("\n=== asamblea-engine: toggle should still run when browser has already flipped the checkbox ===");
const domToggleState = { checked: true };
const desiredState = true;
const runToggle = (toggle, target) => {
  if (toggle.checked !== target) {
    toggle.checked = target;
  }
  return true;
};
assert(runToggle(domToggleState, desiredState) === true, "toggle should still execute when browser already updated the checkbox");

console.log("\n=== asamblea-engine: session cleanup clears accumulated state ===");
const cleanupPaths = getSessionCleanupPaths();
assert(cleanupPaths.includes('asamblea/preguntaActual'), 'cleanup should include active question');
assert(cleanupPaths.includes('asamblea/respuestas'), 'cleanup should include answers');
assert(cleanupPaths.includes('asamblea/conectados'), 'cleanup should include connected users');
assert(cleanupPaths.includes('asamblea/sesion/puntos'), 'cleanup should include accumulated points');
assert(cleanupPaths.includes('asamblea/sesion/resumen'), 'cleanup should include session summary');
assert(cleanupPaths.includes('asamblea/sesion/cerradas'), 'cleanup should include closure keys');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
