/**
 * MIGRACIÓN LEGACY: Mover 45 docs de Auth UID paths a memberId UUID paths
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

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function isAuthUID(str) {
  return /^[A-Za-z0-9]{28}$/.test(str);
}

async function main() {
  console.log('🔄 MIGRACIÓN LEGACY: Auth UID paths -> memberId UUID paths\n');
  
  const membersSnap = await db.collection('members').get();
  console.log(`Total documentos: ${membersSnap.size}\n`);
  
  let migrated = 0;
  let errors = 0;
  
  for (const doc of membersSnap.docs) {
    const currentId = doc.id;
    const data = doc.data();
    const memberId = data.memberId;
    
    // Solo migrar si el doc ID actual es Auth UID (legacy)
    if (isAuthUID(currentId)) {
      if (!isValidUUID(memberId)) {
        console.log(`  ⚠️ ${currentId} (${data.nombre}) - memberId no es UUID válido: ${memberId}`);
        errors++;
        continue;
      }
      
      console.log(`🔄 Migrando: ${data.nombre || 'SIN NOMBRE'} (${currentId}) -> ${memberId}`);
      
      try {
        const batch = db.batch();
        const newRef = db.collection('members').doc(memberId);
        batch.set(newRef, { ...data, memberId, memberIdAntiguo: currentId });
        batch.delete(doc.ref);
        
        // Actualizar miembros_registro si existe
        const registroRef = db.collection('miembros_registro').doc(currentId);
        const registroSnap = await registroRef.get();
        if (registroSnap.exists) {
          batch.update(registroRef, { memberId });
        }
        
        await batch.commit();
        migrated++;
      } catch (e) {
        console.error(`  ❌ Error migrando ${currentId}:`, e.message);
        errors++;
      }
    }
  }
  
  console.log(`\n📊 Resumen:`);
  console.log(`   Migrados: ${migrated}`);
  console.log(`   Errores: ${errors}`);
  
  // Verificar resultado
  const verifySnap = await db.collection('members').get();
  let uuids = 0, authUids = 0;
  for (const doc of verifySnap.docs) {
    if (isValidUUID(doc.id)) uuids++;
    else if (/^[A-Za-z0-9]{28}$/.test(doc.id)) authUids++;
  }
  console.log(`\nVerificación final:`);
  console.log(`  Doc ID UUID: ${uuids}`);
  console.log(`  Doc ID Auth UID: ${authUids}`);
  
  process.exit(0);
}

main().catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });