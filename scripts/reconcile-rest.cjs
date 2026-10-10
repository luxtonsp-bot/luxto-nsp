/**
 * RECONCILIACIÓN VÍA FIREBASE REST API (sin firebase-admin)
 * Usa service account para obtener access token OAuth2
 * Luego usa REST API para escribir en Firestore
 */

const fs = require('fs');
const https = require('https');

// Config
const SERVICE_ACCOUNT = JSON.parse(
  fs.readFileSync('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/luxto-nsp-firebase-adminsdk-fbsvc-b80cad13e2.json', 'utf8')
);
const PROJECT_ID = 'luxto-nsp';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

let accessToken = null;
let tokenExpiry = 0;

// Obtener access token OAuth2 usando JWT
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (accessToken && now < tokenExpiry - 60) return accessToken;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const crypto = require('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(Buffer.from(JSON.stringify(header)).toString('base64url') + '.' + Buffer.from(JSON.stringify(claim)).toString('base64url'));
  const signature = sign.sign(SERVICE_ACCOUNT.private_key, 'base64url');

  const jwt = Buffer.from(JSON.stringify(header)).toString('base64url') + '.' +
              Buffer.from(JSON.stringify(claim)).toString('base64url') + '.' +
              signature;

  return new Promise((resolve, reject) => {
    const data = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    });

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(body);
        if (parsed.access_token) {
          accessToken = parsed.access_token;
          tokenExpiry = now + parsed.expires_in;
          resolve(accessToken);
        } else {
          reject(new Error('No access token: ' + body));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Helpers Firestore REST
function firestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') return { doubleValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(firestoreValue) } };
  if (typeof val === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(val).map(([k, v]) => [k, firestoreValue(v)])) } };
  return { stringValue: String(val) }
}

async function firestoreWrite(collectionPath, docId, data, merge = false) {
  const token = await getAccessToken();
  const url = `${FIRESTORE_BASE}/${collectionPath}/${docId}?${merge ? 'merge=true' : ''}`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, firestoreValue(v)])) });
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}/${docId}?${merge ? 'merge=true' : ''}`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(body));
        else reject(new Error(`HTTP ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function firestoreRead(collectionPath, docId) {
  const token = await getAccessToken();
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}/${docId}`,
      headers: { 'Authorization': `Bearer ${token}` }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(body));
        else if (res.statusCode === 404) resolve(null);
        else reject(new Error(`HTTP ${res.statusCode}: ${body}`));
      });
    }).on('error', reject);
  });
}

async function firestoreQuery(collectionPath, filters = []) {
  const token = await getAccessToken();
  let body = JSON.stringify({ structuredQuery: { from: [{ collectionId: collectionPath }], where: filters.length ? { compositeFilter: { op: 'AND', filters } } : undefined } });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const lines = body.trim().split('\n');
          const docs = lines.map(l => JSON.parse(l)).filter(d => d.document).map(d => d.document);
          resolve(docs);
        } else reject(new Error(`HTTP ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseFirestoreDoc(doc) {
  if (!doc || !doc.fields) return null;
  const data = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if (v.stringValue !== undefined) data[k] = v.stringValue;
    else if (v.doubleValue !== undefined) data[k] = v.doubleValue;
    else if (v.integerValue !== undefined) data[k] = parseInt(v.integerValue);
    else if (v.booleanValue !== undefined) data[k] = v.booleanValue;
    else if (v.timestampValue !== undefined) data[k] = new Date(v.timestampValue);
    else if (v.mapValue) data[k] = parseFirestoreDoc({ fields: v.mapValue.fields });
    else if (v.arrayValue) data[k] = v.arrayValue.values.map(parseFirestoreDoc);
    else if (v.nullValue !== undefined) data[k] = null;
  }
  return data;
}

// Utilidades
function convertirUrlDrive(url) {
  if (!url) return "";
  if (url.includes("drive.google.com/thumbnail")) return url;
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) || url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w400";
  return url;
}

function parseExcelDate(cell) {
  if (!cell) return null;
  const str = String(cell).trim();
  if (/^\d{2}\/\d{2}$/.test(str)) {
    const [d, m] = str.split('/');
    return `2026-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.split(' ')[0];
  return null;
}

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

async function main() {
  console.log('🔄 Iniciando reconciliación completa (REST API)...\n');

  // 1. LEER EXCEL EXPORTADO (CSV)
  const membersCsv = fs.readFileSync('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/members.csv', 'utf8');
  const attendanceCsv = fs.readFileSync('/home/odoo-01/Escritorio/pagina_Luxto/luxto-nsp/migration/sheets_export/attendance.csv', 'utf8');

  const excelMembers = parseCsv(membersCsv);
  const excelAttendance = parseCsv(attendanceCsv);

  console.log(`📊 Excel members: ${excelMembers.length} filas`);
  console.log(`📊 Excel attendance: ${excelAttendance.length} filas\n`);

  // 2. OBTENER TODOS LOS MEMBERS DE FIRESTORE
  console.log('🔥 Leyendo members de Firestore...');
  const membersDocs = await firestoreQuery('members');
  const firestoreMembers = new Map(); // email → {uid, data}
  const firestoreMembersByName = new Map(); // nombre normalizado → {uid, data}

  for (const doc of membersDocs) {
    const data = parseFirestoreDoc(doc);
    const uid = doc.name.split('/').pop();
    if (data.email) firestoreMembers.set(data.email.toLowerCase().trim(), { uid, data });
    if (data.nombre) firestoreMembersByName.set(data.nombre.toLowerCase().trim(), { uid, data });
  }

  console.log(`🔥 Firestore members: ${firestoreMembers.size} con email, ${firestoreMembersByName.size} con nombre\n`);

  // 3. MAPEAR EXCEL MEMBERS → FIRESTORE UIDs
  const memberMap = new Map();
  let mapped = 0, unmapped = 0;

  for (const em of excelMembers) {
    const excelNombre = (em['Nombres '] || '').trim();
    const excelEmail = (em['Correo'] || '').trim().toLowerCase();
    const excelFoto = (em['Codigo Foto'] || '').trim();
    const excelUid = (em['Columna 1'] || '').trim();

    if (!excelNombre) continue;

    let match = null;
    if (excelEmail && firestoreMembers.has(excelEmail)) match = firestoreMembers.get(excelEmail);
    else if (firestoreMembersByName.has(excelNombre.toLowerCase())) match = firestoreMembersByName.get(excelNombre.toLowerCase());
    else if (excelUid) {
      const doc = await firestoreRead('members', excelUid);
      if (doc) match = { uid: excelUid, data: parseFirestoreDoc(doc) };
    }

    if (match) {
      let fotoDriveId = '';
      if (excelFoto.includes('drive.google.com')) {
        const m = excelFoto.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
        if (m) fotoDriveId = m[1];
      }
      memberMap.set(excelNombre, {
        uid: match.uid,
        email: excelEmail,
        fotoThumb: excelFoto.startsWith('http') ? excelFoto : '',
        fotoDriveId: fotoDriveId
      });
      mapped++;
    } else {
      console.log(`⚠️  Sin mapear: "${excelNombre}" (email: ${excelEmail || 'N/A'})`);
      unmapped++;
    }
  }

  console.log(`\n✅ Mapeados: ${mapped} | ⚠️ Sin mapear: ${unmapped}\n`);

  // 4. PROCESAR HOJA ASISTENCIA
  const attendanceHeaders = attendanceCsv.split('\n')[0].split(',').map(h => h.trim());
  const fechaColumns = [];

  for (let i = 1; i < attendanceHeaders.length - 1; i++) {
    const fecha = parseExcelDate(attendanceHeaders[i]);
    if (fecha) fechaColumns.push({ index: i, fecha });
  }

  console.log(`📅 Fechas detectadas en Excel: ${fechaColumns.length}`);
  fechaColumns.forEach(fc => console.log(`   ${fc.fecha}`));

  // 5. MIGRAR ASISTENCIA POR FECHA
  console.log('\n📝 Migrando asistencia histórica...\n');
  let totalEscritos = 0;
  const asistenciaPorUid = new Map();

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
      if (valor >= 1) {
        const uid = mapEntry.uid;
        await firestoreWrite(`asistencia/2026/${fecha}`, uid, {
          uid,
          presente: true,
          fecha,
          timestamp: new Date(fecha + 'T16:00:00-05:00'),
          tardanzaMinutos: 0,
          esTardanza: false
        }, true);

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
      await firestoreWrite('members', uid, {
        fotoThumb: fotoThumb || null,
        fotoDriveId: fotoDriveId || null
      }, true);
      fotosActualizadas++;
    }
  }
  console.log(`✅ Fotos actualizadas: ${fotosActualizadas}\n`);

  // 7. RECALCULAR asistenciasTotales
  console.log('🔢 Recalculando asistenciasTotales en members...\n');
  let totalesActualizados = 0;

  for (const [uid, fechasSet] of asistenciaPorUid) {
    const total = fechasSet.size;
    await firestoreWrite('members', uid, {
      asistenciasTotales: total,
      ultimaAsistencia: Array.from(fechasSet).sort().pop() || null
    }, true);
    totalesActualizados++;
    console.log(`   ${uid}: ${total} asistencias totales`);
  }

  // Members sin asistencia histórica → 0
  for (const doc of membersDocs) {
    const uid = doc.name.split('/').pop();
    if (!asistenciaPorUid.has(uid)) {
      await firestoreWrite('members', uid, { asistenciasTotales: 0, ultimaAsistencia: null }, true);
      totalesActualizados++;
    }
  }

  console.log(`\n✅ Totales recalculados: ${totalesActualizados} miembros\n`);

  // 8. VERIFICACIÓN
  console.log('🔍 Verificación (muestra):');
  const testNames = ['Bryan Ballon', 'Diego García', 'Gianfranco Camones', 'Maje Roncal', 'Paolo Alfaro', 'Ricardo Mantilla'];

  for (const nombre of testNames) {
    const mapEntry = memberMap.get(nombre);
    if (mapEntry) {
      const doc = await firestoreRead('members', mapEntry.uid);
      const data = parseFirestoreDoc(doc);
      const asistio = asistenciaPorUid.get(mapEntry.uid)?.size || 0;
      console.log(`   ${nombre}: asistenciasTotales=${data.asistenciasTotales}, calculado=${asistio}, foto=${data.fotoThumb ? 'OK' : 'NO'}`);
    }
  }

  console.log('\n🎉 ¡Reconciliación completa!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});