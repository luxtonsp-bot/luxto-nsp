/**
 * Sincronizar uid_map y RTDB admins para TODOS los miembros
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
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

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function isAuthUID(str) {
  return /^[A-Za-z0-9]{28}$/.test(str);
}

async function main() {
  console.log('🔄 Sincronizando uid_map y RTDB admins...\n');
  
  // 1. Obtener todos los usuarios de Auth
  const listUsersResult = await auth.listUsers(1000);
  const authUsers = new Map();
  for (const user of listUsersResult.users) {
    authUsers.set(user.uid, user.email);
  }
  console.log(`Auth users: ${authUsers.size}`);
  
  // 2. Obtener todos los miembros
  const membersSnap = await db.collection('members').get();
  console.log(`Miembros: ${membersSnap.size}`);
  
  let uidMapCreated = 0;
  let uidMapUpdated = 0;
  let adminsSynced = 0;
  
  const staffRoles = ['servidor', 'apoyo', 'coordinador'];
  
  for (const doc of membersSnap.docs) {
    const data = doc.data();
    const memberId = doc.id; // Ahora es UUID
    const email = data.email || '';
    const rol = (data.rol || data.role || '').toLowerCase();
    
    // Buscar authUid por email
    let authUid = '';
    for (const [uid, em] of authUsers) {
      if (em === email) {
        authUid = uid;
        break;
      }
    }
    
    // 1. uid_map
    if (authUid) {
      const uidMapRef = db.collection('uid_map').doc(authUid);
      const uidMapSnap = await uidMapRef.get();
      if (!uidMapSnap.exists) {
        await uidMapRef.set({ memberId, email, createdAt: new Date().toISOString() });
        uidMapCreated++;
      } else if (uidMapSnap.data().memberId !== memberId) {
        await uidMapRef.update({ memberId });
        uidMapUpdated++;
      }
    }
    
    // 2. RTDB admins (si es staff)
    if (staffRoles.includes(rol) && authUid) {
      const adminData = { email, rol, ts: Date.now() };
      await Promise.all([
        rtdb.ref(`admins/${authUid}`).set(adminData),
        rtdb.ref(`admins/${memberId}`).set(adminData)
      ]);
      adminsSynced++;
    }
  }
  
  console.log(`\n📊 Resumen:`);
  console.log(`   uid_map creados: ${uidMapCreated}`);
  console.log(`   uid_map actualizados: ${uidMapUpdated}`);
  console.log(`   RTDB admins sincronizados: ${adminsSynced}`);
  
  // Verificar uid_map total
  const uidMapSnap = await db.collection('uid_map').get();
  console.log(`\nTotal uid_map: ${uidMapSnap.size}`);
  
  // Verificar RTDB admins
  const adminsSnap = await rtdb.ref('admins').get();
  const adminsCount = adminsSnap.exists ? Object.keys(adminsSnap.val()).length : 0;
  console.log(`Total RTDB admins: ${adminsCount}`);
  
  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });