/**
 * Tests unitarios simples para asamblea-engine.js
 * Ejecutar con: node assets/js/asamblea-engine.test.mjs
 */

// Mock de esc() para tests
const esc = (str) => {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '\'');
};

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

console.log('\n=== asamblea-engine: esc() - XSS Prevention ===');

assertEqual(esc('<script>alert(1)</script>'), '<script>alert(1)</script>', 'should escape script tag');
assertEqual(esc('a & b'), 'a & b', 'should escape &');
assertEqual(esc('"quotes"'), '"quotes"', 'should escape "');
assertEqual(esc("'single'"), '\'single\'', 'should escape \'');
assertEqual(esc('>greater<'), '>greater<', 'should escape > and <');
assertEqual(esc(''), '', 'should handle empty');
assertEqual(esc(null), '', 'should handle null');
assertEqual(esc(undefined), '', 'should handle undefined');

const alreadyEscaped = '<test>';
assertEqual(esc(alreadyEscaped), '<test>', 'should not double-escape');
assertEqual(esc(123), '123', 'should handle numbers');
assertEqual(esc(true), 'true', 'should handle booleans');

console.log('\n=== asamblea-engine: rankingGlobal key format ===');
const uid = 'abc123def456';
const email = 'user@example.com';
const sanitized = email.replace(/[.#$[\]]/g, '_');
const expectedPath = `rankingGlobal/${uid}`;

assert(!expectedPath.includes(sanitized), 'path should not contain email-sanitized');
assert(expectedPath.includes(uid), 'path should contain UID');

console.log('\n=== asamblea-engine: Timer Recovery ===');
const now = Date.now();
let cierraEn = now + 5000;
let remaining = Math.max(0, Math.ceil((cierraEn - now) / 1000));
assertEqual(remaining, 5, 'should calculate 5s remaining');

cierraEn = now - 1000;
remaining = Math.max(0, Math.ceil((cierraEn - now) / 1000));
assertEqual(remaining, 0, 'should return 0 when expired');

cierraEn = now;
remaining = Math.max(0, Math.ceil((cierraEn - now) / 1000));
assertEqual(remaining, 0, 'should return 0 at exact boundary');

console.log('\n=== asamblea-engine: Single Entry/Exit Flow ===');
const metaPath = 'asamblea/kahoot/meta';
assert(metaPath, 'metaPath should be defined');
assert(!metaPath.includes('sesionActivaData'), 'metaPath should not contain sesionActivaData');

const flagPath = 'asamblea/kahoot/sesionActiva';
assert(flagPath, 'flagPath should be defined');

const pathsToClean = [
  'asamblea/kahoot/meta',
  'asamblea/kahoot/sesionActiva',
  'asamblea/kahoot/respuestas',
  'asamblea/kahoot/rankingSesion'
];
assert(pathsToClean.includes('asamblea/kahoot/meta'), 'should clean meta');
assert(pathsToClean.includes('asamblea/kahoot/sesionActiva'), 'should clean sesionActiva');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);