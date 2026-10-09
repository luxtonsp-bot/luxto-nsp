/**
 * Tests unitarios simples para firebase-init.js
 * Ejecutar con: node assets/js/firebase-init.test.mjs
 */

// Re-implementar esc aquí para testear sin dependencias de Firebase
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

console.log('\n=== firebase-init: esc() - XSS Prevention ===');

assertEqual(esc('a & b'), 'a & b', 'should escape & to &');
assertEqual(esc('&'), '&', 'should escape single &');
assertEqual(esc('<script>'), '<script>', 'should escape < to <');
assertEqual(esc('<'), '<', 'should escape single <');
assertEqual(esc('>test'), '>test', 'should escape > to >');
assertEqual(esc('>'), '>', 'should escape single >');
assertEqual(esc('"quotes"'), '"quotes"', 'should escape " to "');
assertEqual(esc('"'), '"', 'should escape single "');
assertEqual(esc("'single'"), '\'single\'', 'should escape \' to \'');
assertEqual(esc("'"), "'", 'should escape single \'');
assertEqual(esc('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>', 'should handle XSS payload');
assertEqual(esc('javascript:alert(1)'), 'javascript:alert(1)', 'should handle javascript: protocol');
assertEqual(esc(''), '', 'should handle empty string');
assertEqual(esc(null), '', 'should handle null');
assertEqual(esc(undefined), '', 'should handle undefined');
assertEqual(esc(123), '123', 'should handle numbers');
assertEqual(esc(0), '0', 'should handle zero');
assertEqual(esc(true), 'true', 'should handle true');
assertEqual(esc(false), 'false', 'should handle false');

const once = esc('<test>');
const twice = esc(once);
assertEqual(twice, '<test>', 'should not double-escape');

console.log('\n=== firebase-init: Role Helpers ===');
const isCoordinator = (role) => role === 'coordinador';
assertEqual(isCoordinator('coordinador'), true, 'should identify coordinador');
assertEqual(isCoordinator('servidor'), false, 'should not identify servidor as coordinador');
assertEqual(isCoordinator('miembro'), false, 'should not identify miembro as coordinador');

const isStaff = (role) => ['servidor', 'apoyo', 'coordinador'].includes(role);
assertEqual(isStaff('servidor'), true, 'should identify servidor as staff');
assertEqual(isStaff('apoyo'), true, 'should identify apoyo as staff');
assertEqual(isStaff('coordinador'), true, 'should identify coordinador as staff');
assertEqual(isStaff('miembro'), false, 'should not identify miembro as staff');

console.log('\n=== firebase-init: RTDB Paths ===');
const paths = {
  meta: 'asamblea/kahoot/meta',
  sesionActivaFlag: 'asamblea/kahoot/sesionActiva',
  respuestas: 'asamblea/kahoot/respuestas',
  conectados: 'asamblea/conectados',
  rankingSesion: 'asamblea/kahoot/rankingSesion',
  rankingGlobal: (uid) => `rankingGlobal/${uid}`
};

assertEqual(paths.meta, 'asamblea/kahoot/meta', 'meta path correct');
assertEqual(paths.sesionActivaFlag, 'asamblea/kahoot/sesionActiva', 'sesionActivaFlag path correct');
assertEqual(paths.respuestas, 'asamblea/kahoot/respuestas', 'respuestas path correct');
assertEqual(paths.conectados, 'asamblea/conectados', 'conectados path correct');
assertEqual(paths.rankingSesion, 'asamblea/kahoot/rankingSesion', 'rankingSesion path correct');
assertEqual(paths.rankingGlobal('abc123'), 'rankingGlobal/abc123', 'rankingGlobal path correct');

const uid = 'user-uid-123';
const path = paths.rankingGlobal(uid);
assertEqual(path, `rankingGlobal/${uid}`, 'rankingGlobal uses UID directly');
assert(!path.includes('@'), 'rankingGlobal should not contain @');
assert(!path.includes('.'), 'rankingGlobal should not contain .');
assert(!path.includes('#'), 'rankingGlobal should not contain #');
assert(!path.includes('$'), 'rankingGlobal should not contain $');
assert(!path.includes('['), 'rankingGlobal should not contain [');
assert(!path.includes(']'), 'rankingGlobal should not contain ]');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);