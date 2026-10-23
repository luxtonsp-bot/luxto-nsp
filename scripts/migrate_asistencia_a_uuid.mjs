#!/usr/bin/env node
/**
 * Migración: asistencia/{anio}/{fecha}/{id} → asistencia/{anio}/{fecha}/{memberId}
 * Uso:
 *   node scripts/migrate_asistencia_a_uuid.mjs                    # dry-run
 *   node scripts/migrate_asistencia_a_uuid.mjs --backup           # exporta backup
 *   node scripts/migrate_asistencia_a_uuid.mjs --apply            # aplica (requiere backup de hoy)
 *   node scripts/migrate_asistencia_a_uuid.mjs --apply --delete-old  # aplica y borra viejos (requiere backup de hoy)
 *
 * Requiere: GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT_JSON
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const PROJECT_ID = 'luxto-nsp';
const DATABASE_URL = 'https://luxto-nsp-default-rtdb.firebaseio.com';

const MODE = {
  dryRun: !process.argv.includes('--apply'),
  backup: process.argv.includes('--backup'),
  apply: process.argv.includes('--apply'),
  deleteOld: process.argv.includes('--delete-old'),
};

function initAdmin() {
  if (getApps().length > 0) return getApps()[0];
  let credential;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = cert(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  } else {
    throw new Error('Define GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT_JSON');
  }
  return initializeApp({ credential, projectId: PROJECT_ID, databaseURL: DATABASE_URL });
}

function anonEmail(e) { return e ? e.replace(/^(.?)([^@]*)@/, '$1***@') : 'sin-email'; }
function anonName(n) { return n ? n.split(' ')[0] + ' Persona' : 'Sin Nombre'; }
function isUUID(id) { return typeof id === 'string' && id.length === 36 && id.includes('-'); }
function isAuthUID(id) { return typeof id === 'string' && id.length === 28 && /^[A-Za-z0-9_-]{28}$/.test(id); }
function todayStamp() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

async function buildResolutionMap(db) {
  // Map<clave, Set<memberId>> - una clave es ambigua SOLO si su Set tiene >1 memberId distinto
  const map = new Map();
  const membersSnap = await db.collection('members').limit(5000).get();
  const uidMapSnap = await db.collection('uid_map').limit(5000).get();

  function add(key, memberId) {
    if (!key || !memberId) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(memberId);
  }

  // 1. uid_map/{authUid}.memberId
  for (const doc of uidMapSnap.docs) {
    const { memberId } = doc.data();
    add(doc.id, memberId);
  }

  // 2. members/{id} fields
  for (const doc of membersSnap.docs) {
    const data = doc.data();
    const memberId = doc.id; // el UUID canónico
    add(data.memberIdAntiguo, memberId);
    add(data.legacyId, memberId);
    add(data.uid, memberId);
    // El propio UUID apunta a sí mismo
    add(memberId, memberId);
  }

  // Convertir a mapa de resolución: key -> { memberId, ambiguous }
  const resMap = new Map();
  for (const [key, memberIdSet] of map.entries()) {
    if (memberIdSet.size === 1) {
      resMap.set(key, { memberId: [...memberIdSet][0], ambiguous: false });
    } else {
      // Ambigua: apunta a múltiples memberId distintos
      resMap.set(key, { memberId: null, ambiguous: true, memberIds: [...memberIdSet] });
    }
  }
  return resMap;
}

async function collectAssistance(db) {
  const asistColl = db.collection('asistencia');
  const yearsSnap = await asistColl.listDocuments();
  const byDate = {}; // year/fecha -> { docs: [], counts: {} }

  for (const yearDoc of yearsSnap) {
    const year = yearDoc.id;
    const datesSnap = await yearDoc.listCollections();
    for (const dateColl of datesSnap) {
      const fecha = dateColl.id;
      const docsSnap = await dateColl.limit(5000).get();
      const docs = [];
      for (const doc of docsSnap.docs) {
        docs.push({ id: doc.id, data: doc.data(), ref: doc.ref, year, fecha });
      }
      byDate[`${year}/${fecha}`] = { docs };
    }
  }
  return byDate;
}

function resolveId(id, resMap) {
  const entry = resMap.get(id);
  if (!entry) return { type: 'HUÉRFANO', memberId: null, reason: `ID "${id}" no resuelve` };
  if (entry.ambiguous) return { type: 'AMBIGUO', memberId: entry.memberId, reason: `ID "${id}" resuelve a múltiples memberId` };
  if (entry.memberId === id) return { type: 'YA_MIGRADO', memberId: entry.memberId };
  return { type: 'CANDIDATO', memberId: entry.memberId };
}

function groupByFechaMember(byDateObj, resMap) {
  const groups = {}; // year/fecha -> memberId -> [{ id, data, resolution }]
  for (const [key, value] of Object.entries(byDateObj)) {
    const docs = value.docs;
    groups[key] = {};
    for (const doc of docs) {
      const res = resolveId(doc.id, resMap);
      if (res.type === 'CANDIDATO' || res.type === 'YA_MIGRADO') {
        if (!groups[key][res.memberId]) groups[key][res.memberId] = [];
        groups[key][res.memberId].push({ ...doc, resolution: res });
      }
    }
  }
  return groups;
}

function detectConflicts(groups) {
  const conflicts = [];
  for (const [fechaKey, byMember] of Object.entries(groups)) {
    for (const [memberId, sources] of Object.entries(byMember)) {
      if (sources.length > 1) {
        // comparar presente y tardanzaMinutos
        const first = sources[0].data;
        const same = sources.every(s => s.data.presente === first.presente && s.data.tardanzaMinutos === first.tardanzaMinutos);
        if (!same) {
          conflicts.push({ fechaKey, memberId, sources: sources.map(s => ({ id: s.id, presente: s.data.presente, tardanza: s.data.tardanzaMinutos })) });
        }
      }
    }
  }
  return conflicts;
}

async function exportBackup(db, byDate) {
  const all = [];
  for (const [, { docs }] of Object.entries(byDate)) {
    for (const doc of docs) {
      all.push({ year: doc.year, fecha: doc.fecha, id: doc.id, data: doc.data });
    }
  }
  const ts = todayStamp();
  const path = `migration/backup_asistencia_${ts}.json`;
  ensureDir('migration');
  writeFileSync(path, JSON.stringify({ exportedAt: new Date().toISOString(), total: all.length, docs: all }, null, 2));
  return { path, count: all.length };
}

async function applyMigration(db, byDate, groups, conflicts, mode) {
  const conflictSet = new Set(conflicts.map(c => `${c.fechaKey}|${c.memberId}`));
  let created = 0, skipped = 0, errors = 0;

  for (const [fechaKey, byMember] of Object.entries(groups)) {
    const [year, fecha] = fechaKey.split('/');
    const collRef = db.collection('asistencia').doc(year).collection(fecha);
    const batch = db.batch();
    let batchOps = 0;

    for (const [memberId, sources] of Object.entries(byMember)) {
      if (conflictSet.has(`${fechaKey}|${memberId}`)) { skipped++; continue; }
      const src = sources[0]; // ya validado que no hay conflicto
      const newRef = collRef.doc(memberId);
      const existsSnap = await newRef.get();
      if (existsSnap.exists) { skipped++; continue; }

      const newData = { ...src.data, uid: memberId, migradoDesde: src.id, migradoEn: Timestamp.now() };
      batch.set(newRef, newData);
      batchOps++;
      if (batchOps >= 400) { await batch.commit(); batchOps = 0; }
    }
    if (batchOps > 0) await batch.commit();
    created += batchOps;
  }
  return { created, skipped, errors };
}

async function deleteOld(db, byDate, groups, conflicts, mode) {
  // Verificación previa: todos los Auth con member coincidente tienen uid_map
  const authMapSnap = await db.collection('uid_map').limit(5000).get();
  const uidsWithMap = new Set(authMapSnap.docs.map(d => d.id));

  // Obtener todos los members con uid
  const membersSnap = await db.collection('members').limit(5000).get();
  const memberUids = new Set();
  for (const doc of membersSnap.docs) {
    if (doc.data().uid) memberUids.add(doc.data().uid);
  }
  const missingUidMap = [...memberUids].filter(u => !uidsWithMap.has(u));
  if (missingUidMap.length > 0) {
    throw new Error(`ABORT: ${missingUidMap.length} usuarios Auth con member NO tienen uid_map. No se pueden borrar viejos.`);
  }

  const conflictSet = new Set(conflicts.map(c => `${c.fechaKey}|${c.memberId}`));
  let deleted = 0, errors = 0;

  for (const [fechaKey, byMember] of Object.entries(groups)) {
    const [year, fecha] = fechaKey.split('/');
    const collRef = db.collection('asistencia').doc(year).collection(fecha);
    const batch = db.batch();
    let batchOps = 0;

    for (const [memberId, sources] of Object.entries(byMember)) {
      if (conflictSet.has(`${fechaKey}|${memberId}`)) continue;
      const newRef = collRef.doc(memberId);
      const newSnap = await newRef.get();
      if (!newSnap.exists) continue; // no hay doc nuevo, no borrar

      const newData = newSnap.data();
      for (const src of sources) {
        const oldRef = collRef.doc(src.id);
        const oldSnap = await oldRef.get();
        if (!oldSnap.exists) continue;
        const oldData = oldSnap.data();
        // Solo borrar si coinciden presente, tardanzaMinutos, fecha
        if (oldData.presente === newData.presente &&
            oldData.tardanzaMinutos === newData.tardanzaMinutos &&
            oldData.fecha === newData.fecha) {
          batch.delete(oldRef);
          batchOps++;
          deleted++;
          if (batchOps >= 400) { await batch.commit(); batchOps = 0; }
        }
      }
    }
    if (batchOps > 0) await batch.commit();
  }
  return { deleted, errors };
}

async function verifyAssistenciasTotales(db, byDate, resMap) {
  // Contar presentes POR MEMBERID DESTINO (como si ya se hubiera aplicado la migración)
  const projectedCounts = new Map(); // memberId -> count
  
  for (const [, { docs }] of Object.entries(byDate)) {
    for (const doc of docs) {
      const res = resolveId(doc.id, resMap);
      if (res.type === 'CANDIDATO' || res.type === 'YA_MIGRADO') {
        // doc.data ya es el objeto de datos (no un DocumentSnapshot)
        const data = doc.data;
        if (data.presente === true) {
          projectedCounts.set(res.memberId, (projectedCounts.get(res.memberId) || 0) + 1);
        }
      }
    }
  }

  // Leer members.asistenciasTotales
  const membersSnap = await db.collection('members').limit(5000).get();
  const diffs = [];
  for (const doc of membersSnap.docs) {
    const memberId = doc.id;
    const enAsistencia = projectedCounts.get(memberId) || 0;
    const enMember = doc.data().asistenciasTotales || 0;
    if (enAsistencia !== enMember) {
      diffs.push({ memberId, enAsistencia, enMember, diff: enAsistencia - enMember });
    }
  }
  return diffs;
}

async function main() {
  console.log('=== MIGRACIÓN ASISTENCIA → UUID ===');
  console.log('Modo:', MODE.apply ? 'APPLY' : 'DRY-RUN', MODE.backup ? '+BACKUP' : '', MODE.deleteOld ? '+DELETE-OLD' : '');
  console.log('');

  const app = initAdmin();
  const db = getFirestore(app);

  // 1. Mapa de resolución
  console.log('1/6 Construyendo mapa de resolución...');
  const resMap = await buildResolutionMap(db);
  console.log(`   Entradas: ${resMap.size}, Ambigüas: ${[...resMap.values()].filter(v => v.ambiguous).length}`);

  // 2. Recopilar asistencia
  console.log('2/6 Leyendo asistencia...');
  const byDate = await collectAssistance(db);
  let totalRead = 0;
  for (const v of Object.values(byDate)) totalRead += v.docs.length;
  console.log(`   Fechas: ${Object.keys(byDate).length}, Docs totales: ${totalRead}`);

  // 3. Agrupar y clasificar
  console.log('3/6 Clasificando...');
  console.log('   Llamando groupByFechaMember...');
  const groups = groupByFechaMember(byDate, resMap);
  console.log('   groupByFechaMember OK');
  let yaMigrados = 0, candidatos = 0, huerfanos = 0, ambiguos = 0;
  const huerfanoList = [], ambiguoList = [];
  const origenCounts = { authUid: 0, legacy: 0, uuid: 0, other: 0 };

  for (const [fechaKey, { docs }] of Object.entries(byDate)) {
    for (const doc of docs) {
      const res = resolveId(doc.id, resMap);
      if (res.type === 'YA_MIGRADO') {
        yaMigrados++;
        if (isAuthUID(doc.id)) origenCounts.authUid++;
        else if (isUUID(doc.id)) origenCounts.uuid++;
        else origenCounts.legacy++;
      } else if (res.type === 'CANDIDATO') {
        candidatos++;
        if (isAuthUID(doc.id)) origenCounts.authUid++;
        else if (isUUID(doc.id)) origenCounts.uuid++;
        else origenCounts.legacy++;
      } else if (res.type === 'HUÉRFANO') { huerfanos++; huerfanoList.push({ fechaKey, id: doc.id, data: doc.data }); }
      else if (res.type === 'AMBIGUO') { ambiguos++; ambiguoList.push({ fechaKey, id: doc.id, memberId: res.memberId, reason: res.reason, memberIds: res.memberIds }); }
    }
  }
  console.log(`   Ya migrados: ${yaMigrados}, Candidatos: ${candidatos}, Huérfanos: ${huerfanos}, Ambigüos: ${ambiguos}`);
  console.log(`   Origen candidatos: AuthUID=${origenCounts.authUid}, UUID=${origenCounts.uuid}, Legacy=${origenCounts.legacy}, Other=${origenCounts.other}`);

  // Mostrar claves realmente ambiguas (las que tienen >1 memberId)
  const trulyAmbiguous = [];
  for (const [key, entry] of resMap.entries()) {
    if (entry.ambiguous) {
      trulyAmbiguous.push({ key, memberIds: entry.memberIds });
    }
  }
  if (trulyAmbiguous.length) {
    console.log(`\n=== CLAVES REALMENTE AMBIGUAS (${trulyAmbiguous.length}) ===`);
    for (const a of trulyAmbiguous.slice(0, 20)) {
      console.log(`  ${a.key} → ${a.memberIds.join(', ')}`);
    }
    if (trulyAmbiguous.length > 20) console.log(`  ... y ${trulyAmbiguous.length - 20} más`);
  }

  // 4. Detectar conflictos
  console.log('4/6 Detectando conflictos...');
  const conflicts = detectConflicts(groups);
  console.log(`   Conflictos: ${conflicts.length}`);

  // 5. Backup si pedido
  let backupInfo = null;
  if (MODE.backup) {
    console.log('5/6 Exportando backup...');
    backupInfo = await exportBackup(db, byDate);
    console.log(`   Backup: ${backupInfo.path} (${backupInfo.count} docs)`);
  }

  // 6. Apply / Delete-old
  let applyResult = null, deleteResult = null;
  if (MODE.apply) {
    if (!MODE.backup) {
      // Verificar si existe backup de hoy
      const fs = await import('fs');
      const files = fs.readdirSync('migration').filter(f => f.startsWith('backup_asistencia_') && f.includes(todayStamp().slice(0, 10)));
      if (files.length === 0) throw new Error('ABORT: --apply requiere backup de hoy. Ejecuta con --backup primero.');
    }
    console.log('5/6 Aplicando migración...');
    applyResult = await applyMigration(db, byDate, groups, conflicts, MODE);
    console.log(`   Creados: ${applyResult.created}, Saltados: ${applyResult.skipped}`);
  }
  if (MODE.deleteOld) {
    console.log('6/6 Borrando docs viejos...');
    deleteResult = await deleteOld(db, byDate, groups, conflicts, MODE);
    console.log(`   Borrados: ${deleteResult.deleted}`);
  }

  // 7. Verificación asistenciasTotales
  console.log('7/7 Verificando asistenciasTotales...');
  const diffs = await verifyAssistenciasTotales(db, byDate, resMap);
  console.log(`   Diferencias: ${diffs.length}`);

  // Reporte
  const report = {
    timestamp: new Date().toISOString(),
    mode: MODE,
    totals: {
      read: totalRead,
      yaMigrados,
      candidatos,
      copiados: applyResult?.created || 0,
      huerfanos,
      ambiguos,
      conflictos: conflicts.length,
      borrados: deleteResult?.deleted || 0,
      origenCandidatos: origenCounts,
      clavesAmbiguas: trulyAmbiguous.length,
    },
    backup: backupInfo?.path || null,
    huerfanos: huerfanoList.map(d => ({ fecha: d.fechaKey, id: d.id, presente: d.data.presente, tardanza: d.data.tardanzaMinutos })),
    ambiguos: ambiguoList.map(d => ({ fecha: d.fechaKey, id: d.id, memberId: d.memberId, memberIds: d.memberIds })),
    conflictos: conflicts.map(c => ({ fecha: c.fechaKey, memberId: c.memberId, sources: c.sources })),
    clavesRealmenteAmbiguas: trulyAmbiguous.map(a => ({ key: a.key, memberIds: a.memberIds })),
    diffsAsistenciasTotales: diffs.map(d => ({ memberId: d.memberId, enAsistencia: d.enAsistencia, enMember: d.enMember, diff: d.diff })),
  };

  ensureDir('migration');
  const reportPath = 'migration/reporte_asistencia_uuid.json';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReporte guardado en ${reportPath}`);

  // Resumen compacto por fecha
  console.log('\n=== RESUMEN POR FECHA ===');
  for (const [fechaKey, { docs }] of Object.entries(byDate).sort()) {
    const g = groups[fechaKey] || {};
    const cands = Object.values(g).flat().length;
    console.log(`  ${fechaKey}: leídos=${docs.length}, yaMigrados=${docs.filter(d => isUUID(d.id)).length}, candidatos=${cands}, huerfanos=${docs.filter(d => resolveId(d.id, resMap).type==='HUÉRFANO').length}, ambiguos=${docs.filter(d => resolveId(d.id, resMap).type==='AMBIGUO').length}`);
  }

  if (huerfanoList.length) {
    console.log('\n=== HUÉRFANOS (anonimizados) ===');
    for (const h of huerfanoList.slice(0, 20)) console.log(`  ${h.fecha} | id=${h.id} | presente=${h.presente} tardanza=${h.tardanza}`);
    if (huerfanoList.length > 20) console.log(`  ... y ${huerfanoList.length - 20} más`);
  }
  if (ambiguoList.length) {
    console.log('\n=== AMBIGUOS ===');
    for (const a of ambiguoList) console.log(`  ${a.fecha} | id=${a.id} → ${a.memberId}`);
  }
  if (conflicts.length) {
    console.log('\n=== CONFLICTOS ===');
    for (const c of conflicts) console.log(`  ${c.fecha} | ${c.memberId} | ${c.sources.map(s => `${s.id}:p=${s.presente},t=${s.tardanza}`).join(' | ')}`);
  }
  if (diffs.length) {
    console.log('\n=== DIFERENCIAS asistenciasTotales ===');
    for (const d of diffs.slice(0, 20)) console.log(`  ${d.memberId}: asistencia=${d.enAsistencia} member=${d.enMember} diff=${d.diff}`);
    if (diffs.length > 20) console.log(`  ... y ${diffs.length - 20} más`);
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });