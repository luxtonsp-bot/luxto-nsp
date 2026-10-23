/**
 * Fix email de Luana en members/
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
  const luanaRef = db.collection('members').doc('GJnoAURzUNCpAFWw4eVE');
  const snap = await luanaRef.get();
  
  if (!snap.exists) {
    console.log('❌ Luana no encontrada');
    process.exit(1);
  }
  
  const data = snap.data();
  console.log('Datos actuales:', {
    nombre: data.nombre,
    email: data.email,
    uid: data.uid
  });
  
  // Placeholder email - ella pondrá el real al registrarse
  const placeholderEmail = 'luana.dominguez@luxto.org';
  
  await luanaRef.update({ email: placeholderEmail });
  console.log(`✅ Email actualizado a: ${placeholderEmail}`);
  
  // Verificar
  const verify = await luanaRef.get();
  console.log('Verificación:', verify.data().email);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });