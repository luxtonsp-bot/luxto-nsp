/**
 * Verificar uid_map y miembro para henry.alfaro1@unmsm.edu.pe
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const saPath = join(__dirname, 'luxto-nsp-firebase-adminsdk-fbsvc-4adb8e2695.json');
admin.initializeApp({
  credential: admin.cert(saPath)
});

const db = getFirestore();
const auth = getAuth(admin.app());

async function main() {
  console.log('🔍 Verificando henry.alfaro1@unmsm.edu.pe...\n');
  
  // 1. Buscar en Auth por email
  const auth = admin.auth();
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
  
  if (!uidMapSnap.exists()) {
    console.log('❌ No existe uid_map para este UID');
  } else {
    const data = uidMapSnap.data();
    console.log('✅ uid_map:', data);
  }
  
  // 3. Buscar miembro por email en members
  const membersSnap = await db.collection('members').where('email', '==', 'henry.alfaro1@unmsm.edu.pe').get();
  
  if (membersSnap.empty) {
    console.log('❌ No hay miembro con ese email en members');
  } else {
    membersSnap.forEach(doc => {
      const data = doc.data();
      console.log('✅ Miembro encontrado:', {
        memberId: doc.id,
        nombre: data.nombre,
        email: data.email,
        uid: data.uid,
        rol: data.rol
      });
    });
  }
  
  // 4. Verificar RTDB admins
  const rtdb = admin.database();
  
  for (const path of [authUid, 'f51a859e-7901-49ae-80d9-0a385ee46dcd']) {
    const snap = await rtdb.ref(`admins/${path}`).get();
    if (snap.exists()) {
      console.log(`✅ RTDB admins/${path}:`, snap.val());
    } else {
      console.log(`❌ RTDB admins/${path}: NO EXISTE`);
    }
  }
  
  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });