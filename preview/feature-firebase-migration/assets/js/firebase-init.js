/**
 * firebase-init.js — Configuración única de Firebase + helpers seguros
 * Cargar ANTES de cualquier otro módulo (admin, proyector, asamblea)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp as fsServerTimestamp,
  writeBatch,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  remove,
  push,
  serverTimestamp as rtdbServerTS,
  get as rtdbGet,
  onDisconnect,
  runTransaction as rtdbRunTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLl5CLvdaSzZ_K6VXrlJzm4VvN9HQouJo",
  authDomain: "luxto-nsp.firebaseapp.com",
  projectId: "luxto-nsp",
  storageBucket: "luxto-nsp.firebasestorage.app",
  messagingSenderId: "3542836325",
  appId: "1:3542836325:web:cf65cd50edcc431500d28c",
  databaseURL: "https://luxto-nsp-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const fsdb = getFirestore(app);
export const rtdb = getDatabase(app);

/* ── Helpers seguros ───────────────────────────────────────── */

// Escapar HTML para prevenir XSS (incluye " y ')
export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'");
}

// Timestamp del servidor (Firestore)
export const fsTS = fsServerTimestamp;

// Timestamp del servidor (RTDB) — función que devuelve el sentinel
export function rtdbTS() { return rtdbServerTS(); }

// Offset de tiempo servidor RTDB (para timers precisos)
let serverTimeOffset = 0;
export async function syncServerTime() {
  try {
    await new Promise((resolve) => {
      const offsetRef = ref(rtdb, '.info/serverTimeOffset');
      const unsub = onValue(offsetRef, (snap) => {
        serverTimeOffset = snap.val() || 0;
        unsub();
        resolve();
      });
    });
  } catch (e) {
    console.warn('No se pudo sincronizar serverTimeOffset:', e);
    serverTimeOffset = 0;
  }
}
export function serverNow() {
  return Date.now() + serverTimeOffset;
}

// Transacción RTDB genérica
export async function rtdbTx(path, updater) {
  const r = ref(rtdb, path);
  await rtdbRunTransaction(r, (current) => updater(current || null));
}

// Batch Firestore genérico
export function fsBatch() {
  return writeBatch(fsdb);
}

// Verificar si usuario es staff (servidor/apoyo/coordinador)
export async function isStaff(uid) {
  try {
    console.log('isStaff: Consultando documento members/', uid);
    const snap = await getDoc(doc(fsdb, 'members', uid));
    console.log('isStaff: Documento existe:', snap.exists());
    if (!snap.exists()) {
      console.warn('isStaff: No existe documento de miembro para', uid);
      return false;
    }
    const data = snap.data();
    const rol = data.rol;
    console.log('isStaff: Rol del usuario:', rol, '| Data:', data);
    return rol === 'servidor' || rol === 'apoyo' || rol === 'coordinador';
  } catch (e) {
    console.error('isStaff error:', e);
    return false;
  }
}
export async function isCoordinator(uid) {
  try {
    const snap = await getDoc(doc(fsdb, 'members', uid));
    return snap.exists() && snap.data().rol === 'coordinador';
  } catch { return false; }
}

// Obtener rol del usuario actual
export async function getUserRole(uid) {
  try {
    const snap = await getDoc(doc(fsdb, 'members', uid));
    return snap.exists() ? snap.data().rol : null;
  } catch { return null; }
}

/* ── Rutas RTDB canónicas (asamblea) ───────────────────────── */
export const RTDB_PATHS = {
  sesion: 'asamblea/sesion',
  fase: 'asamblea/sesion/fase',
  cola: 'asamblea/sesion/cola',
  indice: 'asamblea/sesion/indice',
  claves: (id) => `asamblea/sesion/claves/${id}`,
  preguntaActual: 'asamblea/preguntaActual',
  respuestas: (qid) => `asamblea/respuestas/${qid}`,
  respuesta: (qid, uid) => `asamblea/respuestas/${qid}/${uid}`,
  conectados: (uid) => `asamblea/conectados/${uid}`,
  puntos: (uid) => `asamblea/sesion/puntos/${uid}`,
  puntosRoot: 'asamblea/sesion/puntos',
  resumen: 'asamblea/sesion/resumen',
  acumulada: 'asamblea/sesion/acumulada',
  rankingGlobal: (uid) => `rankingGlobal/${uid}`,
  rankingGlobalRoot: 'rankingGlobal',
  admins: (uid) => `admins/${uid}`,
  hostUid: 'asamblea/sesion/hostUid',
  sesionId: 'asamblea/sesion/sesionId',
  cerradas: (sid, qid) => `asamblea/sesion/cerradas/${sid}/${qid}`,
};

/* ── Rutas RTDB para KAHOOT Sessions (nuevo) ───────────────── */
export const KAHOOT_RTDB_PATHS = {
  sesionActiva: 'kahoot/sesionActiva',           // sessionId de la sesión activa actualmente
  sesionActivaData: 'kahoot/sesionActivaData',   // datos completos de la sesión activa (para proyector/celulares)
};

/* ── Re-export de SDK para consumidores ─────────────────────── */
export {
  // RTDB
  ref,
  onValue,
  set,
  update,
  remove,
  rtdbGet as get,
  push,
  onDisconnect,
  rtdbRunTransaction as runTransaction,
  rtdbServerTS,
  // Firestore
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  getDocs,
  fsServerTimestamp,
  writeBatch,
  // Auth
  onAuthStateChanged,
  signOut
};
