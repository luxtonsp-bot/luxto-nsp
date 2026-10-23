/**
 * Fix Luana + Poblar miembros_registro
 * 
 * 1. Añade email y uid a Luana en members/
 * 2. Crea/puebla miembros_registro con TODOS los miembros para matching fuzzy
 * 3. miembros_registro es de LECTURA PÚBLICA (reglas firestore: allow read: if true)
 * 
 * Ejecutar: node fix_luana_y_registro.mjs
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const saPath = join(__dirname, 'luxto-nsp-firebase-adminsdk-fbsvc-4adb8e2695.json');
admin.initializeApp({
  credential: admin.cert(saPath)
});

const db = getFirestore();

// ============================================================
// NOMBRE-MATCH LOGIC (copiado de nombre-match.js para normalizar)
// ============================================================
function normalizeName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')      // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')          // solo alfanumérico y espacios
    .replace(/\s+/g, ' ')                 // espacios múltiples → uno
    .trim();
}

function tokenize(name) {
  return normalizeName(name).split(' ').filter(t => t.length > 0);
}

function matchScore(query, target) {
  const qTokens = tokenize(query);
  const tTokens = tokenize(target);
  
  if (qTokens.length === 0 || tTokens.length === 0) return 0;
  
  let matches = 0;
  for (const qt of qTokens) {
    // Coincidencia exacta de token
    if (tTokens.includes(qt)) {
      matches++;
      continue;
    }
    // Coincidencia por prefijo (abreviaturas: "luana dom" → "luana", "domínguez")
    for (const tt of tTokens) {
      if (tt.startsWith(qt) || qt.startsWith(tt)) {
        matches++;
        break;
      }
    }
  }
  return matches / Math.max(qTokens.length, tTokens.length);
}

function findMatches(query, candidates, threshold = 0.3) {
  const results = [];
  for (const candidate of candidates) {
    const score = matchScore(query, candidate.nombre);
    if (score >= threshold) {
      results.push({ ...candidate, score });
    }
  }
  // Ordenar: mejor score primero, luego por nombre
  return results.sort((a, b) => b.score - a.score || a.nombre.localeCompare(b.nombre));
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('🔧 Iniciando fix Luana + miembros_registro...\n');
  
  // 1. LEER todos los miembros
  const membersSnap = await db.collection('members').get();
  console.log(`📊 Total miembros en 'members': ${membersSnap.size}`);
  
  const allMembers = [];
  let luanaDoc = null;
  
  membersSnap.forEach(doc => {
    const data = doc.data();
    const member = {
      id: doc.id,
      nombre: data.nombre || data.name || '',
      email: data.email || '',
      uid: data.uid || '',
      rol: data.rol || 'miembro',
      estado: data.estadoAnioActual || 'activo',
      fotoDriveId: data.fotoDriveId || '',
      fechaIngreso: data.fechaIngresoGrupo || ''
    };
    allMembers.push(member);
    
    // Detectar Luana
    if (member.nombre.toLowerCase().includes('luana') && member.nombre.toLowerCase().includes('doming')) {
      luanaDoc = { ref: db.collection('members').doc(doc.id), data: member };
    }
  });
  
  console.log(`\n🔍 Luana encontrada: ${luanaDoc ? 'SÍ' : 'NO'}`);
  if (luanaDoc) {
    console.log(`   ID: ${luanaDoc.ref.id}`);
    console.log(`   Nombre: ${luanaDoc.data.nombre}`);
    console.log(`   Email actual: "${luanaDoc.data.email}"`);
    console.log(`   UID actual: "${luanaDoc.data.uid}"`);
  }
  
  // 2. FIX LUANA: añadir email si no tiene
  // NOTA: El UID se llenará cuando cree su cuenta Auth (o se puede crear ahora)
  if (luanaDoc && !luanaDoc.data.email) {
    const luanaEmail = 'luana.dominguez@luxto.org'; // placeholder, ella lo cambiará al registrarse
    console.log(`\n✏️  Actualizando email de Luana a: ${luanaEmail}`);
    await luanaDoc.ref.update({ email: luanaEmail });
    console.log('   ✅ Email actualizado');
  }
  
  // 3. CREAR/POBLAR miembros_registro
  // Campos mínimos para matching: id, nombre, email (para mostrar), fotoThumb opcional
  const registroData = allMembers
    .filter(m => m.estado === 'activo' && m.nombre)
    .map(m => ({
      memberId: m.id,
      nombre: m.nombre,
      email: m.email || '',           // vacío si no tiene cuenta aún
      tieneCuenta: !!m.email && !!m.uid,
      rol: m.rol,
      fotoThumb: m.fotoDriveId ? `https://drive.google.com/thumbnail?id=${m.fotoDriveId}` : ''
    }));
  
  console.log(`\n📝 Escribiendo ${registroData.length} miembros en 'miembros_registro'...`);
  
  // Batch write (max 500 ops per batch)
  const batchSize = 400;
  for (let i = 0; i < registroData.length; i += batchSize) {
    const batch = db.batch();
    const chunk = registroData.slice(i, i + batchSize);
    for (const member of chunk) {
      const ref = db.collection('miembros_registro').doc(member.memberId);
      batch.set(ref, member);
    }
    await batch.commit();
    console.log(`   ✅ Batch ${Math.floor(i/batchSize)+1} escrito (${chunk.length} docs)`);
  }
  
  // 4. VERIFICAR matching fuzzy funciona
  console.log('\n🧪 Test matching fuzzy para "luana doming":');
  const testResults = findMatches('luana doming', allMembers);
  testResults.slice(0, 5).forEach((r, i) => {
    console.log(`   ${i+1}. ${r.nombre} (score: ${r.score.toFixed(2)}) [${r.id}]`);
  });
  
  console.log('\n🧪 Test matching fuzzy para "dominguez":');
  const testResults2 = findMatches('dominguez', allMembers);
  testResults2.slice(0, 5).forEach((r, i) => {
    console.log(`   ${i+1}. ${r.nombre} (score: ${r.score.toFixed(2)}) [${r.id}]`);
  });
  
  console.log('\n✅ Fix completado.');
  console.log('\n📋 PRÓXIMOS PASOS MANUALES:');
  console.log('   1. Luana va a registro.html, busca "Luana Domínguez" → la encuentra');
  console.log('   2. Hace click en su nombre → formulario pre-llenado');
  console.log('   3. Ingresa SU email real y contraseña → crea cuenta Auth');
  console.log('   4. Al crear cuenta, trigger (o script) actualiza members/{id}.uid con el nuevo UID');
  console.log('   5. Crea uid_map/{uid} → { memberId, email }');
  
  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });