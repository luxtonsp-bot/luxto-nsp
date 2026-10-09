/**
 * asamblea-engine.js — Máquina de estados única para el modo asamblea
 * Lógica compartida: admin, proyector, celulares
 * NO toca UI directamente; expone funciones y listeners que la UI consume.
 */

import {
  rtdb,
  rtdbTS,
  serverNow,
  rtdbTx,
  syncServerTime,
  RTDB_PATHS,
  KAHOOT_RTDB_PATHS,
  fsdb,
  fsTS,
  isStaff,
  isCoordinator,
  auth,
  ref,
  onValue,
  set,
  update,
  remove,
  get,
  onDisconnect,
  doc,
  collection,
  query,
  orderBy,
  getDocs,
  setDoc,
  updateDoc,
  runTransaction,
  deleteDoc,
  rtdbServerTS,
  writeBatch
} from './firebase-init.js';

const PHASES = ['apagada', 'lobby', 'countdown', 'pregunta', 'revelada', 'ranking', 'podio'];

// Guardar countdownStart para checkLateHostJoin
let countdownStart = 0;

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
  hostUid: null,
  sesionId: null
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
  await syncServerTime();

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

  // Listener puntos (root completo)
  onValue(ref(rtdb, RTDB_PATHS.puntosRoot), snap => {
    localState.puntos = snap.val() || {};
    notify('puntos');
  });
  // Listener resumen
  onValue(ref(rtdb, RTDB_PATHS.resumen), snap => {
    localState.resumen = snap.val() || [];
    notify('resumen');
  });
  // Listener acumulada
  onValue(ref(rtdb, RTDB_PATHS.acumulada), snap => {
    localState.acumulada = snap.val() || false;
    notify('acumulada');
  });

  // Listener hostUid (elección de líder único)
  onValue(ref(rtdb, RTDB_PATHS.hostUid), snap => {
    localState.hostUid = snap.val();
    notify('hostUid');
  });

  // Listener sesionId
  onValue(ref(rtdb, RTDB_PATHS.sesionId), snap => {
    localState.sesionId = snap.val();
    notify('sesionId');
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
  if (!user) throw new Error('No autenticado');
  if (!(await isStaff(user.uid))) throw new Error('Solo staff - usuario sin permisos');
}

/** Verificar permiso coordinador */
async function assertCoordinator() {
  const user = auth.currentUser;
  if (!user || !(await isCoordinator(user.uid))) throw new Error('Solo coordinador');
}

/** Registrar este cliente como host (solo uno gana) — transacción atómica + onDisconnect */
export async function claimHost() {
  await assertStaff();
  const uid = auth.currentUser.uid;
  const hostRef = ref(rtdb, RTDB_PATHS.hostUid);

  // Transacción atómica: solo escribe si está vacío o es el mismo uid
  const result = await runTransaction(hostRef, (current) => {
    if (current === null || current === uid) return uid;
    return current; // aborta, devuelve valor actual
  });

  const won = result.committed && result.snapshot.val() === uid;
  if (won) {
    // Auto-liberar si cierra pestaña / pierde conexión
    onDisconnect(hostRef).remove();
  }
  return won;
}

/** Liberar host (solo si soy yo) */
export async function releaseHost() {
  await assertStaff();
  const uid = auth.currentUser.uid;
  const hostRef = ref(rtdb, RTDB_PATHS.hostUid);
  await runTransaction(hostRef, (current) => {
    if (current === uid) return null; // libera
    return current; // no toca
  });
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
  await setDoc(docRef, { texto, opciones, correcta: correcta ?? 0, duracion: duracion ?? 20, createdAt: fsTS(), updatedAt: fsTS() });
  return docRef.id;
}
export async function deletePregunta(id) {
  await assertStaff();
  await deleteDoc(doc(fsdb, 'preguntas', id));
}
export async function listPreguntas() {
  try {
    // Intentar primero con orderBy updatedAt
    const snap = await getDocs(query(collection(fsdb, 'preguntas'), orderBy('updatedAt', 'desc')));
    const preguntas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (preguntas.length > 0) return preguntas;
  } catch (e) {
    console.warn('listPreguntas: orderBy updatedAt falló, probando sin orderBy:', e.message);
  }
  // Fallback: sin orderBy (para documentos antiguos sin updatedAt)
  const snap = await getDocs(collection(fsdb, 'preguntas'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
}

/** Cargar preguntas seleccionadas a la sesión (cola) — sin correcta */
export async function setSesionCola(preguntaIds) {
  await assertStaff();
  const preguntas = [];
  for (const id of preguntaIds) {
    const snap = await getDoc(doc(fsdb, 'preguntas', id));
    if (!snap.exists()) throw new Error(`Pregunta ${id} no existe`);
    const p = snap.data();
    preguntas.push({ id: snap.id, texto: p.texto, opciones: p.opciones, duracion: p.duracion });
  }
  // Generar sesionId único para esta sesión (timestamp + random)
  const sesionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Todo en orden: limpiar → acumulada=false → cola → fase lobby
  await remove(ref(rtdb, 'asamblea/respuestas'));
  await remove(ref(rtdb, 'asamblea/conectados'));
  await remove(ref(rtdb, 'asamblea/sesion/cerradas')); // limpiar idempotency keys de sesiones previas
  await set(ref(rtdb, RTDB_PATHS.acumulada), false);
  await set(ref(rtdb, RTDB_PATHS.sesionId), sesionId);
  await set(ref(rtdb, RTDB_PATHS.cola), preguntas);
  await set(ref(rtdb, RTDB_PATHS.indice), 0);
  await writePhase('lobby');
}

/** Iniciar sesión: lobby -> countdown -> primera pregunta */
export async function startSesion() {
  await assertStaff();
  if (localState.fase !== 'lobby') throw new Error('Debe estar en lobby');
  await writePhase('countdown');

  // Guardar momento de inicio del countdown para checkLateHostJoin
  countdownStart = serverNow();

  // El host agenda countdown → pregunta (5s) y cierre automático
  if (isHost()) scheduleHostActions();

  // Late host join: si alguien se une como host y ya pasó countdown, lanzar pregunta
  // Esto se maneja en el listener de fase en admin.js/proyector.js
}

/** Agenda acciones del host: countdown→pregunta y cierre a cierraEn */
function scheduleHostActions() {
  const idx = localState.indice;
  const cola = localState.cola;
  if (idx >= cola.length) return;

  const p = cola[idx];
  const abreEn = serverNow();
  const cierraEn = abreEn + (p.duracion || 20) * 1000;

  // countdown → pregunta (5s)
  const toPregunta = Math.max(0, 5000);
  setTimeout(async () => {
    if (isHost() && (await getState()).fase === 'countdown') {
      await nextPregunta();
    }
  }, toPregunta);

  // Cierre automático en cierraEn
  const toClose = Math.max(0, cierraEn - serverNow());
  setTimeout(async () => {
    if (isHost() && (await getState()).fase === 'pregunta') {
      await cerrarPregunta();
    }
  }, toClose + 5000); // suma los 5s del countdown
}

/** Verificar y actuar si el host se une tarde (fase countdown/pregunta ya avanzada) */
export async function checkLateHostJoin() {
  if (!isHost()) return;
  const state = getState();
  if (state.fase === 'countdown') {
    // Verificar si ya pasó el tiempo de countdown (5s desde countdownStart)
    const idx = state.indice;
    const cola = state.cola;
    if (idx < cola.length) {
      const now = serverNow();
      if (now >= countdownStart + 5000) {
        // Ya debería haber pasado a pregunta, forzar nextPregunta
        await nextPregunta();
      }
    }
  } else if (state.fase === 'pregunta') {
    // Verificar si ya pasó cierraEn
    const p = state.preguntaActual;
    if (p && p.cierraEn && serverNow() >= p.cierraEn) {
      await cerrarPregunta();
    }
  }
}

/** Avanzar a siguiente pregunta (o iniciar primera) — lee correcta de Firestore */
export async function nextPregunta() {
  await assertStaff();
  // Validar fase: solo desde lobby, countdown, revelada, ranking
  if (!['lobby', 'countdown', 'revelada', 'ranking'].includes(localState.fase)) {
    throw new Error(`No se puede lanzar pregunta desde fase: ${localState.fase}`);
  }

  // Transacción atómica sobre índice para evitar double-click
  const idxRef = ref(rtdb, RTDB_PATHS.indice);
  const txResult = await runTransaction(idxRef, (current) => {
    const idx = current || 0;
    if (idx >= (localState.cola?.length || 0)) return; // ya no hay más
    return idx + 1;
  });
  if (!txResult.committed) return; // otro lo hizo o falló

  const idx = txResult.snapshot.val() - 1;
  const cola = localState.cola;
  if (idx >= cola.length) { await writePhase('podio'); return; }

  const p = cola[idx];
  // Leer correcta de Firestore al lanzar
  const fsSnap = await getDoc(doc(fsdb, 'preguntas', p.id));
  const correcta = fsSnap.exists() ? (fsSnap.data().correcta ?? 0) : 0;

  const abreEn = serverNow();
  const cierraEn = abreEn + (p.duracion || 20) * 1000;

  // Guardar clave (correcta) solo para staff
  await set(ref(rtdb, RTDB_PATHS.claves(p.id)), { correcta });

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

  await writePhase('pregunta');

  // El host agenda cierre automático en cierraEn
  if (isHost()) {
    const delay = Math.max(0, cierraEn - serverNow());
    setTimeout(async () => {
      if (isHost() && (await getState()).fase === 'pregunta') {
        await cerrarPregunta();
      }
    }, delay);
  }
}

/** Cerrar pregunta actual (calcular puntos, guardar resumen) — IDEMPOTENTE */
export async function cerrarPregunta() {
  await assertStaff();
  if (localState.fase !== 'pregunta') throw new Error('No hay pregunta activa');
  if (!localState.sesionId) throw new Error('sesionId no disponible');

  const q = localState.preguntaActual;
  const qid = q.id;

  // Marca idempotente: transacción en sesion/cerradas/{sesionId}/{qid}
  const cerradaRef = ref(rtdb, RTDB_PATHS.cerradas(localState.sesionId, qid));
  const txResult = await runTransaction(cerradaRef, (current) => {
    if (current === true) return; // ya cerrada
    return true;
  });
  if (!txResult.committed) return; // otro lo hizo

  const respuestas = localState.respuestas[qid] || {};
  const claveSnap = await get(ref(rtdb, RTDB_PATHS.claves(qid)));
  const correcta = claveSnap.val()?.correcta ?? 0;
  const abreEn = q.abreEn;

  // Calcular puntos por participante de ESTA pregunta
  const deltaPuntos = {};
  const resumenNuevo = [];
  Object.entries(respuestas).forEach(([uid, r]) => {
    const esCorrecta = r.idx === correcta;
    const rapidez = Math.max(0, 1 - (r.ts - abreEn) / (q.duracion * 1000));
    const pts = esCorrecta ? Math.round(1000 + 500 * rapidez) : 0;
    deltaPuntos[uid] = pts;
    resumenNuevo.push({ uid, nombre: r.nombre, esCorrecta, pts, ts: r.ts });
  });

  // SUMA atómica a puntos de sesión (transacción por uid) — guarda {pts, nombre}
  for (const [uid, delta] of Object.entries(deltaPuntos)) {
    if (delta <= 0) continue;
    await runTransaction(ref(rtdb, RTDB_PATHS.puntos(uid)), (current) => {
      const prev = current || { pts: 0, nombre: resumenNuevo.find(r => r.uid === uid)?.nombre || uid };
      return { pts: prev.pts + delta, nombre: prev.nombre };
    });
  }

  // Resumen acumulado = top de puntos totales de sesión
  const puntosSnap = await get(ref(rtdb, RTDB_PATHS.puntosRoot));
  const puntosTotales = puntosSnap.val() || {};
  const ranking = Object.entries(puntosTotales)
    .map(([uid, data]) => ({ uid, pts: data.pts, nombre: data.nombre }))
    .sort((a, b) => b.pts - a.pts);
  await set(ref(rtdb, RTDB_PATHS.resumen), ranking.slice(0, 20));

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

/** Finalizar sesión: acumular rankingGlobal + snapshot Firestore + podio — IDEMPOTENTE REAL */
export async function finalizarSesion() {
  await assertCoordinator(); // solo coordinador finaliza y escribe historico

  // Transacción atómica sobre acumulada: revisa committed
  const txResult = await runTransaction(ref(rtdb, RTDB_PATHS.acumulada), (current) => {
    if (current === true) return; // ya hecho
    return true;
  });
  if (!txResult.committed) return; // otro lo hizo o falló

  // 1. Acumular en rankingGlobal con transacción atómica por uid (email-sanitized key)
  const puntosSesion = localState.puntos;
  const membersSnap = await getDocs(collection(fsdb, 'members'));
  const memberByUid = {};
  membersSnap.forEach(d => { memberByUid[d.id] = d.data(); });

  for (const [uid, data] of Object.entries(puntosSesion)) {
    const pts = data?.pts;
    if (!pts) continue;
    const m = memberByUid[uid];
    const key = m?.email ? m.email.replace(/[.#$[\]]/g, '_') : uid;
    await runTransaction(ref(rtdb, RTDB_PATHS.rankingGlobal(key)), (current) => {
      const prev = current || { pts: 0, nombre: m?.nombre || 'Anónimo', email: m?.email || '', fotoUrl: m?.fotoUrl || '' };
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
    creadoEn: fsTS()
  });
  await setDoc(doc(fsdb, 'historico', String(hoy.getFullYear()), 'asambleas_kahoot', hoyStr), {
    fecha: hoyStr,
    puntosSesion,
    resumen: localState.resumen,
    totalPreguntas: localState.cola.length,
    creadoEn: fsTS()
  });

  // 3. Fase podio
  await writePhase('podio');
}

/** Apagar asamblea (reset suave — no borra nodo padre para no romper reglas viejas) */
export async function apagarAsamblea() {
  await assertStaff();
  await remove(ref(rtdb, 'asamblea/sesion'));
  await remove(ref(rtdb, 'asamblea/preguntaActual'));
  await remove(ref(rtdb, 'asamblea/respuestas'));
  await remove(ref(rtdb, 'asamblea/conectados'));
  await remove(ref(rtdb, KAHOOT_RTDB_PATHS.sesionActiva));
  await remove(ref(rtdb, KAHOOT_RTDB_PATHS.meta));
  await writePhase('apagada');
}

/* ── KAHOOT SESSIONS (Firestore) ────────────────────────────── */

/** Crear nueva sesión KAHOOT en borrador */
export async function createKahootSession({ titulo, fechaAsamblea, preguntaIds = [] }) {
  await assertStaff();
  if (!titulo?.trim()) throw new Error('Título requerido');
  if (!fechaAsamblea) throw new Error('Fecha de asamblea requerida');

  const preguntas = [];
  for (let i = 0; i < preguntaIds.length; i++) {
    const id = preguntaIds[i];
    const snap = await getDoc(doc(fsdb, 'preguntas', id));
    if (!snap.exists()) throw new Error(`Pregunta ${id} no existe`);
    const p = snap.data();
    preguntas.push({
      bancoId: id,
      texto: p.texto,
      opciones: p.opciones,
      correcta: p.correcta ?? 0,
      duracion: p.duracion ?? 20,
      orden: i + 1
    });
  }

  const anio = new Date(fechaAsamblea).getFullYear();
  const sessionRef = doc(collection(fsdb, 'kahoot_sessions'));
  await setDoc(sessionRef, {
    titulo: titulo.trim(),
    fechaAsamblea,
    anio,
    creadoPor: auth.currentUser.uid,
    creadoEn: fsTS(),
    actualizadoEn: fsTS(),
    estado: 'borrador',
    preguntas,
    resultados: null
  });
  return sessionRef.id;
}

/** Listar sesiones KAHOOT con filtros opcionales */
export async function listKahootSessions({ fechaAsamblea, estado } = {}) {
  await assertStaff();
  try {
    // Intentar con orderBy creadoEn (requiere índice compuesto)
    let q = query(collection(fsdb, 'kahoot_sessions'), orderBy('creadoEn', 'desc'));
    const snap = await getDocs(q);
    let sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sessions.length > 0) {
      if (fechaAsamblea) sessions = sessions.filter(s => s.fechaAsamblea === fechaAsamblea);
      if (estado) sessions = sessions.filter(s => s.estado === estado);
      return sessions;
    }
  } catch (e) {
    console.warn('listKahootSessions: orderBy creadoEn falló, probando sin orderBy:', e.message);
  }
  // Fallback: sin orderBy (para documentos sin creadoEn o índice faltante)
  const snap = await getDocs(collection(fsdb, 'kahoot_sessions'));
  let sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Ordenar en cliente por creadoEn descendente
  sessions.sort((a, b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
  if (fechaAsamblea) sessions = sessions.filter(s => s.fechaAsamblea === fechaAsamblea);
  if (estado) sessions = sessions.filter(s => s.estado === estado);
  return sessions;
}

/** Obtener sesión KAHOOT completa */
export async function getKahootSession(sessionId) {
  await assertStaff();
  const snap = await getDoc(doc(fsdb, 'kahoot_sessions', sessionId));
  if (!snap.exists()) throw new Error('Sesión KAHOOT no encontrada');
  return { id: snap.id, ...snap.data() };
}

/** Agregar preguntas a una sesión KAHOOT existente (solo en estado borrador/preparada) */
export async function addQuestionsToKahootSession(sessionId, preguntaIds) {
  await assertStaff();
  const session = await getKahootSession(sessionId);
  if (session.estado === 'activa' || session.estado === 'finalizada') {
    throw new Error('No se pueden agregar preguntas a una sesión activa o finalizada');
  }

  const preguntasExistentes = session.preguntas || [];
  const nextOrden = preguntasExistentes.length + 1;
  const nuevasPreguntas = [];

  for (let i = 0; i < preguntaIds.length; i++) {
    const id = preguntaIds[i];
    // Evitar duplicados
    if (preguntasExistentes.some(p => p.bancoId === id)) continue;
    const snap = await getDoc(doc(fsdb, 'preguntas', id));
    if (!snap.exists()) throw new Error(`Pregunta ${id} no existe`);
    const p = snap.data();
    nuevasPreguntas.push({
      bancoId: id,
      texto: p.texto,
      opciones: p.opciones,
      correcta: p.correcta ?? 0,
      duracion: p.duracion ?? 20,
      orden: nextOrden + i
    });
  }

  if (nuevasPreguntas.length === 0) return { added: 0, total: preguntasExistentes.length };

  const todasPreguntas = [...preguntasExistentes, ...nuevasPreguntas];
  await updateDoc(doc(fsdb, 'kahoot_sessions', sessionId), {
    preguntas: todasPreguntas,
    actualizadoEn: fsTS()
  });
  return { added: nuevasPreguntas.length, total: todasPreguntas.length };
}

/** Activar sesión KAHOOT: copia preguntas a RTDB, marca "activa" */
export async function activateKahootSession(sessionId) {
  await assertStaff();
  const session = await getKahootSession(sessionId);
  if (session.estado === 'finalizada') throw new Error('Sesión ya finalizada');

  // Generar sesionId único para RTDB
  const sesionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Preparar preguntas para RTDB (SIN correcta)
  const preguntasRTDB = session.preguntas.map(p => ({
    id: p.bancoId,
    texto: p.texto,
    opciones: p.opciones,
    duracion: p.duracion
  }));

  // Limpiar sesión anterior en RTDB
  await remove(ref(rtdb, 'asamblea/respuestas'));
  await remove(ref(rtdb, 'asamblea/conectados'));
  await remove(ref(rtdb, 'asamblea/sesion/cerradas'));
  await set(ref(rtdb, RTDB_PATHS.acumulada), false);
  await set(ref(rtdb, RTDB_PATHS.sesionId), sesionId);
  await set(ref(rtdb, RTDB_PATHS.cola), preguntasRTDB);
  await set(ref(rtdb, RTDB_PATHS.indice), 0);
  await writePhase('lobby');

  // Guardar referencia de sesión activa en RTDB (para proyector/celulares)
  await set(ref(rtdb, KAHOOT_RTDB_PATHS.sesionActiva), sessionId);
  await set(ref(rtdb, KAHOOT_RTDB_PATHS.meta), {
    sessionId,
    titulo: session.titulo
  });

  // Actualizar estado en Firestore
  await updateDoc(doc(fsdb, 'kahoot_sessions', sessionId), {
    estado: 'activa',
    actualizadoEn: fsTS(),
    sesionIdRTDB: sesionId
  });

  return { sessionId, sesionId };
}

/** Finalizar sesión KAHOOT: guarda resultados completos + histórico */
export async function finalizeKahootSession() {
  await assertCoordinator();

  // Obtener sesión activa desde RTDB
  const sesionActivaSnap = await get(ref(rtdb, KAHOOT_RTDB_PATHS.sesionActiva));
  const sessionId = sesionActivaSnap.val();
  if (!sessionId) throw new Error('No hay sesión KAHOOT activa');

  const session = await getKahootSession(sessionId);
  if (session.estado === 'finalizada') throw new Error('Sesión ya finalizada');

  // Verificar que no se haya finalizado ya (idempotencia)
  const txResult = await runTransaction(ref(rtdb, RTDB_PATHS.acumulada), (current) => {
    if (current === true) return;
    return true;
  });
  if (!txResult.committed) return; // ya finalizado por otro

  // 1. Acumular en rankingGlobal (igual que finalizarSesion actual)
  const puntosSesion = localState.puntos;
  const membersSnap = await getDocs(collection(fsdb, 'members'));
  const memberByUid = {};
  membersSnap.forEach(d => { memberByUid[d.id] = d.data(); });

  for (const [uid, data] of Object.entries(puntosSesion)) {
    const pts = data?.pts;
    if (!pts) continue;
    const m = memberByUid[uid];
    const key = m?.email ? m.email.replace(/[.#$[\]]/g, '_') : uid;
    await runTransaction(ref(rtdb, RTDB_PATHS.rankingGlobal(key)), (current) => {
      const prev = current || { pts: 0, nombre: m?.nombre || 'Anónimo', email: m?.email || '', fotoUrl: m?.fotoUrl || '' };
      return { ...prev, pts: (prev.pts || 0) + pts, ultimaAsamblea: serverNow() };
    });
  }

  // 2. Construir resultados completos
  const respuestasPorPregunta = {};
  for (const [qid, respuestas] of Object.entries(localState.respuestas || {})) {
    const claveSnap = await get(ref(rtdb, RTDB_PATHS.claves(qid)));
    const correcta = claveSnap.val()?.correcta ?? 0;
    const abreEn = localState.preguntaActual?.abreEn; // aprox

    respuestasPorPregunta[qid] = {};
    for (const [uid, r] of Object.entries(respuestas)) {
      const esCorrecta = r.idx === correcta;
      const rapidez = Math.max(0, 1 - (r.ts - (abreEn || r.ts)) / 20000); // fallback 20s
      const pts = esCorrecta ? Math.round(1000 + 500 * rapidez) : 0;
      respuestasPorPregunta[qid][uid] = {
        idx: r.idx,
        ts: r.ts,
        pts,
        correcta: esCorrecta,
        nombre: r.nombre
      };
    }
  }

  // Ranking final
  const puntosSnap = await get(ref(rtdb, RTDB_PATHS.puntosRoot));
  const puntosTotales = puntosSnap.val() || {};
  const rankingFinal = Object.entries(puntosTotales)
    .map(([uid, data]) => ({ uid, pts: data.pts, nombre: data.nombre }))
    .sort((a, b) => b.pts - a.pts)
    .map((r, i) => ({ ...r, posicion: i + 1 }));

  const resultados = {
    respuestasPorPregunta,
    rankingFinal,
    puntosPorParticipante: puntosTotales,
    totalParticipantes: Object.keys(puntosTotales).length,
    finalizadaEn: serverNow()
  };

  // 3. Actualizar sesión en Firestore con resultados
  await updateDoc(doc(fsdb, 'kahoot_sessions', sessionId), {
    estado: 'finalizada',
    actualizadoEn: fsTS(),
    resultados
  });

  // 4. Snapshot en histórico anual (nueva subcolección)
  const anio = session.anio || new Date().getFullYear();
  await setDoc(doc(fsdb, 'historico', String(anio), 'kahoot_sessions', sessionId), {
    ...session,
    resultados,
    finalizadaEn: fsTS()
  });

  // 5. Snapshot diario simple (existente - mantener compatibilidad)
  const hoy = new Date();
  const hoyStr = hoy.toISOString().split('T')[0];
  await setDoc(doc(fsdb, 'asambleas_kahoot', hoyStr), {
    fecha: hoyStr,
    puntosSesion,
    resumen: localState.resumen,
    totalPreguntas: session.preguntas.length,
    kahootSessionId: sessionId,
    creadoEn: fsTS()
  });
  await setDoc(doc(fsdb, 'historico', String(hoy.getFullYear()), 'asambleas_kahoot', hoyStr), {
    fecha: hoyStr,
    puntosSesion,
    resumen: localState.resumen,
    totalPreguntas: session.preguntas.length,
    kahootSessionId: sessionId,
    creadoEn: fsTS()
  });

  // 6. Fase podio
  await writePhase('podio');

  return { sessionId, resultados };
}

/* ── ACCIONES PARTICIPANTE (celular) ─────────────────────── */

/** Registrar conexión (lobby) */
export async function conectar(uid, nombre) {
  await set(ref(rtdb, RTDB_PATHS.conectados(uid)), { nombre, ts: rtdbTS() });
  onDisconnect(ref(rtdb, RTDB_PATHS.conectados(uid))).remove();
}

/** Responder: write-once en respuestas/{qid}/{uid} con serverTimestamp */
export async function responder(qid, uid, idx) {
  const r = ref(rtdb, RTDB_PATHS.respuesta(qid, uid));
  const snap = await get(r);
  if (snap.exists()) throw new Error('Ya respondiste');
  if (localState.fase !== 'pregunta') throw new Error('Pregunta cerrada');
  // Validar que qid coincide con pregunta actual
  if (localState.preguntaActual?.id !== qid) throw new Error('Pregunta inválida');
  await set(r, { idx, ts: rtdbTS(), nombre: (await getUserName(uid)) });
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