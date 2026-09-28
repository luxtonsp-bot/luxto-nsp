/**
 * asamblea-participant.js — Lógica del participante (celular) usando asamblea-engine
 * Se encarga solo de UI: escuchar estado y renderizar pantallas
 */

import {
  initAsambleaEngine,
  on as engineOn,
  getState as engineState,
  conectar,
  responder
} from './asamblea-engine.js';
import { auth, onAuthStateChanged, rtdb, ref, onValue, set, rtdbTS, onDisconnect, esc } from './firebase-init.js';
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let usuarioActual = null;
let nombreActual = "";
let fotoActual = "";
let fotoOriginal = "";
let puntosTotal = 0; // se sincroniza con servidor
let preguntaActualId = null;
let timerInterval = null;
let tiempoRestante = 0;
let respondioActual = false;
let tiempoInicioResp = 0;
let podioMostrado = false;
let participoEnAsamblea = false;
let preguntaPreviaEstado = null;
let ultimaRespuesta = null;
let puntosListener = null; // listener de puntos del servidor

/* ── Utils ── */
function toast(msg, tipo = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "show " + tipo;
  setTimeout(() => t.className = "", 3000);
}

function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function convertirUrlDrive(url) {
  if (!url) return "";
  if (url.includes("drive.google.com/thumbnail")) return url;
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
         || url.match(/\/d\/([a-zA-Z0-9_-]{20,})/)
         || url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w160";
  return url;
}

function avatarFallback(nombre) {
  const inicial = (nombre || "?").charAt(0).toUpperCase();
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%232a2218'/><text x='40' y='52' text-anchor='middle' font-family='Outfit,sans-serif' font-size='32' font-weight='700' fill='%23F5C518'>${inicial}</text></svg>`;
}

function limpiarTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

/* ── Auth ── */
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  usuarioActual = user;

  try {
    const fsdb = getFirestore();
    const memberDoc = await getDoc(doc(fsdb, "members", user.uid));
    if (memberDoc.exists()) {
      const data = memberDoc.data();
      nombreActual = data.nombre || "";
      fotoOriginal = data.fotoUrl || "";
      fotoActual = fotoOriginal || "";
      document.getElementById("topbarNombre").textContent = nombreActual.split(" ")[0];
      const avatarEl = document.getElementById("topbarFoto");
      if (fotoActual) {
        avatarEl.src = fotoActual;
      } else {
        avatarEl.src = avatarFallback(nombreActual);
        avatarEl.style.display = "block";
      }
    } else {
      throw new Error("No se encontró documento de miembro");
    }
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    nombreActual = "Visitante";
    fotoActual = "";
    document.getElementById("topbarNombre").textContent = nombreActual;
    const avatarEl = document.getElementById("topbarFoto");
    avatarEl.src = avatarFallback(nombreActual);
  }

  iniciarEscucha();
});

/* ── Listeners ── */
async function iniciarEscucha() {
  await initAsambleaEngine();

  // Conectados (para panel en screenEsperando)
  engineOn('conectados', (state) => {
    const panel = document.getElementById("conectadosPanel");
    const countEl = document.getElementById("conectadosCount");
    const listaEl = document.getElementById("conectadosLista");
    const total = Object.keys(state.conectados || {}).length;

    if (countEl) countEl.textContent = total;

    if (total === 0) {
      if (panel) panel.style.display = "none";
      if (listaEl) listaEl.innerHTML = "";
      return;
    }

    if (panel) panel.style.display = "block";

    const participantes = Object.values(state.conectados).sort((a, b) => (a.ts || 0) - (b.ts || 0));

    listaEl.innerHTML = participantes.map((u, i) => {
      const fotoSrc = u.fotoMostrar || (u.fotoUrl ? convertirUrlDrive(u.fotoUrl) : "");
      const fallback = avatarFallback(u.nombre);
      return `
        <div class="conectado-item" style="animation-delay:${i * 0.05}s">
          <img class="conectado-foto" src="${esc(fotoSrc || fallback)}" data-foto-url="${esc(u.fotoUrl || '')}" data-nombre="${esc(u.nombre)}" alt="${esc(u.nombre)}" onerror="this.onerror=null;this.src='${esc(fallback)}'">
          <div class="conectado-nombre">${esc(u.nombre)}</div>
          <div class="conectado-status">Conectado</div>
        </div>`;
    }).join("");
  });

  // Puntos del servidor (sesion/puntos/{uid}) — escucha en tiempo real
  if (puntosListener) puntosListener();
  const { on: onPoints, getState: getPointsState } = await import('./asamblea-engine.js');
  puntosListener = onPoints('puntos', (state) => {
    const misPuntos = state.puntos?.[usuarioActual?.uid]?.pts || 0;
    puntosTotal = misPuntos;
    const scoreEl = document.getElementById("topbarScore");
    if (scoreEl) scoreEl.textContent = misPuntos;
  });

  // Fase principal
  engineOn('fase', async (state) => {
    await handleFaseChange(state);
  });

  // Pregunta actual
  engineOn('preguntaActual', (state) => {
    const p = state.preguntaActual;
    if (p && state.fase === 'pregunta' && p.id !== preguntaActualId) {
      preguntaActualId = p.id;
      respondioActual = false;
      tiempoInicioResp = Date.now();
      preguntaPreviaEstado = "activa";
      mostrarPregunta(p);
    }
  });
}

async function handleFaseChange(state) {
  limpiarTimer();
  respondioActual = false;

  switch (state.fase) {
    case 'apagada':
      podioMostrado = false;
      participoEnAsamblea = false;
      preguntaActualId = null;
      ultimaRespuesta = null;
      // Limpiar listener de puntos
      if (puntosListener) { puntosListener(); puntosListener = null; }
      show("screenNoActiva");
      break;
    case 'lobby':
    case 'countdown':
      if (state.activa !== false) {
        show("screenEsperando");
      } else {
        show("screenNoActiva");
      }
      break;
    case 'pregunta':
      // Se maneja en listener preguntaActual
      break;
    case 'revelada':
      // Mostrar resultado de la pregunta que acaba de cerrar
      if (ultimaRespuesta) {
        const p = state.preguntaActual;
        const correcta = p?.correcta ?? 0;
        const esCorrecta = ultimaRespuesta.idx === correcta;
        const opTexto = (p?.opciones || [])[correcta] || "—";
        mostrarResultado(esCorrecta, ultimaRespuesta.pts, ultimaRespuesta.texto, opTexto, false);
        ultimaRespuesta = null;
      }
      break;
    case 'ranking':
      // Mantener en resultado o ir a esperando
      break;
    case 'podio':
      if (!podioMostrado) {
        podioMostrado = true;
        // El ranking global se muestra en el podio final
        // Esperamos un poco y mostramos pantalla final
        setTimeout(() => {
          show("screenFin");
          document.getElementById("finScore").textContent = puntosTotal;
        }, 5000);
      }
      break;
  }

  // Registrar/desregistrar presencia
  const conectadosRef = ref(rtdb, "asamblea/conectados/" + usuarioActual.uid);
  if (state.fase !== 'apagada' && state.activa !== false) {
    set(conectadosRef, {
      nombre: nombreActual,
      email: usuarioActual.email,
      fotoUrl: fotoOriginal,
      fotoMostrar: fotoActual,
      ts: rtdbTS()
    });
    onDisconnect(conectadosRef).remove();
  } else {
    onDisconnect(conectadosRef).cancel();
    set(conectadosRef, null);
  }
}

function mostrarPregunta(p) {
  document.getElementById("preguntaNum").textContent = "PREGUNTA " + (p.numero || "?");
  document.getElementById("preguntaTxt").textContent = p.texto;

  const grid = document.getElementById("opcionesGrid");
  const letras = ["A", "B", "C", "D"];
  const clases = ["op-a", "op-b", "op-c", "op-d"];
  grid.innerHTML = "";
  (p.opciones || []).forEach((op, i) => {
    const btn = document.createElement("button");
    btn.className = "opcion-btn " + clases[i];
    btn.dataset.idx = i;
    btn.innerHTML = `<div class="opcion-letra-big">${esc(letras[i])}</div>`;
    btn.onclick = () => responderOpcion(i, op, p);
    grid.appendChild(btn);
  });

  const dur = p.duracion || 20;
  tiempoRestante = dur;
  iniciarTimer(dur);
  show("screenPregunta");
}

function iniciarTimer(duracion) {
  limpiarTimer();
  const circum = 138.2;
  const barEl = document.getElementById("tiempoBar");
  const circleEl = document.getElementById("timerCircle");
  const numEl = document.getElementById("timerNum");
  barEl.style.width = "100%";
  circleEl.style.strokeDashoffset = "0";
  numEl.textContent = duracion;
  timerInterval = setInterval(() => {
    tiempoRestante--;
    const pct = tiempoRestante / duracion;
    barEl.style.width = (pct * 100) + "%";
    barEl.style.background = pct > 0.4 ? "var(--y)" : pct > 0.2 ? "var(--o)" : "var(--err)";
    circleEl.style.strokeDashoffset = circum * (1 - pct);
    circleEl.style.stroke = pct > 0.4 ? "#F5C518" : pct > 0.2 ? "#C4703A" : "#e03c3c";
    numEl.textContent = tiempoRestante;
    if (tiempoRestante <= 0) {
      limpiarTimer();
      if (!respondioActual) {
        mostrarResultado(false, null, "", "", true);
      }
    }
  }, 1000);
}

async function responderOpcion(idx, texto, pregunta) {
  if (respondioActual) return;
  respondioActual = true;
  participoEnAsamblea = true;
  limpiarTimer();

  const btns = document.querySelectorAll(".opcion-btn");
  btns.forEach(b => b.disabled = true);
  btns[idx].classList.add("selected");

  // NO calcular puntos localmente — el servidor lo hace y nos llega via listener de puntos
  try {
    await responder(pregunta.id, usuarioActual.uid, idx);
  } catch (e) {
    console.error("Error respondiendo:", e);
    toast("Error al enviar respuesta", "err");
    btns.forEach(b => b.disabled = false);
    btns[idx].classList.remove("selected");
    respondioActual = false;
    return;
  }

  // Guardar para mostrar resultado cuando cierre
  ultimaRespuesta = { idx, texto, pregunta };
}

function mostrarResultado(esCorrecta, pts, respUser, respCorrecta, timeout) {
  if (timeout) {
    document.getElementById("resultEmoji").textContent = "⏰";
    document.getElementById("resultTitulo").textContent = "¡Tiempo!";
    document.getElementById("resultSub").textContent = "Se te acabó el tiempo";
    document.getElementById("resultPts").textContent = "+0 PTS";
  } else if (esCorrecta) {
    document.getElementById("resultEmoji").textContent = "🎉";
    document.getElementById("resultTitulo").textContent = "¡Correcto!";
    document.getElementById("resultSub").textContent = "Excelente respuesta";
    document.getElementById("resultPts").textContent = "+" + pts + " PTS";
  } else {
    document.getElementById("resultEmoji").textContent = "❌";
    document.getElementById("resultTitulo").textContent = "Incorrecto";
    document.getElementById("resultSub").textContent = "Sigue intentando";
    document.getElementById("resultPts").textContent = "+0 PTS";
  }

  // Aplicar clases visuales a los botones
  const btns = document.querySelectorAll(".opcion-btn");
  if (ultimaRespuesta && ultimaRespuesta.pregunta) {
    const correctIdx = ultimaRespuesta.pregunta.correcta ?? -1;
    btns.forEach((b, i) => {
      b.classList.remove("selected");
      if (i === correctIdx) b.classList.add("correcto");
      else if (i === ultimaRespuesta.idx) b.classList.add("incorrecto");
    });
  }

  document.getElementById("resultRespuesta").textContent = esc(respCorrecta || "—");
  show("screenResultado");

  // Auto-avanzar a "esperando" después de 4s
  clearTimeout(window._autoAdvanceTimer);
  window._autoAdvanceTimer = setTimeout(() => {
    volverAEsperar();
  }, 4000);
}

window.volverAEsperar = function() {
  show("screenEsperando");
  respondioActual = false;
  preguntaActualId = null;
  ultimaRespuesta = null;
};