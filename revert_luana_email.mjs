/**
 * Revertir email placeholder de Luana - ella registrará el suyo
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
  // 1. members/
  await db.collection('members').doc('GJnoAURzUNCpAFWw4eVE').update({ 
    email: '',
    uid: ''
  });
  console.log('✅ members/ limpiado (email="", uid="")');
  
  // 2. miembros_registro/
  await db.collection('miembros_registro').doc('GJnoAURzUNCpAFWw4eVE').update({ 
    email: '',
    tieneCuenta: false
  });
  console.log('✅ miembros_registro/ limpiado (email="", tieneCuenta=false)');
  
  console.log('\n✅ Luana lista para registrar SU email y contraseña en registro.html');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });