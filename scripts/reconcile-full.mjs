/**
 * SCRIPT DE RECONCILIACIÓN COMPLETA
 *
 * 1. Lee Excel: members.csv (nombres, emails, fotos) + attendance.csv (histórico 2026)
 * 2. Mapea nombres → UIDs en Firestore (por email)
 * 3. Migra TODAS las fechas de asistencia a asistencia/2026/{fecha}/
 * 4. Migra fotos (fotoThumb/fotoDriveId) a members/{uid}
 * 5. Recalcula asistenciasTotales en members/{uid} desde histórico real
 *
 * Uso: node scripts/reconcile-full.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Config Firebase Admin
const serviceAccount = JSON.parse(
  fs.readFileSync('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-b80cad13e2.json', 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Utilidades
function convertirUrlDrive(url) {
  if (!url) return "";
  if (url.includes("drive.google.com/thumbnail")) return url;
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
     || url.match(/\/d\/([a-zA-Z0-9_-]{20,})/)
     || url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w400";
  return url;
}

function parseExcelDate(cell) {
  // Hoja "Asistencia": columnas como "03/01", "10/01", "2026-01-17 00:00:00"
  if (!cell) return null;
  const str = String(cell).trim();

  // Formato DD/MM (ej: "03/01" → 2026-01-03)
  if (/^\d{2}\/\d{2}$/.test(str)) {
    const [d, m] = str.split('/');
    return `2026-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // Formato YYYY-MM-DD (ej: "2026-01-17 00:00:00")
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.split(' ')[0];
  }

  return null;
}

async function main() {
  console.log('🔄 Iniciando reconciliación completa...\n');

  // 1. LEER EXCEL EXPORTADO (CSV)
  const membersCsv = fs.readFileSync(
    '/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/members.csv', 'utf8'
  );
  const attendanceCsv = fs.readFileSync(
    '/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance.csv', 'utf8'
  );

  // Parsear CSV simple (sin librería externa)
  function parseCsv(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < headers.length) continue;
      const row = {};
      headers.forEach((h, idx) => row[h] = (cols[idx] || '').trim());
      rows.push(row);
    }
    return rows;
  }

  const excelMembers = parseCsv(membersCsv);
  const excelAttendance = parseCsv(attendanceCsv);

  console.log(`📊 Excel members: ${excelMembers.length} filas`);
  console.log(`📊 Excel attendance: ${excelAttendance.length} filas\n`);

  // 2. OBTENER TODOS LOS MEMBERS DE FIRESTORE (para mapear email → uid)
  const membersSnap = await db.collection('members').get();
  const firestoreMembers = new Map(); // email → {uid, data}
  const firestoreMembersByName = new Map(); // nombre normalizado → {uid, data}

  membersSnap.forEach(doc => {
    const data = doc.data();
    if (data.email) firestoreMembers.set(data.email.toLowerCase().trim(), { uid: doc.id, data });
    if (data.nombre) firestoreMembersByName.set(data.nombre.toLowerCase().trim(), { uid: doc.id, data });
  });

  console.log(`🔥 Firestore members: ${firestoreMembers.size} con email, ${firestoreMembersByName.size} con nombre\n`);

  // 3. MAPEAR EXCEL MEMBERS → FIRESTORE UIDs
  const memberMap = new Map(); // excelNombre → {uid, email, fotoThumb, fotoDriveId}
  let mapped = 0, unmapped = 0;

  for (const em of excelMembers) {
    const excelNombre = (em['Nombres '] || '').trim(); // nota: espacio al final en header
    const excelEmail = (em['Correo'] || '').trim().toLowerCase();
    const excelFoto = (em['Codigo Foto'] || '').trim();
    const excelUid = (em['Columna 1'] || '').trim(); // parece ser UID

    if (!excelNombre) continue;

    let match = null;

    // Prioridad 1: email exacto
    if (excelEmail && firestoreMembers.has(excelEmail)) {
      match = firestoreMembers.get(excelEmail);
    }
    // Prioridad 2: nombre exacto (normalizado)
    else if (firestoreMembersByName.has(excelNombre.toLowerCase())) {
      match = firestoreMembersByName.get(excelNombre.toLowerCase());
    }
    // Prioridad 3: UID directo (columna "Columna 1")
    else if (excelUid) {
      const doc = await db.collection('members').doc(excelUid).get();
      if (doc.exists) match = { uid: excelUid, data: doc.data() };
    }

    if (match) {
      memberMap.set(excelNombre, {
        uid: match.uid,
        email: excelEmail,
        fotoThumb: excelFoto.startsWith('http') ? excelFoto : '',
        fotoDriveId: excelFoto.includes('drive.google.com')
          ? (excelFoto.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) || [null,null])[1]
          : ''
      });
      mapped++;
    } else {
      console.log(`⚠️  Sin mapear: "${excelNombre}" (email: ${excelEmail || 'N/A'})`);
      unmapped++;
    }
  }

  console.log(`\n✅ Mapeados: ${mapped} | ⚠️ Sin mapear: ${unmapped}\n`);

  // 4. PROCESAR HOJA ASISTENCIA: extraer fechas y valores por miembro
  // Headers: Nombre, 03/01, 10/01, 2026-01-17..., ..., Total
  const attendanceHeaders = attendanceCsv.split('\n')[0].split(',').map(h => h.trim());
  const fechaColumns = [];

  for (let i = 1; i < attendanceHeaders.length - 1; i++) { // -1 para excluir "Total"
    const fecha = parseExcelDate(attendanceHeaders[i]);
    if (fecha) fechaColumns.push({ index: i, fecha });
  }

  console.log(`📅 Fechas detectadas en Excel: ${fechaColumns.length}`);
  fechaColumns.forEach(fc => console.log(`   ${fc.fecha} (col ${fc.index})`));

  // 5. MIGRAR ASISTENCIA POR FECHA
  console.log('\n📝 Migrando asistencia histórica...\n');

  let totalEscritos = 0;
  const asistenciaPorUid = new Map(); // uid → Set<fecha> (para recalcular totales)

  for (const fc of fechaColumns) {
    const fecha = fc.fecha;
    const colIndex = fc.index;
    let escritosFecha = 0;

    for (const row of excelAttendance) {
      const excelNombre = (row['Nombre'] || '').trim();
      if (!excelNombre) continue;

      const mapEntry = memberMap.get(excelNombre);
      if (!mapEntry) continue;

      const valor = parseFloat(row[attendanceHeaders[colIndex]] || '0');
      if (valor >= 1) { // presente
        const uid = mapEntry.uid;

        // Escribir en asistencia/2026/{fecha}/{uid}
        await db.collection('asistencia').doc('2026').collection(fecha).doc(uid).set({
          uid,
          presente: true,
          fecha,
          timestamp: new Date(fecha + 'T16:00:00-05:00'), // hora estimada asamblea
          tardanzaMinutos: 0,
          esTardanza: false
        }, { merge: true });

        // Acumular para recalcular totales
        if (!asistenciaPorUid.has(uid)) asistenciaPorUid.set(uid, new Set());
        asistenciaPorUid.get(uid).add(fecha);
        escritosFecha++;
        totalEscritos++;
      }
    }
    console.log(`   ${fecha}: ${escritosFecha} registros`);
  }

  console.log(`\n✅ Total asistencia migrada: ${totalEscritos} documentos\n`);

  // 6. MIGRAR FOTOS A MEMBERS
  console.log('🖼️  Migrando fotos a members...\n');
  let fotosActualizadas = 0;

  for (const [excelNombre, mapEntry] of memberMap) {
    const { uid, fotoThumb, fotoDriveId } = mapEntry;
    if (fotoThumb || fotoDriveId) {
      await db.collection('members').doc(uid).update({
        fotoThumb: fotoThumb || null,
        fotoDriveId: fotoDriveId || null
      });
      fotosActualizadas++;
    }
  }
  console.log(`✅ Fotos actualizadas: ${fotosActualizadas}\n`);

  // 7. RECALCULAR asistenciasTotales EN MEMBERS
  console.log('🔢 Recalculando asistenciasTotales en members...\n');
  let totalesActualizados = 0;

  for (const [uid, fechasSet] of asistenciaPorUid) {
    const total = fechasSet.size;
    await db.collection('members').doc(uid).update({
      asistenciasTotales: total,
      ultimaAsistencia: Array.from(fechasSet).sort().pop() || null
    });
    totalesActualizados++;
    console.log(`   ${uid}: ${total} asistencias totales`);
  }

  // Para members que no tienen asistencia histórica, poner 0
  for (const doc of membersSnap.docs) {
    if (!asistenciaPorUid.has(doc.id)) {
      await doc.ref.update({
        asistenciasTotales: 0,
        ultimaAsistencia: null
      });
      totalesActualizados++;
    }
  }

  console.log(`\n✅ Totales recalculados: ${totalesActualizados} miembros\n`);

  // 8. VERIFICACIÓN: mostrar resumen de algunos miembros clave
  console.log('🔍 Verificación (muestra):');
  const testNames = ['Bryan Ballon', 'Diego García', 'Gianfranco Camones', 'Maje Roncal', 'Paolo Alfaro', 'Ricardo Mantilla'];

  for (const nombre of testNames) {
    const mapEntry = memberMap.get(nombre);
    if (mapEntry) {
      const doc = await db.collection('members').doc(mapEntry.uid).get();
      const data = doc.data();
      const asistio = asistenciaPorUid.get(mapEntry.uid)?.size || 0;
      console.log(`   ${nombre}: asistenciasTotales=${data.asistenciasTotales}, calculado=${asistio}, foto=${data.fotoThumb ? 'OK' : 'NO'}`);
    }
  }

  console.log('\n🎉 ¡Reconciliación completa!');
}

main().catch(console.error);