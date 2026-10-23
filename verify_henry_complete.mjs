/**
 * Verificar uid_map y miembro para henry.alfaro1@unmsm.edu.pe
 * Usa Admin SDK v14+ API correcta
 */

import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
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
const rtdb = getDatabase(app);
const auth = getAuth(app);

async function main() {
  console.log('🔍 Verificando henry.alfaro1@unmsm.edu.pe...\n');
  
  // 1. Buscar en Auth por email
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail('henry.alfaro1@unmsm.edu.pe');
    console.log('✅ Usuario en Auth:', {
      uid: userRecord.uid,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified
    });
  } catch (e) {
    console.log('❌ No encontrado en Auth:', e.message);
    process.exit(1);
  }
  
  const authUid = userRecord.uid;
  
  // 2. Verificar uid_map
  const uidMapRef = db.collection('uid_map').doc(authUid);
  const uidMapSnap = await uidMapRef.get();
  
  if (!uidMapSnap.exists) {
    console.log('❌ No existe uid_map para este UID');
  } else {
    const data = uidMapSnap.data();
    console.log('✅ uid_map:', data);
  }
  
  // 3. Buscar miembro por memberId en uid_map
  if (uidMapSnap.exists) {
    const memberId = uidMapSnap.data().memberId;
    const memberRef = db.collection('members').doc(memberId);
    const memberSnap = await memberRef.get();
    
    if (memberSnap.exists) {
      const data = memberSnap.data();
      console.log('✅ Miembro en members/{memberId}:', {
        memberId,
        nombre: data.nombre,
        email: data.email,
        uid: data.uid,
        rol: data.rol
      });
    } else {
      console.log('❌ Miembro NO existe en members/{memberId}');
    }
  }
  
  // 4. Verificar RTDB admins
  for (const path of [authUid]) {
    const snap = await rtdb.ref(`admins/${path}`).get();
    if (snap.exists) {
      console.log(`✅ RTDB admins/${path}:`, snap.val());
    } else {
      console.log(`❌ RTDB admins/${path}: NO EXISTE`);
    }
  }
  
  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });