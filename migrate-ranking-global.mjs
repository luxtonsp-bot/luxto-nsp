/**
 * Script de migración: rankingGlobal de email-sanitized key → uid key
 * Ejecutar UNA SOLA VEZ en Node.js con Firebase Admin SDK
 *
 * Uso:
 * 1. Configurar FIREBASE_DATABASE_EMULATOR_HOST=localhost:9000 para test local
 * 2. O usar credenciales de producción para migrar en prod
 * 3. node migrate-ranking-global.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

// Configuración - ajustar según entorno
const USE_EMULATOR = process.env.FIREBASE_DATABASE_EMULATOR_HOST !== undefined;
const PROJECT_ID = 'luxto-nsp';

async function main() {
  console.log('=== Migración rankingGlobal: email-sanitized → uid ===\n');

  // Inicializar Admin SDK
  let app;
  if (USE_EMULATOR) {
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
    app = initializeApp({ projectId: PROJECT_ID, databaseURL: 'http://127.0.0.1:9000' });
    console.log('Usando EMULADOR local');
  } else {
    // En producción usar application default credentials o service account
    app = initializeApp({ projectId: PROJECT_ID });
    console.log('Usando PRODUCCIÓN');
  }

  const db = getDatabase(app);
  const fsdb = getFirestore(app);

  try {
    // 1. Leer todos los miembros para mapear email-sanitized → uid
    console.log('\n1. Leyendo colección members...');
    const membersSnap = await fsdb.collection('members').get();
    const emailToUid = {};
    const uidToMember = {};

    membersSnap.forEach(doc => {
      const data = doc.data();
      const uid = doc.id;
      uidToMember[uid] = data;
      if (data.email) {
        const sanitized = data.email.replace(/[.#$[\]]/g, '_');
        emailToUid[sanitized] = uid;
      }
    });
    console.log(`   ${membersSnap.size} miembros leídos`);
    console.log(`   ${Object.keys(emailToUid).size} emails sanitizados mapeados`);

    // 2. Leer rankingGlobal actual
    console.log('\n2. Leyendo rankingGlobal actual...');
    const rankingRef = db.ref('rankingGlobal');
    const rankingSnap = await rankingRef.once('value');
    const rankingData = rankingSnap.val() || {};
    const oldKeys = Object.keys(rankingData);
    console.log(`   ${oldKeys.length} entradas en rankingGlobal`);

    if (oldKeys.length === 0) {
      console.log('   rankingGlobal vacío, nada que migrar');
      return;
    }

    // 3. Analizar keys actuales
    const uidKeys = [];
    const emailKeys = [];
    const otherKeys = [];

    for (const key of oldKeys) {
      if (emailToUid[key]) {
        emailKeys.push(key);
      } else if (uidToMember[key]) {
        uidKeys.push(key);
      } else {
        otherKeys.push(key);
      }
    }

    console.log(`   Keys tipo UID: ${uidKeys.length}`);
    console.log(`   Keys tipo email-sanitized: ${emailKeys.length}`);
    console.log(`   Keys no reconocidas: ${otherKeys.length}`);

    if (emailKeys.length === 0 && otherKeys.length === 0) {
      console.log('\n✅ Ya todo está en formato UID, no hay migración necesaria');
      return;
    }

    // 4. Migrar: email-sanitized → uid
    console.log('\n3. Migrando entries...');
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const emailKey of emailKeys) {
      const uid = emailToUid[emailKey];
      const data = rankingData[emailKey];

      if (!uid) {
        console.log(`   ⚠️  No se encontró UID para email-sanitized: ${emailKey}`);
        errors++;
        continue;
      }

      // Verificar si ya existe entry con UID
      const existingUidData = rankingData[uid];

      if (existingUidData) {
        // Merge: sumar puntos, mantener el más reciente
        const mergedPts = (existingUidData.pts || 0) + (data.pts || 0);
        const mergedUltima = Math.max(
          existingUidData.ultimaAsamblea || 0,
          data.ultimaAsamblea || 0
        );
        const mergedData = {
          ...existingUidData,
          ...data,
          pts: mergedPts,
          ultimaAsamblea: mergedUltima
        };

        await db.ref(`rankingGlobal/${uid}`).set(mergedData);
        await db.ref(`rankingGlobal/${emailKey}`).remove();
        console.log(`   🔀 Merge: ${emailKey} → ${uid} (pts: ${mergedPts})`);
      } else {
        // Simple move
        await db.ref(`rankingGlobal/${uid}`).set(data);
        await db.ref(`rankingGlobal/${emailKey}`).remove();
        console.log(`   ✅ Movido: ${emailKey} → ${uid}`);
      }
      migrated++;
    }

    // 5. Reportar keys no reconocidas
    for (const key of otherKeys) {
      console.log(`   ❓ Key no reconocida (requiere revisión manual): ${key}`);
      skipped++;
    }

    // 6. Verificar resultado
    console.log('\n4. Verificando resultado...');
    const newRankingSnap = await rankingRef.once('value');
    const newRankingData = newRankingSnap.val() || {};
    const newKeys = Object.keys(newRankingData);
    console.log(`   ${newKeys.length} entradas finales en rankingGlobal`);

    // Verificar que todas son UIDs válidos
    let validUids = 0;
    for (const key of newKeys) {
      if (uidToMember[key]) validUids++;
    }
    console.log(`   ${validUids}/${newKeys.length} son UIDs válidos de members`);

    console.log(`\n=== Resumen ===`);
    console.log(`   Migrados: ${migrated}`);
    console.log(`   Saltados (requieren revisión): ${skipped}`);
    console.log(`   Errores: ${errors}`);
    console.log(`\n✅ Migración completada`);

  } catch (error) {
    console.error('\n❌ Error en migración:', error);
    process.exit(1);
  }
}

main();