/**
 * firebase-init.js — Configuración única de Firebase + helpers seguros
 * Cargar ANTES de cualquier otro módulo (admin, proyector, asamblea)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, serverTimestamp, writeBatch, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase, ref, onValue, set, update, remove, push, serverTimestamp as rtdbTS, get, onDisconnect, startAt, endAt, query as rtdbQuery, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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

// Escapar HTML para prevenir XSS
export function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Timestamp del servidor (Firestore)
export const fsTS = serverTimestamp;

// Timestamp del servidor (RTDB)
export const rtdbTS = rtdbTS;

// Offset de tiempo servidor RTDB (para timers precisos)
let serverTimeOffset = 0;
export async function syncServerTime() {
  try {
    const offsetRef = ref(rtdb, '.info/serverTimeOffset');
    const snap = await get(offsetRef);
    serverTimeOffset = snap.val() || 0;
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
  await runTransaction(r, (current) => updater(current || null));
}

// Batch Firestore genérico
export function fsBatch() {
  return writeBatch(fsdb);
}

// Verificar si usuario es staff (servidor/apoyo/coordinador)
export async function isStaff(uid) {
  try {
    const snap = await getDoc(doc(fsdb, 'members', uid));
    if (!snap.exists()) return false;
    const rol = snap.data().rol;
    return rol === 'servidor' || rol === 'apoyo' || rol === 'coordinador';
  } catch { return false; }
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
  resumen: 'asamblea/sesion/resumen',
  acumulada: 'asamblea/sesion/acumulada',
  rankingGlobal: (uid) => `rankingGlobal/${uid}`,
  admins: (uid) => `admins/${uid}`,
  hostUid: 'asamblea/sesion/hostUid',
};