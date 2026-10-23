/**
 * Limpiar RTDB admins: quitar entrada incorrecta de Diego García
 * Usa Admin SDK v14+ API correcta
 */

import admin from 'firebase-admin';
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

async function main() {
  console.log('🧹 Limpiando RTDB admins...\n');
  
  // UID de Diego García (incorrecto en admins)
  const diegoUid = 'lIDVX8hTZchFZZCnvkbqzgiuITI3';
  const diegoMemberId = '2b5103db-828d-4d60-add4-8e0ef93297ba';
  
  // 1. Quitar de RTDB admins (legacy UID)
  await rtdb.ref(`admins/${diegoUid}`).remove();
  console.log(`✅ Eliminado admins/${diegoUid}`);
  
  // 2. Quitar de RTDB admins (memberId path)
  await rtdb.ref(`admins/${diegoMemberId}`).remove();
  console.log(`✅ Eliminado admins/${diegoMemberId}`);
  
  // 3. Verificar que TU entrada (ovR2LJVjtqZrfGGHhAHD1Qdw6qS2) sigue ahí
  const tuUid = 'ovR2LJVjtqZrfGGHhAHD1Qdw6qS2';
  const tuMemberId = 'f51a859e-7901-49ae-80d9-0a385ee46dcd';
  
  for (const path of [tuUid, tuMemberId]) {
    const snap = await rtdb.ref(`admins/${path}`).get();
    if (snap.exists()) {
      console.log(`✅ TU admins/${path} se mantiene:`, snap.val());
    } else {
      console.log(`⚠️ TU admins/${path} NO EXISTE - recreando...`);
      const adminData = { 
        email: 'henry.alfaro1@unmsm.edu.pe', 
        rol: 'coordinador', 
        ts: Date.now() 
      };
      await rtdb.ref(`admins/${path}`).set(adminData);
      console.log(`✅ Recreado admins/${path}`);
    }
  }
  
  console.log('\n✅ Limpieza completada. Prueba en incógnito.');
  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });