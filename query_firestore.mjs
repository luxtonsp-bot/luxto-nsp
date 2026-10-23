import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize with service account
const saPath = join(__dirname, 'luxto-nsp-firebase-adminsdk-fbsvc-4adb8e2695.json');
admin.initializeApp({
  credential: admin.cert(saPath)
});

const db = getFirestore();

async function listCollections() {
  try {
    const collections = await db.listCollections();
    console.log('=== COLLECTIONS ===');
    for (const col of collections) {
      console.log(col.id);
    }
  } catch (e) {
    console.error('Error listing collections:', e.message);
  }
}

async function getCollectionData(colName, limit = 50) {
  try {
    const snapshot = await db.collection(colName).limit(limit).get();
    console.log(`\n=== ${colName} (${snapshot.size} docs) ===`);
    snapshot.forEach(doc => {
      console.log(`  ${doc.id}:`, JSON.stringify(doc.data()));
    });
  } catch (e) {
    console.error(`Error reading ${colName}:`, e.message);
  }
}

async function searchLuana() {
  try {
    // Search in members collection
    const membersSnap = await db.collection('members').get();
    console.log('\n=== SEARCH LUANA IN MEMBERS ===');
    membersSnap.forEach(doc => {
      const data = doc.data();
      const name = (data.nombre || data.name || '').toLowerCase();
      const email = (data.email || '').toLowerCase();
      if (name.includes('luana') || name.includes('doming') || email.includes('luana') || email.includes('doming')) {
        console.log(`  FOUND: ${doc.id} ->`, JSON.stringify(data));
      }
    });

    // Search in any collection that might have pre-registration
    const collections = ['miembros_registro', 'pre_registro', 'registro', 'inscripciones', 'asistencia'];
    for (const col of collections) {
      try {
        const snap = await db.collection(col).get();
        snap.forEach(doc => {
          const data = doc.data();
          const name = (data.nombre || data.name || '').toLowerCase();
          const email = (data.email || '').toLowerCase();
          if (name.includes('luana') || name.includes('doming') || email.includes('luana') || email.includes('doming')) {
            console.log(`  FOUND in ${col}: ${doc.id} ->`, JSON.stringify(data));
          }
        });
      } catch (e) {
        // collection might not exist
      }
    }
  } catch (e) {
    console.error('Error searching Luana:', e.message);
  }
}

async function main() {
  await listCollections();
  await getCollectionData('members', 100);
  await getCollectionData('asistencia', 20);
  await searchLuana();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });