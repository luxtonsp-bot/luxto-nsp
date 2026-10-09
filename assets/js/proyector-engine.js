/**
 * proyector-engine.js — Lógica del proyector usando asamblea-engine
 * Se encarga solo de UI: escuchar estado y renderizar pantallas
 */

import {
  initAsambleaEngine,
  on as engineOn,
  getState as engineState,
  isHost,
  conectar,
  responder,
  getRemainingTime,
  getTimeToNextPhase,
  isPreguntaEnTiempo
} from './asamblea-engine.js';
import { auth, onAuthStateChanged, rtdb, ref, onValue, set, onDisconnect, esc, KAHOOT_RTDB_PATHS, serverNow } from './firebase-init.js';

let usuarioActual = null;
let nombreActual = "";
let fotoActual = "";
let preguntaActualId = null;
let timerInterval = null;
let tiempoRestante = 0;
let respondioActual = false;
let tiempoInicioResp = 0;
let podioMostrado = false;
let participoEnAsamblea = false;
let preguntaPreviaEstado = null;

/* ── Utils ── */
function toast(msg, tipo = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "show " + tipo;
  setTimeout(() => t.className = "", 3000);
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

function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function limpiarTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

/* ── Auth ── */
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  usuarioActual = user;

  try {
    const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const fsdb = getFirestore();
    const memberDoc = await getDoc(doc(fsdb, "members", user.uid));
    if (memberDoc.exists()) {
      const data = memberDoc.data();
      nombreActual = data.nombre || "";
      fotoActual = data.fotoUrl || "";
    } else {
      throw new Error("No se encontró documento de miembro");
    }
  } catch (error) {
    console.error("Error al obtener perfil:", error);
    nombreActual = "Visitante";
    fotoActual = "";
  }

  iniciarEscucha();
});

/* ── Listeners ── */
async function iniciarEscucha() {
  await initAsambleaEngine();
  // El proyector NO llama claimHost(); solo muestra. El control lo toma el admin.

  // Conectados (para lobby)
  engineOn('conectados', (state) => {
    if (state.fase === 'lobby' || state.fase === 'countdown') {
      renderLobby(state.conectados);
    }
  });

  // Fase principal
  engineOn('fase', (state) => {
    handleFaseChange(state);
  });

  // Pregunta actual
  engineOn('preguntaActual', (state) => {
    const p = state.preguntaActual;
    if (p && state.fase === 'pregunta') {
      mostrarPregunta(p);
    }
  });

  // Respuestas live (para admin panel en proyector si se quiere)
  engineOn('respuestas', (state) => {
    // El proyector no muestra respuestas individuales, solo el admin
  });

  // Ranking/resumen
  engineOn('resumen', (state) => {
    if (state.fase === 'ranking' || state.fase === 'revelada') {
      renderRanking(state.resumen);
    }
  });

  // Podio final
  engineOn('fase', (state) => {
    if (state.fase === 'podio' && !podioMostrado) {
      podioMostrado = true;
      renderPodio(state.resumen);
    }
  });
}

function handleFaseChange(state) {
  limpiarTimer();
  respondioActual = false;

  switch (state.fase) {
    case 'apagada':
      podioMostrado = false;
      participoEnAsamblea = false;
      preguntaActualId = null;
      show("screenEspera");
      break;
    case 'lobby':
      show("screenLobby");
      break;
    case 'countdown':
      show("screenCountdown");
      iniciarCountdown(5);
      break;
    case 'pregunta':
      // Se maneja en listener preguntaActual
      break;
    case 'revelada':
      // Mostrar respuesta correcta en las opciones
      revelarCorrecta(state.preguntaActual);
      break;
    case 'ranking':
      renderRanking(state.resumen);
      show("screenRanking");
      break;
    case 'podio':
      // Se maneja en listener separado
      break;
  }

  // Actualizar botones admin bar
  actualizarBotonesAdmin(state);
}

function actualizarBotonesAdmin(state) {
  const btnRanking = document.getElementById("btnRanking");
  const btnLanzar = document.getElementById("btnLanzar");
  const btnCerrar = document.getElementById("btnCerrar");
  const btnSiguiente = document.getElementById("btnSiguiente");
  const btnFinalizar = document.getElementById("btnFinalizar");
  const soyHost = isHost();

  // Ocultar todos primero
  [btnRanking, btnLanzar, btnCerrar, btnSiguiente, btnFinalizar].forEach(b => {
    if (b) b.style.display = "none";
  });

  if (soyHost) {
    switch (state.fase) {
      case 'lobby':
        if (btnLanzar) btnLanzar.style.display = "inline-flex";
        break;
      case 'countdown':
        // No botones durante countdown
        break;
      case 'pregunta':
        if (btnCerrar) btnCerrar.style.display = "inline-flex";
        if (btnRanking) btnRanking.style.display = "inline-flex";
        break;
      case 'revelada':
        if (btnSiguiente) btnSiguiente.style.display = "inline-flex";
        if (btnRanking) btnRanking.style.display = "inline-flex";
        break;
      case 'ranking':
        if (btnSiguiente) btnSiguiente.style.display = "inline-flex";
        if (btnRanking) btnRanking.style.display = "inline-flex";
        if (btnFinalizar) btnFinalizar.style.display = "inline-flex";
        break;
      case 'podio':
        if (btnFinalizar) btnFinalizar.style.display = "inline-flex";
        break;
    }
  }
}

/* ── UI Rendering ── */

function renderLobby(conectados) {
  const grid = document.getElementById("lobbyGrid");
  const countEl = document.getElementById("lobbyCountNum");
  const countWrap = document.getElementById("lobbyCount");

  if (countEl) countEl.textContent = Object.keys(conectados).length;
  if (countWrap) countWrap.style.display = "flex";

  const participantes = Object.values(conectados).sort((a, b) => (a.ts || 0) - (b.ts || 0));

  if (participantes.length === 0) {
    grid.innerHTML = `
      <div class="lobby-empty" style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;color:var(--muted);text-align:center;padding:40px">
        <div class="lobby-empty-icon">👥</div>
        <div class="lobby-empty-title">Sin participantes aún</div>
        <div class="lobby-empty-sub">Comparte el enlace para que se unan</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = participantes.map((u, i) => `
    <div class="lobby-item" style="animation-delay:${i * 0.1}s">
      <img class="lobby-foto" src="${u.fotoMostrar || u.fotoUrl ? convertirUrlDrive(u.fotoUrl) : avatarFallback(u.nombre)}" alt="${esc(u.nombre)}" onerror="this.onerror=null;this.src='${avatarFallback(u.nombre)}'">
      <div class="lobby-nombre">${esc(u.nombre)}</div>
      <div class="lobby-status"><span></span>Conectado</div>
    </div>
  `).join("");
}

function iniciarCountdown(segundos) {
  const numEl = document.getElementById("countNum");
  let s = segundos;
  numEl.textContent = s;
  timerInterval = setInterval(() => {
    s--;
    if (s > 0) {
      numEl.textContent = s;
      numEl.style.animation = "none";
      numEl.offsetHeight; // trigger reflow
      numEl.style.animation = "countPop .8s cubic-bezier(0.19,1,0.22,1) both";
    } else {
      limpiarTimer();
    }
  }, 1000);
}

function mostrarPregunta(p) {
  preguntaActualId = p.id;
  tiempoInicioResp = Date.now();
  respondioActual = false;
  preguntaPreviaEstado = "activa";

  document.getElementById("pregNum").textContent = "PREGUNTA " + (p.numero || "?");
  document.getElementById("pregTxt").textContent = p.texto;

  const grid = document.getElementById("opcionesGrid");
  const letras = ["A", "B", "C", "D"];
  const clases = ["op-a", "op-b", "op-c", "op-d"];
  grid.innerHTML = "";
  (p.opciones || []).forEach((op, i) => {
    const card = document.createElement("div");
    card.className = "opcion-card " + clases[i];
    card.innerHTML = `
      <div class="opcion-letra">${letras[i]}</div>
      <div class="opcion-sep"></div>
      <div class="opcion-txt">${esc(op)}</div>
      <div class="resp-bar-wrap"><div class="resp-bar"></div></div>
      <div class="resp-count">0</div>
    `;
    grid.appendChild(card);
  });

  const dur = p.duracion || 20;
  tiempoRestante = dur;
  iniciarTimerPregunta(dur, p.cierraEn);
  show("screenPregunta");

  // Mostrar stats badge
  document.getElementById("pregStats").style.display = "flex";
  document.getElementById("respBadge").style.display = "flex";
  document.getElementById("respBadgeTxt").textContent = "0 respuestas";
}

function iniciarTimerPregunta(duracion, cierraEn) {
  limpiarTimer();
  const circum = 175.9;
  const barEl = document.getElementById("tiempoBar");
  const circleEl = document.getElementById("timerCircle");
  const numEl = document.getElementById("timerNum");
  const badgeNum = document.getElementById("respBadgeTxt");

  barEl.style.width = "100%";
  barEl.style.background = "var(--y)";
  circleEl.style.strokeDashoffset = "0";
  circleEl.style.stroke = "var(--y)";
  numEl.textContent = duracion;

  timerInterval = setInterval(() => {
    // Timer Recovery: usar serverNow() en lugar de Date.now() para sincronización precisa
    const now = serverNow();
    const remaining = Math.max(0, Math.ceil((cierraEn - now) / 1000));
    tiempoRestante = remaining;
    const pct = remaining / duracion;

    barEl.style.width = (pct * 100) + "%";
    barEl.style.background = pct > 0.4 ? "var(--y)" : pct > 0.2 ? "var(--o)" : "var(--err)";
    circleEl.style.strokeDashoffset = circum * (1 - pct);
    circleEl.style.stroke = pct > 0.4 ? "#F5C518" : pct > 0.2 ? "#C4703A" : "#e03c3c";
    numEl.textContent = remaining;

    if (remaining <= 0) {
      limpiarTimer();
    }
  }, 200); // Más suave
}

function revelarCorrecta(p) {
  if (!p) return;
  const correcta = p.correcta ?? 0;
  const cards = document.querySelectorAll(".opcion-card");
  cards.forEach((card, i) => {
    card.classList.remove("correcto", "incorrecto");
    if (i === correcta) {
      card.classList.add("correcto");
    } else {
      card.classList.add("incorrecto");
    }
  });
}

function renderRanking(resumen) {
  const grid = document.getElementById("rankGrid");
  if (!resumen || resumen.length === 0) {
    grid.innerHTML = '<div style="color:var(--muted);text-align:center;padding:40px;">Sin participantes aún</div>';
    show("screenRanking");
    return;
  }

  grid.innerHTML = resumen.slice(0, 20).map((r, i) => {
    const pos = i + 1;
    const posClass = pos === 1 ? "pos-1" : pos === 2 ? "pos-2" : pos === 3 ? "pos-3" : "";
    const fotoSrc = r.fotoUrl ? convertirUrlDrive(r.fotoUrl) : avatarFallback(r.nombre);
    return `
      <div class="rank-item ${posClass}">
        <div class="rank-pos">${pos}</div>
        <img class="rank-foto" src="${fotoSrc}" alt="${esc(r.nombre)}" onerror="this.onerror=null;this.src='${avatarFallback(r.nombre)}'">
        <div class="rank-nombre">${esc(r.nombre)}</div>
        <div class="rank-pts">${r.pts}</div>
        <div class="rank-pts-label">pts</div>
      </div>
    `;
  }).join("");
  show("screenRanking");
}

function renderPodio(resumen) {
  const top3El = document.getElementById("podioTop3");
  const listaEl = document.getElementById("rankingCompleto");

  if (!resumen || resumen.length === 0) {
    show("screenFin");
    return;
  }

  const ranking = resumen.slice(0, 20);

  // Top 3 visual
  top3El.innerHTML = "";
  const ordenVisual = [ ranking[1] || null, ranking[0] || null, ranking[2] || null ];
  const posClases = ["pos-2", "pos-1", "pos-3"];
  const coronas = ["🥈", "👑", "🥉"];
  const pedestalNums = ["2", "1", "3"];

  ordenVisual.forEach((r, vi) => {
    if (!r) return;
    const wrap = document.createElement("div");
    wrap.className = "podio-lugar " + posClases[vi];
    const fotoSrc = r.fotoUrl ? convertirUrlDrive(r.fotoUrl) : avatarFallback(r.nombre);
    wrap.innerHTML = `
      <div class="podio-foto-wrap">
        <img class="podio-foto" src="${fotoSrc}" alt="${esc(r.nombre)}" onerror="this.onerror=null;this.src='${avatarFallback(r.nombre)}'">
        <div class="podio-corona">${coronas[vi]}</div>
      </div>
      <div class="podio-nombre">${esc(r.nombre.split(" ")[0])}</div>
      <div class="podio-puntos">${r.pts} pts</div>
      <div class="podio-pedestal"><div class="podio-num">${pedestalNums[vi]}</div></div>
    `;
    top3El.appendChild(wrap);
  });

  // Ranking completo
  listaEl.innerHTML = "";
  const medallas = ["🥇", "🥈", "🥉"];
  ranking.forEach((r, i) => {
    const item = document.createElement("div");
    item.className = "rank-item";
    item.style.animationDelay = (i * 0.06) + "s";
    const fotoSrc = r.fotoUrl ? convertirUrlDrive(r.fotoUrl) : avatarFallback(r.nombre);
    const posClass = i < 3 ? ["top1", "top2", "top3"][i] : "";
    const posLabel = i < 3 ? medallas[i] : (i + 1);
    item.innerHTML = `
      <div class="rank-pos ${posClass}">${posLabel}</div>
      <img class="rank-foto" src="${fotoSrc}" alt="${esc(r.nombre)}" onerror="this.onerror=null;this.src='${avatarFallback(r.nombre)}'">
      <div class="rank-nombre">${esc(r.nombre)}</div>
      <div style="text-align:right">
        <div class="rank-pts">${r.pts}</div>
        <div class="rank-pts-label">pts</div>
      </div>
    `;
    listaEl.appendChild(item);
  });

  show("screenPodio");
  lanzarConfetti();
}

function lanzarConfetti() {
  const canvas = document.getElementById("confettiCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ["#F5C518", "#C4703A", "#4A8FA8", "#C4869A", "#2dba6f", "#ffffff"];
  const pieces = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
    w: Math.random() * 10 + 5, h: Math.random() * 5 + 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2,
    vx: (Math.random() - .5) * 3, vy: Math.random() * 3 + 2,
    vr: (Math.random() - .5) * .15
  }));
  let frame = 0; const MAX_FRAMES = 220;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - frame / MAX_FRAMES);
      ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    });
    frame++;
    if (frame < MAX_FRAMES) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

/* ── Botones Admin Bar (llamados desde HTML) ── */
window.mostrarRankingManual = async function() {
  const { mostrarRanking } = await import('./asamblea-engine.js');
  await mostrarRanking();
};

window.lanzarPrimeraPregunta = async function() {
  const { nextPregunta } = await import('./asamblea-engine.js');
  await nextPregunta();
};

window.cerrarPreguntaManual = async function() {
  const { cerrarPregunta } = await import('./asamblea-engine.js');
  await cerrarPregunta();
};

window.lanzarSiguientePregunta = async function() {
  const { nextPregunta } = await import('./asamblea-engine.js');
  await nextPregunta();
};

window.finalizarAsamblea = async function() {
  const { finalizarSesion } = await import('./asamblea-engine.js');
  await finalizarSesion();
};

window.toggleAdminBar = function() {
  const bar = document.getElementById("adminBar");
  const toggle = document.getElementById("adminToggle");
  bar.classList.toggle("visible");
  toggle.textContent = bar.classList.contains("visible") ? "⚙️ Ocultar" : "⚙️ Admin";
};