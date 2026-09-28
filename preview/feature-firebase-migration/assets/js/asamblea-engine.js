/**
 * asamblea-engine.js — Máquina de estados única para el modo asamblea
 * Lógica compartida: admin, proyector, celulares
 * NO toca UI directamente; expone funciones y listeners que la UI consume.
 */

import { rtdb, rtdbTS, serverNow, rtdbTx, RTDB_PATHS, fsdb, fsTS, isStaff, isCoordinator, auth, ref, onValue, set, update, remove, get, onDisconnect, doc, collection, query, orderBy, getDocs, setDoc, runTransaction } from './firebase-init.js';

const PHASES = ['apagada', 'lobby', 'countdown', 'pregunta', 'revelada', 'ranking', 'podio'];

/* ── Estado local (caché para listeners UI) ───────────────── */
let localState = {
  fase: 'apagada',
  cola: [],
  indice: 0,
  preguntaActual: null,
  conectados: {},
  respuestas: {},
  puntos: {},
  resumen: [],
  acumulada: false,
  hostUid: null
};

const listeners = new Map(); // path -> { off, callbacks[] }

/* ── Helpers internos ─────────────────────────────────────── */
function notify(path) {
  const cbs = listeners.get(path)?.callbacks || [];
  cbs.forEach(cb => cb(localState));
}

async function writePhase(fase) {
  if (!PHASES.includes(fase)) throw new Error(`Fase inválida: ${fase}`);
  await set(ref(rtdb, RTDB_PATHS.fase), fase);
  localState.fase = fase;
  notify('fase');
}

/* ── API PÚBLICA ──────────────────────────────────────────── */

/** Inicializa listeners de la sesión (llamar una vez al cargar app) */
export async function initAsambleaEngine() {
  await syncServerTime(); // from firebase-init

  // Listener fase
  onValue(ref(rtdb, RTDB_PATHS.fase), snap => {
    localState.fase = snap.val() || 'apagada';
    notify('fase');
  });

  // Listener cola
  onValue(ref(rtdb, RTDB_PATHS.cola), snap => {
    localState.cola = snap.val() || [];
    notify('cola');
  });

  // Listener índice
  onValue(ref(rtdb, RTDB_PATHS.indice), snap => {
    localState.indice = snap.val() || 0;
    notify('indice');
  });

  // Listener preguntaActual
  onValue(ref(rtdb, RTDB_PATHS.preguntaActual), snap => {
    localState.preguntaActual = snap.val();
    notify('preguntaActual');
  });

  // Listener conectados
  onValue(ref(rtdb, 'asamblea/conectados'), snap => {
    localState.conectados = snap.val() || {};
    notify('conectados');
  });

  // Listener respuestas (para fase pregunta/revelada)
  onValue(ref(rtdb, 'asamblea/respuestas'), snap => {
    localState.respuestas = snap.val() || {};
    notify('respuestas');
  });

  // Listener puntos/resumen
  onValue(ref(rtdb, RTDB_PATHS.puntos.replace('${uid}', '')), snap => {
    localState.puntos = snap.val() || {};
    notify('puntos');
  });
  onValue(ref(rtdb, RTDB_PATHS.resumen), snap => {
    localState.resumen = snap.val() || [];
    notify('resumen');
  });
  onValue(ref(rtdb, RTDB_PATHS.acumulada), snap => {
    localState.acumulada = snap.val() || false;
    notify('acumulada');
  });

  // Listener hostUid (elección de líder único)
  onValue(ref(rtdb, RTDB_PATHS.hostUid), snap => {
    localState.hostUid = snap.val();
    notify('hostUid');
  });
}

/** Obtener estado actual (reactivo via listeners) */
export function getState() { return { ...localState }; }

/** Suscribirse a cambios de un path */
export function on(path, callback) {
  if (!listeners.has(path)) listeners.set(path, { off: null, callbacks: [] });
  listeners.get(path).callbacks.push(callback);
  return () => {
    const arr = listeners.get(path)?.callbacks || [];
    const i = arr.indexOf(callback);
    if (i >= 0) arr.splice(i, 1);
  };
}

/* ── ACCIONES SOLO STAFF (admin/proyector) ────────────────── */

/** Verificar permiso staff (llamar antes de cada acción) */
async function assertStaff() {
  const user = auth.currentUser;
  if (!user || !(await isStaff(user.uid))) throw new Error('Solo staff');
}

/** Registrar este cliente como host (solo uno gana) */
export async function claimHost() {
  await assertStaff();
  const uid = auth.currentUser.uid;
  const r = ref(rtdb, RTDB_PATHS.hostUid);
  const snap = await get(r);
  if (snap.exists() && snap.val() !== uid) return false; // ya hay otro host
  await set(r, uid);
  return true;
}

/** Liberar host */
export async function releaseHost() {
  await assertStaff();
  const uid = auth.currentUser.uid;
  const r = ref(rtdb, RTDB_PATHS.hostUid);
  const snap = await get(r);
  if (snap.val() === uid) await remove(r);
}

/** Verificar si soy el host actual */
export function isHost() {
  return localState.hostUid === auth.currentUser?.uid;
}

/** Crear/actualizar banco de preguntas (Firestore /preguntas) */
export async function savePregunta(data) {
  await assertStaff();
  const { texto, opciones, correcta, duracion, id } = data;
  if (!texto || !opciones?.length) throw new Error('Texto y opciones requeridos');
  const docRef = id ? doc(fsdb, 'preguntas', id) : doc(collection(fsdb, 'preguntas'));
  await setDoc(docRef, { texto, opciones, correcta: correcta ?? 0, duracion: duracion ?? 20, updatedAt: fsTS });
  return docRef.id;
}
export async function deletePregunta(id) {
  await assertStaff();
  await remove(doc(fsdb, 'preguntas', id));
}
export async function listPreguntas() {
  const snap = await getDocs(query(collection(fsdb, 'preguntas'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Cargar preguntas seleccionadas a la sesión (cola) */
export async function setSesionCola(preguntaIds) {
  await assertStaff();
  // Leer preguntas de Firestore
  const preguntas = [];
  for (const id of preguntaIds) {
    const snap = await getDoc(doc(fsdb, 'preguntas', id));
    if (!snap.exists()) throw new Error(`Pregunta ${id} no existe`);
    const p = snap.data();
    preguntas.push({ id: snap.id, texto: p.texto, opciones: p.opciones, duracion: p.duracion });
  }
  // Guardar cola en RTDB (sin correcta)
  await set(ref(rtdb, RTDB_PATHS.cola), preguntas);
  await set(ref(rtdb, RTDB_PATHS.indice), 0);
  await writePhase('lobby');
  // Limpiar respuestas y conectados previos
  await remove(ref(rtdb, 'asamblea/respuestas'));
  await remove(ref(rtdb, 'asamblea/conectados'));
  await set(ref(rtdb, RTDB_PATHS.acumulada), false);
}

/** Iniciar sesión: lobby -> countdown -> primera pregunta */
export async function startSesion() {
  await assertStaff();
  if (localState.fase !== 'lobby') throw new Error('Debe estar en lobby');
  await writePhase('countdown');
  // countdown de 5s en proyector, luego nextPregunta()
}

/** Avanzar a siguiente pregunta (o iniciar primera) */
export async function nextPregunta() {
  await assertStaff();
  const idx = localState.indice;
  const cola = localState.cola;
  if (idx >= cola.length) { await writePhase('podio'); return; }

  const p = cola[idx];
  const abreEn = serverNow();
  const cierraEn = abreEn + (p.duracion || 20) * 1000;

  // Guardar clave (correcta) solo para staff
  await set(ref(rtdb, RTDB_PATHS.claves(p.id)), { correcta: p.correcta ?? 0 });

  // Pregunta actual SIN correcta
  await set(ref(rtdb, RTDB_PATHS.preguntaActual), {
    id: p.id,
    numero: idx + 1,
    texto: p.texto,
    opciones: p.opciones,
    duracion: p.duracion,
    abreEn,
    cierraEn
  });

  // Avanzar índice
  await set(ref(rtdb, RTDB_PATHS.indice), idx + 1);

  await writePhase('pregunta');
}

/** Cerrar pregunta actual (calcular puntos, guardar resumen) — idempotente */
export async function cerrarPregunta() {
  await assertStaff();
  if (localState.fase !== 'pregunta') throw new Error('No hay pregunta activa');

  const q = localState.preguntaActual;
  const respuestas = localState.respuestas[q.id] || {};
  const claveSnap = await get(ref(rtdb, RTDB_PATHS.claves(q.id)));
  const correcta = claveSnap.val()?.correcta ?? 0;
  const abreEn = q.abreEn;

  // Calcular puntos por participante
  const puntos = {};
  const resumen = [];
  Object.entries(respuestas).forEach(([uid, r]) => {
    const esCorrecta = r.idx === correcta;
    const rapidez = Math.max(0, 1 - (r.ts - abreEn) / (q.duracion * 1000)); // 0..1
    const pts = esCorrecta ? Math.round(1000 + 500 * rapidez) : 0;
    puntos[uid] = (puntos[uid] || 0) + pts;
    resumen.push({ uid, nombre: r.nombre, esCorrecta, pts, ts: r.ts });
  });

  // Guardar puntos acumulados de la sesión
  await set(ref(rtdb, RTDB_PATHS.puntos.replace('${uid}', '')), puntos);
  // Resumen para ranking/podio
  resumen.sort((a, b) => b.pts - a.pts);
  await set(ref(rtdb, RTDB_PATHS.resumen), resumen.slice(0, 20));

  // Revelar correcta en preguntaActual
  await update(ref(rtdb, RTDB_PATHS.preguntaActual), { correcta, estado: 'revelada' });
  await writePhase('revelada');
}

/** Mostrar ranking parcial */
export async function mostrarRanking() {
  await assertStaff();
  if (!['revelada', 'ranking'].includes(localState.fase)) throw new Error('Fase inválida');
  await writePhase('ranking');
}

/** Finalizar sesión: acumular rankingGlobal + snapshot Firestore + podio — idempotente */
export async function finalizarSesion() {
  await assertStaff();
  if (localState.acumulada) return; // idempotente

  // 1. Acumular en rankingGlobal con transacción atómica por uid
  const puntosSesion = localState.puntos;
  for (const [uid, pts] of Object.entries(puntosSesion)) {
    await runTransaction(ref(rtdb, RTDB_PATHS.rankingGlobal(uid)), (current) => {
      const prev = (current || { pts: 0 });
      return { ...prev, pts: (prev.pts || 0) + pts, ultimaAsamblea: serverNow() };
    });
  }

  // 2. Snapshot Firestore
  const hoy = new Date();
  const hoyStr = hoy.toISOString().split('T')[0];
  await setDoc(doc(fsdb, 'asambleas_kahoot', hoyStr), {
    fecha: hoyStr,
    puntosSesion,
    resumen: localState.resumen,
    totalPreguntas: localState.cola.length,
    creadoEn: fsTS
  });
  await setDoc(doc(fsdb, 'historico', String(hoy.getFullYear()), 'asambleas_kahoot', hoyStr), {
    fecha: hoyStr,
    puntosSesion,
    resumen: localState.resumen,
    totalPreguntas: localState.cola.length,
    creadoEn: fsTS
  });

  // 3. Marcar acumulada y fase podio
  await set(ref(rtdb, RTDB_PATHS.acumulada), true);
  await writePhase('podio');
}

/** Apagar asamblea (reset completo) */
export async function apagarAsamblea() {
  await assertStaff();
  await remove(ref(rtdb, 'asamblea'));
  await writePhase('apagada');
}

/* ── ACCIONES PARTICIPANTE (celular) ─────────────────────── */

/** Registrar conexión (lobby) */
export async function conectar(uid, nombre) {
  await set(ref(rtdb, RTDB_PATHS.conectados(uid)), { nombre, ts: rtdbTS });
  onDisconnect(ref(rtdb, RTDB_PATHS.conectados(uid))).remove();
}

/** Responder: write-once en respuestas/{qid}/{uid} */
export async function responder(qid, uid, idx) {
  const r = ref(rtdb, RTDB_PATHS.respuesta(qid, uid));
  const snap = await get(r);
  if (snap.exists()) throw new Error('Ya respondiste');
  if (localState.fase !== 'pregunta') throw new Error('Pregunta cerrada');
  await set(r, { idx, ts: serverNow(), nombre: (await getUserName(uid)) });
}
async function getUserName(uid) {
  const snap = await getDoc(doc(fsdb, 'members', uid));
  return snap.exists() ? snap.data().nombre : uid;
}

/* ── Limpieza ─────────────────────────────────────────────── */
export function destroy() {
  listeners.forEach(({ off }) => off?.());
  listeners.clear();
}