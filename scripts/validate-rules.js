/**
 * Valida las reglas de Firebase (Firestore y RTDB)
 * Para RTDB, valida estructura básica sin parsear strings complejos
 */

import fs from 'fs';

function validateJsonStructure(filepath, description) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');

    // Validaciones básicas sin parsear JSON completo
    if (!content.trim().startsWith('{')) {
      throw new Error('Does not start with {');
    }
    if (!content.includes('"rules"')) {
      throw new Error('Missing "rules" key');
    }
    if (!content.includes('"asamblea"')) {
      throw new Error('Missing "asamblea" path');
    }

    // Verificar llaves balanceadas (aproximado)
    let braceCount = 0;
    for (const char of content) {
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
    }
    if (braceCount !== 0) {
      throw new Error(`Unbalanced braces: ${braceCount}`);
    }

    console.log(`✅ ${description} (${filepath}) - Estructura básica válida`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} (${filepath}) - Error: ${error.message}`);
    return false;
  }
}

function validateFirestoreRules(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    if (!content.includes('rules_version')) {
      throw new Error('Missing rules_version');
    }
    if (!content.includes('service cloud.firestore')) {
      throw new Error('Missing service cloud.firestore');
    }
    if (!content.match(/match\s+\/\w+/)) {
      throw new Error('No match rules found');
    }
    console.log(`✅ ${filepath} - Estructura básica válida`);
    return true;
  } catch (error) {
    console.error(`❌ ${filepath} - Error: ${error.message}`);
    return false;
  }
}

console.log('=== Validando reglas de Firebase ===\n');

let allValid = true;

// Validar Firestore rules
allValid = validateFirestoreRules('firestore.rules') && allValid;

// Validar RTDB rules (estructura básica)
allValid = validateJsonStructure('database.rules.json', 'RTDB Rules') && allValid;

console.log('\n=== Resultado ===');
if (allValid) {
  console.log('✅ Validación básica de reglas completada');
  process.exit(0);
} else {
  console.log('❌ Hay errores en la estructura básica de las reglas');
  process.exit(1);
}