/**
 * Fix: Actualizar rol de Paolo Alfaro a coordinador en Firestore
 * UID Auth: lIDVX8hTZchFZZCnvkbqzgiuITI3
 * memberId: 2b5103db-828d-4d60-add4-8e0ef93297ba (Diego García)
 * Email real: paolosotil97@gmail.com
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

async function main() {
  console.log('🔧 Actualizando rol a coordinador...\n');
  
  // 1. Buscar el documento correcto
  const memberId = '2b5103db-828d-4d60-add4-8e0ef93297ba';
  const memberRef = db.collection('members').doc(memberId);
  const snap = await memberRef.get();
  
  if (!snap.exists()) {
    console.log('❌ No encontrado memberId:', memberId);
    process.exit(1);
  }
  
  const data = snap.data();
  console.log('Documento actual:', {
    nombre: data.nombre,
    email: data.email,
    uid: data.uid,
    rol: data.rol
  });
  
  // 2. Actualizar rol a coordinador
  await memberRef.update({ 
    rol: 'coordinador',
    fechaActualizacionRol: new Date().toISOString()
  });
  console.log('✅ Rol actualizado a coordinador en members/{memberId}');
  
  // 3. Actualizar RTDB admins en AMBOS paths
  const adminData = { 
    email: 'paolosotil97@gmail.com', 
    rol: 'coordinador', 
    ts: Date.now() 
  };
  
  const admin = require('firebase-admin');
  const rtdb = admin.database();
  
  // Path legacy (authUid)
  const authUid = 'lIDVX8hTZchFZZCnvkbqzgiuITI3';
  await rtdb.ref(`admins/${authUid}`).set(adminData);
  console.log(`✅ RTDB admins/${authUid} actualizado`);
  
  // Path nuevo (memberId)
  await rtdb.ref(`admins/${memberId}`).set(adminData);
  console.log(`✅ RTDB admins/${memberId} actualizado`);
  
  console.log('\n✅ Fix completado. Recarga dashboard.html');
  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });