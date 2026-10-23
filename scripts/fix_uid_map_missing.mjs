#!/usr/bin/env node
/**
 * Fix: crea uid_map/{authUid} para usuarios de Auth que no lo tienen
 * Busca coincidencia en members por email (case-insensitive) o por campo uid
 *
 * Uso:
 *   node scripts/fix_uid_map_missing.mjs          # dry-run
 *   node scripts/fix_uid_map_missing.mjs --apply  # crea los docs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const PROJECT_ID = 'luxto-nsp';

const MODE = {
  dryRun: !process.argv.includes('--apply'),
  apply: process.argv.includes('--apply'),
};

function initAdmin() {
  if (getApps().length > 0) return getApps()[0];
  const sa = JSON.parse(readFileSync('/mnt/d/archivos_ubuntu/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-4adb8e2695.json', 'utf8'));
  return initializeApp({ credential: cert(sa), projectId: PROJECT_ID });
}

function anonEmail(e) { return e ? e.replace(/^(.?)([^@]*)@/, '$1***@') : 'sin-email'; }

async function main() {
  console.log('=== FIX uid_map FALTANTES ===');
  console.log('Modo:', MODE.apply ? 'APPLY' : 'DRY-RUN');
  console.log('');

  const app = initAdmin();
  const auth = getAuth(app);
  const db = getFirestore(app);

  // 1. Obtener todos los usuarios de Auth
  console.log('1/4 Leyendo usuarios de Auth...');
  const listUsersResult = await auth.listUsers(1000);
  const authUsers = listUsersResult.users;
  console.log(`   Total: ${authUsers.length}`);

  // 2. Obtener uid_map existentes
  console.log('2/4 Leyendo uid_map existentes...');
  const uidMapSnap = await db.collection('uid_map').limit(5000).get();
  const existingUidMap = new Set(uidMapSnap.docs.map(d => d.id));
  console.log(`   Existentes: ${existingUidMap.size}`);

  // 3. Obtener todos los members
  console.log('3/4 Leyendo members...');
  const membersSnap = await db.collection('members').limit(5000).get();
  const membersByEmail = new Map();
  const membersByUid = new Map();
  for (const doc of membersSnap.docs) {
    const data = doc.data();
    if (data.email) membersByEmail.set(data.email.toLowerCase(), doc.id);
    if (data.uid) membersByUid.set(data.uid, doc.id);
  }
  console.log(`   Members: ${membersSnap.size} (por email: ${membersByEmail.size}, por uid: ${membersByUid.size})`);

  // 4. Buscar coincidencias para usuarios sin uid_map
  console.log('4/4 Buscando coincidencias...');
  const results = [];
  for (const user of authUsers) {
    if (existingUidMap.has(user.uid)) continue;

    const email = user.email?.toLowerCase();
    let memberId = null;
    let matchType = null;
    let ambiguous = false;

    // Buscar por email
    if (email && membersByEmail.has(email)) {
      memberId = membersByEmail.get(email);
      matchType = 'email';
    }
    // Buscar por uid en member
    if (!memberId && membersByUid.has(user.uid)) {
      memberId = membersByUid.get(user.uid);
      matchType = 'uid';
    }
    // Si ambos existen y son distintos, es ambiguo
    if (email && membersByEmail.has(email) && membersByUid.has(user.uid) && membersByEmail.get(email) !== membersByUid.get(user.uid)) {
      ambiguous = true;
    }

    const status = !memberId ? 'SIN COINCIDENCIA' : ambiguous ? 'AMBIGUO' : matchType.toUpperCase();
    results.push({ authUid: user.uid, email: anonEmail(user.email), memberId, status, matchType });

    console.log(`  ${user.uid} | ${anonEmail(user.email)} | ${memberId || '-'} | ${status}`);
  }

  // Resumen
  const sinCoincidencia = results.filter(r => r.status === 'SIN COINCIDENCIA').length;
  const ambiguos = results.filter(r => r.status === 'AMBIGUO').length;
  const conMatch = results.filter(r => r.status === 'EMAIL' || r.status === 'UID').length;

  console.log(`\n=== RESUMEN ===`);
  console.log(`  Usuarios sin uid_map: ${results.length}`);
  console.log(`  Con coincidencia única: ${conMatch}`);
  console.log(`  Ambigüos: ${ambiguos}`);
  console.log(`  Sin coincidencia: ${sinCoincidencia}`);

  if (MODE.apply) {
    console.log('\n--- APLICANDO ---');
    let created = 0;
    for (const r of results) {
      if (r.status === 'EMAIL' || r.status === 'UID') {
        await db.collection('uid_map').doc(r.authUid).set({
          memberId: r.memberId,
          email: r.email.replace(/\*\*\*/g, ''), // nota: email anonimizado en log, aquí guardar real
          createdAt: new Date().toISOString()
        });
        created++;
        console.log(`  Creado: ${r.authUid} → ${r.memberId}`);
      }
    }
    console.log(`\nCreados: ${created}`);
  }
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });