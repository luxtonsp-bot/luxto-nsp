/**
 * MIGRACIÓN COMPLETA: Unificar TODOS los miembros a arquitectura memberId + uid_map
 * 
 * Para cada miembro en members/:
 * 1. Si no tiene memberId (UUID), generarlo
 * 2. Si el doc ID no es UUID (es Auth UID legacy), mover a members/{memberId}
 * 3. Crear/actualizar uid_map/{authUid} → { memberId, email }
 * 4. Si es staff, sincronizar RTDB admins en AMBOS paths
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

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

// UUID v4
function generateMemberId() {
  return crypto.randomUUID();
}

// Verificar si es UUID v4 válido
function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

// Verificar si es Auth UID (28 chars alfanuméricos)
function isAuthUID(str) {
  return /^[A-Za-z0-9]{28}$/.test(str);
}

async function main() {
  console.log('🚀 MIGRACIÓN COMPLETA: memberId + uid_map para TODOS\n');
  
  // 1. Obtener todos los usuarios de Auth
  console.log('📋 Obteniendo usuarios de Auth...');
  const listUsersResult = await auth.listUsers(1000);
  const authUsers = new Map();
  for (const user of listUsersResult.users) {
    authUsers.set(user.uid, user.email);
  }
  console.log(`   ${authUsers.size} usuarios en Auth\n`);
  
  // 2. Obtener todos los miembros de Firestore
  console.log('📋 Obteniendo miembros de Firestore...');
  const membersSnap = await db.collection('members').get();
  console.log(`   ${membersSnap.size} documentos en members/\n`);
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  // 3. Procesar cada miembro
  for (const doc of membersSnap.docs) {
    const currentId = doc.id;
    const data = doc.data();
    const email = data.email || '';
    const authUid = data.uid || '';
    const currentMemberId = data.memberId || '';
    
    // Determinar memberId correcto
    let memberId = currentMemberId;
    let needsMigration = false;
    
    if (!memberId || !isValidUUID(memberId)) {
      memberId = generateMemberId();
      needsMigration = true;
    }
    
    // Determinar authUid correcto
    let finalAuthUid = authUid;
    if (!finalAuthUid && email) {
      // Buscar en Auth por email
      for (const [uid, em] of authUsers) {
        if (em === email) {
          finalAuthUid = uid;
          break;
        }
      }
    }
    
    // Verificar si el doc ID actual es legacy (Auth UID) vs nuevo (memberId)
    const isLegacyDocId = isAuthUID(currentId);
    const isNewDocId = isValidUUID(currentId);
    
    if (isLegacyDocId && needsMigration) {
      // Mover documento: currentId (Auth UID) -> memberId (UUID)
      console.log(`🔄 Migrando: ${data.nombre || 'SIN NOMBRE'} (${currentId}) -> ${memberId}`);
      
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
      
      try {
        await batch.commit();
        migrated++;
      } catch (e) {
        console.error(`   ❌ Error migrando ${currentId}:`, e.message);
        errors++;
        continue;
      }
    } else if (isNewDocId && needsMigration) {
      // Actualizar in-place (ya está en memberId, solo falta el campo)
      await doc.ref.update({ memberId });
      migrated++;
    } else if (!needsMigration && isNewDocId) {
      skipped++;
    }
    
    // 4. Crear/actualizar uid_map
    if (finalAuthUid) {
      const uidMapRef = db.collection('uid_map').doc(finalAuthUid);
      const uidMapSnap = await uidMapRef.get();
      if (!uidMapSnap.exists || uidMapSnap.data().memberId !== memberId) {
        await uidMapRef.set({ memberId, email, createdAt: new Date().toISOString() });
      }
    }
    
    // 5. Sincronizar RTDB admins si es staff
    const rol = (data.rol || data.role || '').toLowerCase();
    const staffRoles = ['servidor', 'apoyo', 'coordinador'];
    if (staffRoles.includes(rol) && finalAuthUid) {
      const adminData = { email, rol, ts: Date.now() };
      await Promise.all([
        rtdb.ref(`admins/${finalAuthUid}`).set(adminData),
        rtdb.ref(`admins/${memberId}`).set(adminData)
      ]);
    }
  }
  
  console.log(`\n📊 Resumen:`);
  console.log(`   Migrados/actualizados: ${migrated}`);
  console.log(`   Ya correctos (saltados): ${skipped}`);
  console.log(`   Errores: ${errors}`);
  
  // 6. Verificar uid_map count
  const uidMapSnap = await db.collection('uid_map').get();
  console.log(`   Total uid_map: ${uidMapSnap.size}`);
  
  console.log('\n✅ Migración completa finalizada.');
  process.exit(0);
}

main().catch(e => { console.error('❌ Error fatal:', e); process.exit(1); });