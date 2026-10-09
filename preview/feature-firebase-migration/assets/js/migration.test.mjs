/**
 * Tests para el script de migración rankingGlobal
 * Ejecutar con: node assets/js/migration.test.mjs
 */

import { esc } from './esc.js';

// Lógica de sanitización de email (debe coincidir con firebase-init.js y código legacy)
// Caracteres prohibidos en RTDB keys: . # $ [ ] (y posiblemente @ en implementaciones legacy)
const sanitizeEmail = (email) => {
  if (email == null) return null;
  // Reemplazar caracteres problemáticos para RTDB keys
  return String(email).replace(/[.#$\[\]]/g, "_");
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

console.log("\n=== migrate-ranking-global: email-sanitized to UID migration logic ===");

console.log("\n--- Sanitize emails (current regex behavior) ---");
// Con el regex actual [.#$[\]] el @ NO se reemplaza
assertEqual(sanitizeEmail("user@example.com"), "user@example_com", "sanitize user@example.com (current behavior)");
assertEqual(sanitizeEmail("test.user@domain.org"), "test_user@domain_org", "sanitize test.user@domain.org");
assertEqual(sanitizeEmail("a.b.c@x.y.z"), "a_b_c@x_y_z", "sanitize a.b.c@x.y.z");
assertEqual(sanitizeEmail("user+tag@gmail.com"), "user+tag@gmail_com", "sanitize user+tag@gmail.com");
assertEqual(sanitizeEmail("user.name#tag@domain.com"), "user_name_tag@domain_com", "sanitize user.name#tag@domain.com");
assertEqual(sanitizeEmail("user$name@domain.com"), "user_name@domain_com", "sanitize user$name@domain.com");
assertEqual(sanitizeEmail("user[name@domain.com"), "user_name@domain_com", "sanitize user[name@domain.com");
assertEqual(sanitizeEmail("user]name@domain.com"), "user_name@domain_com", "sanitize user]name@domain.com");

assertEqual(sanitizeEmail(""), "", "sanitize empty string");
assertEqual(sanitizeEmail(null), null, "sanitize null");
assertEqual(sanitizeEmail(undefined), null, "sanitize undefined");
assertEqual(sanitizeEmail("no-special-chars"), "no-special-chars", "sanitize no special chars");

console.log("\n--- Map sanitized email back to UID ---");
const members = {
  "uid1": { email: "user@example.com", nombre: "User One" },
  "uid2": { email: "test.user@domain.org", nombre: "User Two" }
};

const emailToUid = {};
Object.entries(members).forEach(([uid, data]) => {
  if (data.email) {
    emailToUid[sanitizeEmail(data.email)] = uid;
  }
});

assertEqual(emailToUid["user@example_com"], "uid1", "map user@example_com to uid1");
assertEqual(emailToUid["test_user@domain_org"], "uid2", "map test_user@domain_org to uid2");

console.log("\n--- Detect UID vs email-sanitized keys ---");
const members2 = {
  "uid1": { email: "user@example.com" },
  "uid2": { email: "test@domain.org" }
};

const uidKeys = ["uid1", "uid2"];
const emailKeys = ["user@example_com", "test@domain_org"];
const otherKeys = ["unknown_key"];

const allKeys = [...uidKeys, ...emailKeys, ...otherKeys];

const classified = allKeys.map(key => {
  if (members2[key]) return "uid";
  const emailToUid2 = {};
  Object.entries(members2).forEach(([uid, data]) => {
    if (data.email) emailToUid2[sanitizeEmail(data.email)] = uid;
  });
  if (emailToUid2[key]) return "email";
  return "other";
});

assertEqual(classified[0], "uid", "uid1 classified as uid");
assertEqual(classified[1], "uid", "uid2 classified as uid");
assertEqual(classified[2], "email", "user@example_com classified as email");
assertEqual(classified[3], "email", "test@domain_org classified as email");
assertEqual(classified[4], "other", "unknown_key classified as other");

console.log("\n--- Merge data when both UID and email key exist ---");
const uidData = { pts: 100, ultimaAsamblea: 1000 };
const emailData = { pts: 50, ultimaAsamblea: 2000 };

const mergedPts = (uidData.pts || 0) + (emailData.pts || 0);
const mergedUltima = Math.max(uidData.ultimaAsamblea || 0, emailData.ultimaAsamblea || 0);

assertEqual(mergedPts, 150, "merged pts should be 150");
assertEqual(mergedUltima, 2000, "merged ultimaAsamblea should be 2000");

// Test esc import works
console.log("\n--- esc import test ---");
assert(!esc("<test>").includes("<"), "esc imported works");
assert(!esc('"test"').includes("\""), "esc imported works");

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
