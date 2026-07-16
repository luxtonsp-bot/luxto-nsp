// ── Proyector JS — Luz de Cristo ──
// Módulo: control total de la asamblea desde el proyector

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, get, update, remove, push, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLl5CLvdaSzZ_K6VXrlJzm4VvN9HQouJo",
  authDomain: "luxto-nsp.firebaseapp.com",
  projectId: "luxto-nsp",
  storageBucket: "luxto-nsp.firebasestorage.app",
  messagingSenderId: "3542836325",
  appId: "1:3542836325:web:cf65cd50edcc431500d28c",
  databaseURL: "https://luxto-nsp-default-rtdb.firebaseio.com"
};

const ADMINS = [
  "henry.alfaro1@unmsm.edu.pe",
  "paolosotil97@gmail.com",
  "jorgediego.123.2002@gmail.com",
  "gianfracamones@gmail.com",
  "alvarorodrigosalazar.2001@gmail.com"
];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let esAdmin = false;
let preguntaActualId = null;
let timerInterval = null;
let tiempoRestante = 0;
let duracionActual = 20;
let pantallaActual = "screenEspera";
let countdownActive = false;
let respuestasActuales = {};
let rankingPrevio = {};

// ── LOBBY: participantes conectados ──
let conectadosListener = null;
let conectadosActuales = {};

// ── Cola de preguntas (de /borradores) ──
let colaPreguntas = [];
let indiceActual = 0;
let preguntaNumActual = 0;

// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════

function toast(msg, tipo="") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show " + tipo;
  setTimeout(() => t.className="", 3000);
}

function convertirUrlDrive(url) {
  if (!url) return "";
  if (url.includes("drive.google.com/thumbnail")) return url;
  let m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) || url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w160";
  return url;
}

function avatarFallback(nombre) {
  const i = (nombre || "?").charAt(0).toUpperCase();
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%232a2218'/><text x='40' y='52' text-anchor='middle' font-family='Outfit,sans-serif' font-size='32' font-weight='700' fill='%23F5C518'>${i}</text></svg>`;
}

function showScreen(id) {
  const prev = document.querySelector(".screen.active");
  if (prev) { prev.classList.add("exit"); setTimeout(() => prev.classList.remove("active","exit"), 500); }
  setTimeout(() => { const next = document.getElementById(id); if (next) next.classList.add("active"); }, prev ? 200 : 0);
  pantallaActual = id;
  // Ocultar contador de lobby en pantallas que no son lobby
  const lobbyCount = document.getElementById("lobbyCount");
  if (lobbyCount) lobbyCount.style.display = (id === "screenLobby") ? "flex" : "none";
}

function limpiarTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  esAdmin = ADMINS.includes(user.email);
  if (esAdmin) {
    document.getElementById("adminToggle").style.display = "block";
    document.getElementById("adminBar").classList.add("visible");
  }
  leerPreguntaNum();
  escucharBorradores();
  iniciarEscucha();
});

// ═══════════════════════════════════════════
// BARRA ADMIN
// ═══════════════════════════════════════════

window.toggleAdminBar = function() {
  document.getElementById("adminBar").classList.toggle("visible");
};

// ═══════════════════════════════════════════
// LEER preguntaNum DE FIREBASE
// ═══════════════════════════════════════════

async function leerPreguntaNum() {
  try {
    const snap = await get(ref(db, "asamblea/preguntaNum"));
    preguntaNumActual = snap.val() || 0;
  } catch(e) {}
}

// ═══════════════════════════════════════════
// ESCUCHAR BORRADORES (cola de preguntas)
// ═══════════════════════════════════════════

function escucharBorradores() {
  onValue(ref(db, "borradores"), (snap) => {
    const data = snap.val();
    if (!data) { colaPreguntas = []; actualizarBotones(); return; }
    colaPreguntas = Object.entries(data)
      .map(([key, p]) => ({ key, texto: p.texto, opciones: p.opciones || [], correcta: p.correcta ?? 0, duracion: p.duracion || 20, ts: p.ts || 0 }))
      .sort((a, b) => a.ts - b.ts);
    actualizarBotones();
  });
}

function actualizarBotones() {
  const total = colaPreguntas.length;
  const btnLanzar = document.getElementById("btnLanzar");
  const btnSiguiente = document.getElementById("btnSiguiente");
  const btnCerrar = document.getElementById("btnCerrar");
  const btnFinalizar = document.getElementById("btnFinalizar");
  const label = document.getElementById("adminBarLabel");

  btnCerrar.style.display = "none";

  if (total === 0) {
    btnLanzar.style.display = "none";
    btnSiguiente.style.display = "none";
    btnFinalizar.style.display = "none";
    label.textContent = "⚠️ No hay preguntas. Súbelas desde el panel admin.";
    return;
  }

  // Si aún no se ha lanzado ninguna pregunta
  if (preguntaNumActual === 0) {
    btnLanzar.style.display = "inline-flex";
    btnLanzar.textContent = `🚀 Lanzar pregunta 1/${total}`;
    btnSiguiente.style.display = "none";
    btnFinalizar.style.display = "none";
    label.textContent = `⚙️ ${total} preguntas listas — Listo para iniciar`;
  } else if (indiceActual < total) {
    btnLanzar.style.display = "none";
    btnSiguiente.style.display = "inline-flex";
    btnSiguiente.textContent = `Siguiente → (${indiceActual + 1}/${total})`;
    btnFinalizar.style.display = "inline-flex";
  } else {
    btnLanzar.style.display = "none";
    btnSiguiente.style.display = "none";
    btnFinalizar.style.display = "inline-flex";
    label.textContent = `🏁 ${total}/${total} preguntas completadas — Finaliza`;
  }
}

// ═══════════════════════════════════════════
// ESCUCHAR ASAMBLEA (Firebase)
// ═══════════════════════════════════════════

function iniciarEscucha() {
  // Iniciar listener de conectados cuando la asamblea esté activa
  onValue(ref(db, "asamblea/activa"), (snap) => {
    const activa = snap.val() === true;
    if (activa) {
      escucharConectados();
    } else {
      if (conectadosListener) {
        conectadosListener();
        conectadosListener = null;
      }
      conectadosActuales = {};
      actualizarLobby();
    }
  });

  onValue(ref(db, "asamblea"), (snap) => {
    const data = snap.val();
    if (!data || (!data.activa && data.estado !== "finalizada")) {
      showScreen("screenEspera");
      limpiarTimer();
      document.getElementById("respBadge").style.display = "none";
      document.getElementById("pregStats").style.display = "none";
      document.getElementById("lobbyCount").style.display = "none";
      return;
    }

    if (data.estado === "finalizada") {
      limpiarTimer();
      if (conectadosListener) {
        conectadosListener();
        conectadosListener = null;
      }
      construirRanking(data.respuestas || {});
      showScreen("screenRanking");
      document.getElementById("btnLanzar").style.display = "none";
      document.getElementById("btnSiguiente").style.display = "none";
      document.getElementById("btnCerrar").style.display = "none";
      document.getElementById("btnFinalizar").style.display = "none";
      document.getElementById("adminBarLabel").textContent = "🏁 Asamblea finalizada";
      document.getElementById("lobbyCount").style.display = "none";
      return;
    }

    const p = data.preguntaActual;
    if (!p || p.estado !== "activa") {
      if (data.respuestas) actualizarRankingBg(data.respuestas);
      if (pantallaActual === "screenPregunta") {
        revelarCorrectaYRanking(data);
      } else if (pantallaActual !== "screenRanking" && pantallaActual !== "screenCountdown") {
        // Mostrar lobby si hay asamblea activa pero no hay pregunta activa
        showScreen("screenLobby");
        document.getElementById("lobbyCount").style.display = "flex";
      }
      limpiarTimer();
      return;
    }

    // Hay pregunta activa -> ocultar lobby
    document.getElementById("lobbyCount").style.display = "none";

    if (data.respuestas && data.respuestas[p.id]) {
      respuestasActuales = data.respuestas[p.id];
      actualizarContadores(respuestasActuales, p);
    } else {
      respuestasActuales = {};
    }

    if (p.id !== preguntaActualId) {
      preguntaActualId = p.id;
      mostrarPregunta(p);
    }

    if (esAdmin) {
      document.getElementById("adminBarLabel").textContent = `⚙️ Pregunta ${p.numero || "?"} — ${Object.keys(respuestasActuales).length} respuestas`;
    }
  });
}

function escucharConectados() {
  if (conectadosListener) return;
  conectadosListener = onValue(ref(db, "asamblea/conectados"), (snap) => {
    const data = snap.val() || {};
    conectadosActuales = data;
    actualizarLobby();
  });
}

function actualizarLobby() {
  const grid = document.getElementById("lobbyGrid");
  const countEl = document.getElementById("lobbyCountNum");
  const participantes = Object.values(conectadosActuales);
  const total = participantes.length;

  if (countEl) countEl.textContent = total;

  if (total === 0) {
    grid.innerHTML = `
      <div class="lobby-empty">
        <div class="lobby-empty-icon">👥</div>
        <div>Esperando asambleístas...</div>
        <div style="font-size:12px;margin-top:8px;opacity:.6">Los participantes aparecerán aquí al entrar</div>
      </div>`;
    return;
  }

  grid.innerHTML = participantes.map((u, i) => {
    const fotoSrc = u.fotoMostrar || (u.fotoUrl ? convertirUrlDrive(u.fotoUrl) : "");
    const fallback = avatarFallback(u.nombre);
    return `
      <div class="lobby-item" style="animation-delay:${i * 0.07}s">
        <img class="lobby-foto" src="${fotoSrc || fallback}" alt="${u.nombre}" onerror="this.onerror=null;this.src='${fallback}'">
        <div class="lobby-nombre">${u.nombre}</div>
        <div class="lobby-status">Conectado</div>
      </div>`;
  }).join("");
}

// ═══════════════════════════════════════════
// MOSTRAR PREGUNTA
// ═══════════════════════════════════════════

function mostrarPregunta(p) {
  limpiarTimer();
  const letras = ["A","B","C","D"];
  const clases = ["op-a","op-b","op-c","op-d"];
  document.getElementById("pregNum").textContent = "PREGUNTA " + (p.numero || "?");
  document.getElementById("pregTxt").textContent = p.texto;

  const grid = document.getElementById("opcionesGrid");
  grid.innerHTML = "";
  (p.opciones || []).forEach((op, i) => {
    const card = document.createElement("div");
    card.className = "opcion-card " + clases[i];
    card.dataset.idx = i;
    card.innerHTML = `
      <div class="opcion-letra">${letras[i]}</div>
      <div class="opcion-sep"></div>
      <div class="opcion-txt">${op}</div>
      <div class="resp-bar-wrap"><div class="resp-bar" id="bar${i}" style="width:0%"></div></div>
      <div class="resp-count" id="cnt${i}">0</div>`;
    grid.appendChild(card);
  });

  const dur = p.duracion || 20;
  duracionActual = dur;
  tiempoRestante = dur;
  iniciarTimer(dur);

  document.getElementById("pregStats").style.display = "flex";
  document.getElementById("respBadge").style.display = "flex";

  if (esAdmin) {
    document.getElementById("btnLanzar").style.display = "none";
    document.getElementById("btnSiguiente").style.display = "none";
    document.getElementById("btnCerrar").style.display = "inline-flex";
    document.getElementById("btnFinalizar").style.display = "inline-flex";
  }
  showScreen("screenPregunta");
}

function iniciarTimer(duracion) {
  limpiarTimer();
  const circum = 175.9;
  const barEl = document.getElementById("tiempoBar");
  const circleEl = document.getElementById("timerCircle");
  const numEl = document.getElementById("timerNum");
  barEl.style.width = "100%";
  circleEl.style.strokeDashoffset = "0";
  numEl.textContent = duracion;

  timerInterval = setInterval(() => {
    tiempoRestante--;
    const pct = Math.max(0, tiempoRestante / duracion);
    barEl.style.width = (pct * 100) + "%";
    barEl.style.background = pct > .4 ? "var(--y)" : pct > .2 ? "var(--o)" : "var(--err)";
    circleEl.style.strokeDashoffset = circum * (1 - pct);
    circleEl.style.stroke = pct > .4 ? "#F5C518" : pct > .2 ? "#C4703A" : "#e03c3c";
    numEl.textContent = Math.max(0, tiempoRestante);
    if (tiempoRestante <= 0) {
      limpiarTimer();
      // Auto-cerrar pregunta cuando se acaba el tiempo
      cerrarPreguntaManual();
    }
  }, 1000);
}

// ═══════════════════════════════════════════
// CONTADORES EN VIVO
// ═══════════════════════════════════════════

function actualizarContadores(resps, p) {
  const total = Object.keys(resps).length;
  const counts = [0,0,0,0];
  let correctas = 0;
  Object.values(resps).forEach(r => {
    if (r.idx >= 0 && r.idx < 4) counts[r.idx]++;
    if (r.correcta) correctas++;
  });
  document.getElementById("statRespCount").textContent = total;
  document.getElementById("statCorrCount").textContent = correctas;
  document.getElementById("respBadgeTxt").textContent = total + (total===1?" respuesta":" respuestas");
  counts.forEach((c, i) => {
    const barEl = document.getElementById("bar" + i);
    const cntEl = document.getElementById("cnt" + i);
    if (barEl) barEl.style.width = total > 0 ? (c / total * 100) + "%" : "0%";
    if (cntEl) { cntEl.textContent = c; if(c>0) cntEl.style.color="rgba(255,255,255,.6)"; }
  });
}

// ═══════════════════════════════════════════
// REVELAR CORRECTA
// ═══════════════════════════════════════════

function revelarCorrectaYRanking(data) {
  const p = data.preguntaActual;
  if (!p) return;
  const cards = document.querySelectorAll(".opcion-card");
  cards.forEach((card, i) => {
    if (i === p.correcta) card.classList.add("correcto");
    else card.classList.add("incorrecto");
  });
  limpiarTimer();
  const numEl = document.getElementById("timerNum");
  if (numEl) numEl.textContent = "0";

  if (esAdmin) {
    document.getElementById("btnCerrar").style.display = "none";
    // Actualizar índice y mostrar botones según corresponda
    actualizarBotones();
    // Si hay ranking, mostrar botón de ranking
    document.getElementById("btnRanking").style.display = "inline-flex";
  }
  if (data.respuestas) actualizarRankingBg(data.respuestas);
}

// ═══════════════════════════════════════════
// RANKING
// ═══════════════════════════════════════════

function actualizarRankingBg(todasRespuestas) {
  const acum = {};
  Object.values(todasRespuestas).forEach(pregResp => {
    Object.values(pregResp).forEach(r => {
      if (!r || !r.email) return;
      if (!acum[r.email]) acum[r.email] = { nombre:r.nombre||"?", fotoUrl:r.fotoUrl||"", fotoMostrar:r.fotoMostrar||"", pts:0 };
      acum[r.email].pts += (r.puntos || 0);
    });
  });
  rankingPrevio = acum;
}

function construirRanking(todasRespuestas) {
  actualizarRankingBg(todasRespuestas);
  renderRanking();
}

function renderRanking() {
  const ranking = Object.values(rankingPrevio).sort((a,b)=>b.pts-a.pts).slice(0,10);
  const grid = document.getElementById("rankGrid");
  if (!ranking.length) {
    grid.innerHTML = '<div style="color:var(--muted);text-align:center;font-size:20px;padding:40px;">Sin participantes aún</div>';
    return;
  }
  const medallas = ["🥇","🥈","🥉"];
  const posClase = ["pos-1","pos-2","pos-3"];
  grid.innerHTML = ranking.map((r, i) => {
    const fotoSrc = r.fotoMostrar || (r.fotoUrl ? convertirUrlDrive(r.fotoUrl) : "");
    const fallback = avatarFallback(r.nombre);
    const label = i < 3 ? medallas[i] : (i + 1);
    const pClass = i < 3 ? posClase[i] : "";
    return `
      <div class="rank-item ${pClass}" style="animation-delay:${i * 0.07}s">
        <div class="rank-pos">${label}</div>
        <img class="rank-foto" src="${fotoSrc || fallback}" alt="${r.nombre}" onerror="this.onerror=null;this.src='${fallback}'">
        <div class="rank-nombre">${r.nombre}</div>
        <div style="text-align:right">
          <div class="rank-pts">${r.pts}</div>
          <div class="rank-pts-label">PTS</div>
        </div>
      </div>`;
  }).join("");
}

// ═══════════════════════════════════════════
// CONTROLES ADMIN (desde proyector)
// ═══════════════════════════════════════════

// Lanzar primera pregunta (o relanzar si no hay ninguna activa)
window.lanzarPrimeraPregunta = async function() {
  if (!esAdmin) return;
  if (colaPreguntas.length === 0) { toast("No hay preguntas guardadas", "err"); return; }

  // Verificar que la asamblea está activa
  const snapActiva = await get(ref(db, "asamblea/activa"));
  if (!snapActiva.val()) { toast("Activa la asamblea primero desde el panel admin", "err"); return; }

  indiceActual = 0;
  await lanzarPreguntaDesdeCola(0);
};

// Lanzar siguiente pregunta (con countdown 3-2-1)
window.lanzarSiguientePregunta = async function() {
  if (!esAdmin) return;
  if (countdownActive) return;

  if (indiceActual >= colaPreguntas.length) {
    toast("No hay más preguntas", "err");
    return;
  }

  // Primero mostrar ranking actual brevemente
  renderRanking();
  showScreen("screenRanking");

  // Después de 3 segundos, iniciar countdown
  setTimeout(() => {
    iniciarCountdown(3, async () => {
      await lanzarPreguntaDesdeCola(indiceActual);
    });
  }, 3000);
};

// Cerrar pregunta manualmente
window.cerrarPreguntaManual = async function() {
  if (!esAdmin) return;
  await set(ref(db, "asamblea/preguntaActual/estado"), "cerrada");
  toast("Pregunta cerrada", "");
};

// Ver ranking manualmente
window.mostrarRankingManual = function() {
  renderRanking();
  showScreen("screenRanking");
  if (esAdmin) actualizarBotones();
};

// Finalizar asamblea
window.finalizarAsamblea = async function() {
  if (!esAdmin) return;
  const ok = confirm("¿Finalizar la asamblea? Los puntos se sumarán al ranking global.");
  if (!ok) return;

  try {
    // Acumular puntos en ranking global
    await acumularEnRankingGlobal();

    // Cerrar pregunta actual y marcar como finalizada
    await set(ref(db, "asamblea/preguntaActual/estado"), "cerrada");
    await set(ref(db, "asamblea/activa"), false);
    await set(ref(db, "asamblea/estado"), "finalizada");

    // Borrar respuestas después de acumular
    await remove(ref(db, "asamblea/respuestas"));

    preguntaNumActual = 0;
    indiceActual = 0;

    toast("🏁 Asamblea finalizada — puntos acumulados al ranking global", "ok");
  } catch(e) {
    console.error(e);
    toast("Error al finalizar: " + e.message, "err");
  }
};

// ═══════════════════════════════════════════
// ACUMULAR EN RANKING GLOBAL
// ═══════════════════════════════════════════

async function acumularEnRankingGlobal() {
  const snap = await get(ref(db, "asamblea/respuestas"));
  const respuestas = snap.val();
  if (!respuestas) return;

  const acum = {};
  Object.values(respuestas).forEach(pregResp => {
    Object.values(pregResp).forEach(r => {
      if (!r || !r.email) return;
      const key = r.email.replace(/[.#$\[\]]/g, "_");
      if (!acum[key]) acum[key] = { nombre: r.nombre || "?", email: r.email, fotoUrl: r.fotoUrl || "", pts: 0 };
      acum[key].pts += (r.puntos || 0);
    });
  });

  for (const key of Object.keys(acum)) {
    const prevSnap = await get(ref(db, "rankingGlobal/" + key));
    const prev = prevSnap.val() || { pts: 0 };
    await set(ref(db, "rankingGlobal/" + key), {
      nombre: acum[key].nombre,
      email: acum[key].email,
      fotoUrl: acum[key].fotoUrl || prev.fotoUrl || "",
      pts: (prev.pts || 0) + acum[key].pts,
      ultimaAsamblea: Date.now()
    });
  }
}

// ═══════════════════════════════════════════
// LANZAR PREGUNTA DESDE LA COLA
// ═══════════════════════════════════════════

async function lanzarPreguntaDesdeCola(idx) {
  if (idx >= colaPreguntas.length) return;

  const b = colaPreguntas[idx];
  preguntaNumActual++;
  await set(ref(db, "asamblea/preguntaNum"), preguntaNumActual);

  const pregunta = {
    id: "p_" + Date.now(),
    numero: preguntaNumActual,
    texto: b.texto,
    opciones: b.opciones,
    correcta: b.correcta,
    duracion: b.duracion,
    estado: "activa",
    ts: Date.now()
  };

  await set(ref(db, "asamblea/preguntaActual"), pregunta);
  indiceActual = idx + 1;
  toast("🚀 Pregunta " + preguntaNumActual + " lanzada", "ok");
}

// ═══════════════════════════════════════════
// COUNTDOWN 3-2-1
// ═══════════════════════════════════════════

function iniciarCountdown(n, cb) {
  if (countdownActive) return;
  countdownActive = true;
  showScreen("screenCountdown");
  let num = n;
  const el = document.getElementById("countNum");
  el.textContent = num;

  const iv = setInterval(() => {
    num--;
    if (num <= 0) {
      clearInterval(iv);
      countdownActive = false;
      if (cb) cb();
    } else {
      el.style.animation = "none";
      el.offsetHeight; // reflow
      el.style.animation = "countPop .8s cubic-bezier(.34,1.6,.64,1) both";
      el.textContent = num;
    }
  }, 1000);
}
