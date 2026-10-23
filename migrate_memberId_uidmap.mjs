/**
 * MIGRACIÓN FASE 1: memberId permanente + uid_map
 * 
 * 1. Añade memberId (UUID v4) a todos los docs en members/
 * 2. Crea uid_map/{authUid} -> { memberId, email, createdAt } para usuarios con cuenta Auth
 * 3. Actualiza miembros_registro/ con memberId
 * 
 * Ejecutar UNA SOLA VEZ: node migrate_memberId_uidmap.mjs
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const saPath = join(__dirname, 'luxto-nsp-firebase-adminsdk-fbsvc-4adb8e2695.json');
admin.initializeApp({
  credential: admin.cert(saPath)
});

const db = getFirestore();

// UUID v4 simple
function generateMemberId() {
  return crypto.randomUUID();
}

async function main() {
  console.log('🔧 MIGRACIÓN FASE 1: memberId + uid_map\n');
  
  // 1. LEER todos los miembros
  const membersSnap = await db.collection('members').get();
  console.log(`📊 Total miembros: ${membersSnap.size}`);
  
  let updated = 0;
  let uidMapCreated = 0;
  let skipped = 0;
  
  // 2. Procesar cada miembro
  for (const doc of membersSnap.docs) {
    const data = doc.data();
    const currentId = doc.id;
    
    // Si ya tiene memberId (formato UUID), saltar
    if (data.memberId && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.memberId)) {
      skipped++;
      continue;
    }
    
    // Generar memberId permanente
    const memberId = generateMemberId();
    console.log(`  ${data.nombre || data.name || 'SIN NOMBRE'} (${currentId}) → memberId: ${memberId}`);
    
    // Si el ID actual NO es un UID de Auth (es un ID custom), necesitamos mover el doc
    const isAuthUid = /^[A-Za-z0-9]{28}$/.test(currentId); // Auth UIDs son 28 chars alfanuméricos
    
    if (!isAuthUid) {
      // ID custom (ej: GJnoAURzUNCpAFWw4eVE) → mover a members/{memberId}
      const batch = db.batch();
      
      // 1. Crear nuevo doc en members/{memberId}
      const newRef = db.collection('members').doc(memberId);
      batch.set(newRef, { ...data, memberId, memberIdAntiguo: currentId });
      
      // 2. Borrar doc viejo
      batch.delete(doc.ref);
      
      // 3. Actualizar miembros_registro (si existe)
      const registroRef = db.collection('miembros_registro').doc(currentId);
      const registroSnap = await registroRef.get();
      if (registroSnap.exists) {
        batch.update(registroRef, { memberId });
      }
      
      await batch.commit();
      updated++;
      
      // Si tiene uid/Auth, crear uid_map
      if (data.uid && data.email) {
        await db.collection('uid_map').doc(data.uid).set({
          memberId,
          email: data.email,
          createdAt: new Date().toISOString()
        });
        uidMapCreated++;
        console.log(`    ✅ uid_map creado para ${data.email}`);
      }
    } else {
      // El ID actual SÍ es un UID de Auth → actualizar in-place con memberId
      await doc.ref.update({ memberId });
      updated++;
      
      // Crear uid_map
      if (data.email) {
        await db.collection('uid_map').doc(currentId).set({
          memberId,
          email: data.email,
          createdAt: new Date().toISOString()
        });
        uidMapCreated++;
        console.log(`    ✅ uid_map creado para ${data.email}`);
      }
    }
  }
  
  console.log(`\n📈 Resumen:`);
  console.log(`   Miembros actualizados: ${updated}`);
  console.log(`   uid_map creados: ${uidMapCreated}`);
  console.log(`   Ya tenían memberId (saltados): ${skipped}`);
  
  // 4. Verificar uid_map
  const uidMapSnap = await db.collection('uid_map').get();
  console.log(`\n🗂️ Total uid_map: ${uidMapSnap.size}`);
  
  // 5. Verificar miembros_registro
  const registroSnap = await db.collection('miembros_registro').get();
  console.log(`📋 Total miembros_registro: ${registroSnap.size}`);
  
  console.log('\n✅ Migración completada.');
  console.log('\n⚠️  PRÓXIMOS PASOS:');
  console.log('   1. Desplegar firestore.rules actualizadas');
  console.log('   2. Verificar que registro.html funciona con nuevos memberId');
  console.log('   3. Migrar asistencia histórica a memberId (script separado)');
  
  process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });