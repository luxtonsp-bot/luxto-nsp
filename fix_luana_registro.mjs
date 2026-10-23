/**
 * Actualizar email de Luana en miembros_registro
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
  const ref = db.collection('miembros_registro').doc('GJnoAURzUNCpAFWw4eVE');
  const snap = await ref.get();
  
  if (!snap.exists) {
    console.log('❌ No encontrado en miembros_registro');
    process.exit(1);
  }
  
  await ref.update({ 
    email: 'luana.dominguez@luxto.org',
    tieneCuenta: false  // aún no tiene cuenta Auth
  });
  console.log('✅ miembros_registro actualizado');
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });