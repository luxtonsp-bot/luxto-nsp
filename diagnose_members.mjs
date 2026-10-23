/**
 * Diagnosticar estado actual de members/
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const saPath = join(__dirname, 'luxto-nsp-firebase-adminsdk-fbsvc-4adb8e2695.json');
const app = admin.initializeApp({
  credential: admin.cert(saPath),
  databaseURL: 'https://luxto-nsp-default-rtdb.firebaseio.com'
});

const db = getFirestore(app);

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function isAuthUID(str) {
  return /^[A-Za-z0-9]{28}$/.test(str);
}

async function main() {
  const membersSnap = await db.collection('members').get();
  console.log(`Total documentos: ${membersSnap.size}\n`);
  
  let uuids = 0;
  let authUids = 0;
  let otros = 0;
  let conMemberId = 0;
  let sinMemberId = 0;
  
  for (const doc of membersSnap.docs) {
    const id = doc.id;
    const data = doc.data();
    
    if (isValidUUID(id)) uuids++;
    else if (isAuthUID(id)) authUids++;
    else otros++;
    
    if (data.memberId && isValidUUID(data.memberId)) conMemberId++;
    else sinMemberId++;
    
    if (authUids > 0 || sinMemberId > 0) {
      console.log(`  ${id} | ${data.nombre || 'SIN NOMBRE'} | memberId: ${data.memberId || 'NINGUNO'} | rol: ${data.rol || 'NINGUNO'}`);
    }
  }
  
  console.log(`\nResumen:`);
  console.log(`  Doc ID es UUID: ${uuids}`);
  console.log(`  Doc ID es Auth UID: ${authUids}`);
  console.log(`  Doc ID otro: ${otros}`);
  console.log(`  Tiene memberId UUID: ${conMemberId}`);
  console.log(`  Sin memberId válido: ${sinMemberId}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });