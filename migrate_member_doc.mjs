/**
 * Migrar documento del miembro del path viejo al nuevo memberId
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

async function main() {
  console.log('🔧 Migrando documento del miembro...\n');
  
  const oldPath = 'ovR2LJVjtqZrfGGHhAHD1Qdw6qS2';
  const newPath = 'f51a859e-7901-49ae-80d9-0a385ee46dcd';
  
  // 1. Leer documento viejo
  const oldRef = db.collection('members').doc(oldPath);
  const oldSnap = await oldRef.get();
  
  if (!oldSnap.exists) {
    console.log('❌ Documento viejo no existe');
    process.exit(1);
  }
  
  const data = oldSnap.data();
  console.log('📄 Datos del documento viejo:', {
    nombre: data.nombre,
    email: data.email,
    uid: data.uid,
    rol: data.rol
  });
  
  // 2. Escribir en nuevo path
  const newRef = db.collection('members').doc(newPath);
  await newRef.set({ ...data, memberId: newPath });
  console.log('✅ Documento creado en nuevo path:', newPath);
  
  // 3. Verificar que se puede leer
  const verifySnap = await newRef.get();
  if (verifySnap.exists) {
    console.log('✅ Verificación exitosa - documento existe en nuevo path');
  }
  
  console.log('\n✅ Migración completada. Ahora el uid_map apunta a un documento que existe.');
  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });