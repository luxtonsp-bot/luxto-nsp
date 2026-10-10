/**
 * admin.js — Módulo de Administración LUXTO-NSP (SDK modular)
 *
 * Funcionalidades:
 *   - Control del modo asamblea (toggle, lanzar/cerrar preguntas, ranking en vivo) — DELEGADO A asamblea-engine.js
 *   - Gestión de borradores (guardar/cargar/eliminar)
 *   - Ranking global acumulado (RTDB)
 *   - Gestión de líderes (cambiar roles, ver miembros por rol) — sincroniza /admins RTDB
 *   - Sugerencias y feedback
 *   - Snapshot histórico al finalizar asamblea (asambleas_kahoot + historico)
 */

import {
  auth,
  fsdb,
  rtdb,
  esc,
  serverNow,
  rtdbTS,
  RTDB_PATHS,
  isStaff,
  isCoordinator,
  ref,
  onValue,
  set,
  update,
  remove,
  get,
  push,
  runTransaction,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  getDocs,
  fsServerTimestamp,
  writeBatch,
  onAuthStateChanged,
  signOut,
} from "./firebase-init.js";
import {
  initAsambleaEngine,
  on as engineOn,
  getState as engineState,
  claimHost,
  releaseHost,
  isHost,
  setSesionCola,
  startSesion,
  nextPregunta,
  cerrarPregunta,
  mostrarRanking,
  finalizarSesion,
  apagarAsamblea,
  listPreguntas,
  savePregunta,
  deletePregunta,
  checkLateHostJoin,
  // KAHOOT Sessions
  createKahootSession,
  listKahootSessions,
  getKahootSession,
  activateKahootSession,
  finalizeKahootSession,
  addQuestionsToKahootSession,
  normalizeKahootSessionState,
  getKahootHistoryTimestamp,
  canAddQuestionsToKahootSession,
} from "./asamblea-engine.js";
import { createSerialQueue } from "./serial-queue.js";

/* ── Admins hardcodeados (seguridad temporal, migrar a reglas de Firestore en el futuro) ── */
const ADMINS = [
  "henry.alfaro1@unmsm.edu.pe",
  "paolosotil97@gmail.com",
  "jorgediego.123.2002@gmail.com",
  "gianfracamones@gmail.com",
  "alvarorodrigosalazar.2001@gmail.com",
];

async function syncCurrentUserAdminState() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const memberSnap = await getDoc(doc(fsdb, "members", user.uid));
    const rol = memberSnap.exists()
      ? memberSnap.data().rol || "miembro"
      : "miembro";
    const staffRoles = ["servidor", "apoyo", "coordinador"];

    if (staffRoles.includes(rol) || ADMINS.includes(user.email)) {
      const role = ADMINS.includes(user.email) ? "coordinador" : rol;
      await set(ref(rtdb, RTDB_PATHS.admins(user.uid)), {
        email: user.email || memberSnap.data()?.email || "",
        rol: role,
        ts: rtdbTS(),
      });
    } else {
      await remove(ref(rtdb, RTDB_PATHS.admins(user.uid)));
    }
  } catch (error) {
    console.warn("syncCurrentUserAdminState error:", error.message);
  }
}

const asambleaToggleQueue = createSerialQueue();
let rankingGlobalListener = null;

/* ── Auth ────────────────────────────────────────────── */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // Verificar si es admin (hardcodeado por ahora)
  if (!ADMINS.includes(user.email)) {
    // Permitir servidores, apoyos y coordinadores (verificar en Firestore)
    try {
      const memberSnap = await getDoc(doc(fsdb, "members", user.uid));
      if (!memberSnap.exists()) throw new Error("No member doc");
      const rol = memberSnap.data().rol;
      // Roles con acceso al panel admin: servidor, apoyo, coordinador
      if (rol !== "servidor" && rol !== "apoyo" && rol !== "coordinador")
        throw new Error("Not authorized");
      // Aplicar permisos según rol (centralizado)
      applyRolePermissions(rol);
      // Guardar rol para usar en UI (botón finalizar asamblea)
      window._userRol = rol;
    } catch (e) {
      toast("Acceso restringido", "err");
      setTimeout(() => (window.location.href = "dashboard.html"), 2000);
      return;
    }
  } else {
    // Admin hardcodeado → tratar como coordinador
    window._userRol = "coordinador";
    applyRolePermissions("coordinador");
  }

  await syncCurrentUserAdminState();
  inicializar();
});

window.cerrarSesion = async () => {
  await releaseHost();
  await signOut(auth);
  window.location.href = "index.html";
};

async function inicializar() {
  try {
    // Inicializar engine de asamblea
    await initAsambleaEngine();
    // Registrar como host (solo uno gana)
    await claimHost();
    escucharAsamblea();
    escucharBorradores();
    escucharRankingGlobal();
    // Verificar late host join
    setTimeout(() => checkLateHostJoin(), 1000);

    // Cargar sesiones KAHOOT preparadas
    if (window.loadKahootSessions) await window.loadKahootSessions();
    // Cargar banco de preguntas
    if (window.loadPreguntasBanco) await window.loadPreguntasBanco();

    // Debug: mostrar rol del usuario
    const user = auth.currentUser;
    if (user) {
      try {
        const { getFirestore, doc, getDoc } =
          await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const fsdb = getFirestore();
        const memberSnap = await getDoc(doc(fsdb, "members", user.uid));
        if (memberSnap.exists()) {
          const data = memberSnap.data();
          console.log(
            "inicializar: Usuario autenticado:",
            user.email,
            "| Rol:",
            data.rol,
            "| Nombre:",
            data.nombre,
          );
        } else {
          console.warn(
            "inicializar: No existe documento members para",
            user.uid,
          );
        }
      } catch (e) {
        console.error("inicializar: Error obteniendo rol:", e);
      }
    }
  } catch (e) {
    console.error("Error inicializando:", e);
    toast("Error al inicializar panel: " + e.message, "err");
  }
}

/* ── Utils ───────────────────────────────────────────── */
function toast(msg, tipo = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "show " + tipo;
  setTimeout(() => (t.className = ""), 3000);
}

function convertirUrlDrive(url) {
  if (!url) return "";
  if (url.includes("drive.google.com/thumbnail")) return url;
  const m =
    url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
    url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w160";
  return url;
}

function avatarFallbackAdmin(nombre) {
  const inicial = (nombre || "?").charAt(0).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='#2a2218'/><text x='40' y='52' text-anchor='middle' font-family='Outfit,sans-serif' font-size='32' font-weight='700' fill='#F5C518'>${inicial}</text></svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

function escaparHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ── Escuchar estado de la asamblea (RTDB via engine) ───────────────── */
function escucharAsamblea() {
  // Listener de fase
  engineOn("fase", (state) => {
    const activa = state.fase !== "apagada";
    const toggleInput = document.getElementById("toggleAsamblea");
    if (toggleInput && toggleInput.checked !== activa) {
      toggleInput.checked = activa;
    }
    actualizarEstadoUI(activa, state);
  });

  // Listener cola
  engineOn("cola", () => renderColaSesion());

  // Listener índice
  engineOn("indice", () => renderColaSesion());

  // Listener preguntaActual
  engineOn("preguntaActual", (state) => {
    const p = state.preguntaActual;
    if (p && state.fase === "pregunta") {
      mostrarPreguntaActiva(p, state);
    } else {
      document.getElementById("preguntaActivaCard").classList.remove("visible");
    }

    // Respuestas live
    if (p && state.respuestas && state.respuestas[p.id]) {
      const resps = Object.values(state.respuestas[p.id]);
      document.getElementById("statConectados").textContent = resps.length;
      document.getElementById("statAciertos").textContent = resps.filter(
        (r) => r.idx === p.correcta,
      ).length;
      mostrarRespuestasLive(resps, p);
      actualizarRanking(state.respuestas);
    } else {
      document.getElementById("statConectados").textContent = "0";
      document.getElementById("statAciertos").textContent = "0";
      document.getElementById("respLiveList").innerHTML =
        '<div class="resp-vacia">Esperando respuestas...</div>';
      document.getElementById("rankingCard").classList.remove("visible");
      document.getElementById("rankLista").innerHTML = "";
    }

    document.getElementById("statPreguntas").textContent = state.indice;
  });

  // Listener conectados
  engineOn("conectados", (state) => {
    if (state.fase === "lobby" || state.fase === "countdown") {
      document.getElementById("statConectados").textContent = Object.keys(
        state.conectados,
      ).length;
    }
  });
}

function actualizarEstadoUI(activa, state) {
  const label = document.getElementById("estadoLabel");
  const sub = document.getElementById("estadoSub");
  const btnFin = document.getElementById("btnFinalizar");
  const btnReset = document.getElementById("btnResetRanking");
  const btnIniciar = document.getElementById("btnIniciarSesion");
  const btnTomarControl = document.getElementById("btnTomarControl");
  const colaCard = document.getElementById("cola-sesion-card");

  if (!label || !sub) return;

  let esCoordinador = false;
  try {
    esCoordinador = window._userRol === "coordinador";
  } catch (e) {
    /* ignore */
  }

  if (activa) {
    const faseLabels = {
      lobby: "🟡 Lobby — esperando participantes",
      countdown: "🟠 Cuenta regresiva...",
      pregunta: "🟢 Pregunta activa",
      revelada: "🔵 Respuesta revelada",
      ranking: "🟣 Ranking parcial",
      podio: "🏆 Podio final",
    };
    label.textContent = faseLabels[state.fase] || "🟢 Activo";
    label.className = "estado-label on";
    sub.textContent =
      faseLabels[state.fase] || "Los miembros ya pueden ingresar a la asamblea";
    if (btnFin) btnFin.style.display = esCoordinador ? "inline-flex" : "none";
    if (btnReset) btnReset.style.display = "inline-flex";

    // Botones de control según fase y host status
    const soyHost = isHost();
    const hayHost = !!state.hostUid;

    // Botón "Iniciar sesión" solo en lobby y si soy host
    if (btnIniciar) {
      if (state.fase === "lobby" && soyHost) {
        btnIniciar.hidden = false;
      } else {
        btnIniciar.hidden = true;
      }
    }

    // Botón "Tomar control" si hay otro host y no soy yo, o si no hay host
    if (btnTomarControl) {
      if (!soyHost && hayHost) {
        btnTomarControl.hidden = false;
        btnTomarControl.textContent = "🤝 Tomar control";
      } else if (!hayHost) {
        btnTomarControl.hidden = false;
        btnTomarControl.textContent = "👑 Tomar control";
      } else {
        btnTomarControl.hidden = true;
      }
    }

    // Botones de acción de pregunta según fase
    const btnCerrar = document.querySelector(".pa-header .btn-danger");
    const btnSiguiente = document.querySelector(".pa-header .btn-ok");
    if (btnCerrar)
      btnCerrar.style.display =
        state.fase === "pregunta" && soyHost ? "inline-flex" : "none";
    if (btnSiguiente) {
      if ((state.fase === "revelada" || state.fase === "ranking") && soyHost) {
        btnSiguiente.style.display = "inline-flex";
        btnSiguiente.textContent =
          state.fase === "revelada" ? "📊 Ranking" : "Siguiente →";
      } else {
        btnSiguiente.style.display = "none";
      }
    }

    // Mostrar cola de sesión si hay preguntas cargadas
    if (colaCard) {
      if (state.cola && state.cola.length > 0) {
        colaCard.hidden = false;
        renderColaSesion();
      } else {
        colaCard.hidden = true;
      }
    }
  } else {
    label.textContent = "⚫ Inactivo";
    label.className = "estado-label off";
    sub.textContent =
      "Activa el modo, sube preguntas, y controla todo desde el proyector";
    if (btnFin) btnFin.style.display = "none";
    if (btnReset) btnReset.style.display = "none";
    if (btnIniciar) btnIniciar.hidden = true;
    if (btnTomarControl) btnTomarControl.hidden = true;
    if (colaCard) colaCard.hidden = true;
  }
}

/* ── Tomar control (host) ────────────────────────────────── */
window.tomarControl = async function () {
  try {
    const won = await claimHost();
    if (won) {
      toast("✅ Control tomado — eres el host", "ok");
    } else {
      toast("Otro admin tiene el control", "err");
    }
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  }
};

/* ── Toggle asamblea ───────────────────────────────────── */
window.toggleModoAsamblea = async function (activa) {
  const toggleInput = document.getElementById("toggleAsamblea");
  if (!toggleInput) return;

  const desiredState = !!activa;

  // Si el checkbox ya refleja el estado deseado, no salimos antes de ejecutar la acción.
  // El evento del navegador ya cambió el valor a 'checked' antes de llegar aquí.
  // El bloqueo previo era la causa de que el toggle pareciera no funcionar.
  if (toggleInput.checked !== desiredState) {
    toggleInput.checked = desiredState;
  }

  try {
    await asambleaToggleQueue.enqueue(async () => {
      if (desiredState) {
        await set(ref(rtdb, "asamblea/activa"), true);
        await set(ref(rtdb, RTDB_PATHS.fase), "lobby");
        await Promise.all([
          remove(ref(rtdb, "asamblea/respuestas")),
          remove(ref(rtdb, "asamblea/conectados")),
        ]);
        await Promise.all([
          set(ref(rtdb, RTDB_PATHS.indice), 0),
          set(ref(rtdb, RTDB_PATHS.acumulada), false),
        ]);
        toast("✅ Asamblea activada — lobby abierto", "ok");
      } else {
        await set(ref(rtdb, "asamblea/activa"), false);
        await apagarAsamblea();
        toast("Asamblea desactivada", "");
      }
    });
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  }
};

/* ── Banco de preguntas (UI para admin) ───────────────────── */
window.loadPreguntasBanco = async function () {
  const container = document.getElementById("preguntas-banco");
  if (!container) return;

  // Mostrar estado de carga
  container.innerHTML =
    '<p style="color:var(--muted); font-style:italic;">Cargando banco de preguntas...</p>';

  try {
    const preguntas = await listPreguntas();

    if (preguntas.length === 0) {
      container.innerHTML =
        '<p style="color:var(--muted); font-style:italic;">No hay preguntas en el banco. Crea una nueva.</p>';
      return;
    }
    container.innerHTML = preguntas
      .map(
        (p) => `
      <div class="banco-item" style="background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:8px; display:flex; gap:12px; align-items:flex-start;">
        <input type="checkbox" data-id="${esc(p.id)}" style="margin-top:4px;">
        <div style="flex:1;">
          <div style="font-weight:600; margin-bottom:4px;">${esc(p.texto)}</div>
          <div style="font-size:12px; color:var(--muted);">${(p.opciones || []).map((op, i) => `${String.fromCharCode(65 + i)}. ${esc(op)}`).join(" · ")}</div>
          <div style="font-size:11px; color:var(--muted);">⏱ ${p.duracion}s</div>
        </div>
        <button class="btn btn-danger" style="font-size:11px;padding:6px 10px;" onclick="deletePreguntaAdmin('${esc(p.id)}')">🗑</button>
      </div>
    `,
      )
      .join("");
  } catch (e) {
    console.error("loadPreguntasBanco error:", e);
    container.innerHTML = `<p style="color:var(--err);">Error cargando banco: ${e.message}</p>`;
    toast("Error cargando banco: " + e.message, "err");
  }
};

window.savePreguntaAdmin = async function () {
  const texto = document.getElementById("npTexto").value.trim();
  if (!texto) {
    toast("Escribe la pregunta primero", "err");
    return;
  }
  const opciones = ["opA", "opB", "opC", "opD"]
    .map((id) => document.getElementById(id).value.trim())
    .filter(Boolean);
  if (opciones.length < 2) {
    toast("Agrega al menos 2 opciones", "err");
    return;
  }
  const radio = document.querySelector('input[name="correcta"]:checked');
  if (!radio) {
    toast("Marca la respuesta correcta", "err");
    return;
  }
  const correcta = parseInt(radio.value);
  const duracion = parseInt(document.getElementById("npDuracion").value);
  try {
    await savePregunta({ texto, opciones, correcta, duracion });
    toast("✅ Pregunta guardada en banco", "ok");
    window.loadPreguntasBanco();
    document.getElementById("npTexto").value = "";
    ["opA", "opB", "opC", "opD"].forEach(
      (id) => (document.getElementById(id).value = ""),
    );
    document.querySelector('input[name="correcta"][value="0"]').checked = true;
    document.getElementById("npDuracion").value = "20";
  } catch (e) {
    toast("Error: " + e.message, "err");
  }
};

window.deletePreguntaAdmin = async function (id) {
  if (!confirm("¿Eliminar esta pregunta del banco?")) return;
  try {
    await deletePregunta(id);
    toast("Eliminada", "ok");
    window.loadPreguntasBanco();
  } catch (e) {
    toast("Error: " + e.message, "err");
  }
};

/* ── Cargar preguntas seleccionadas a la sesión (cola) ───────────── */
window.cargarColaSesion = async function () {
  const selected = Array.from(
    document.querySelectorAll("#preguntas-banco input[type=checkbox]:checked"),
  ).map((el) => el.dataset.id);
  if (selected.length === 0) {
    toast("Selecciona al menos una pregunta", "err");
    return;
  }
  try {
    await setSesionCola(selected);
    toast(`✅ ${selected.length} preguntas cargadas a la sesión`, "ok");
    window.loadPreguntasBanco();
    // Mostrar cola card
    const colaCard = document.getElementById("cola-sesion-card");
    if (colaCard) colaCard.hidden = false;
    renderColaSesion();
  } catch (e) {
    toast("Error: " + e.message, "err");
  }
};

/* ── Iniciar sesión (lobby -> countdown -> pregunta) ───────────── */
window.iniciarSesion = async function () {
  if (!isHost()) {
    toast("Otro admin controla la sesión", "err");
    return;
  }
  try {
    await startSesion();
    toast("🟢 Sesión iniciada — cuenta regresiva", "ok");
    // El host agenda countdown→pregunta y cierre automático via engine
  } catch (e) {
    toast("Error: " + e.message, "err");
  }
};

/* ── Mostrar cola de preguntas seleccionadas (orden) ───────────── */
function renderColaSesion() {
  const state = engineState();
  const container = document.getElementById("cola-sesion");
  if (!container) return;
  const cola = state.cola || [];
  const idx = state.indice || 0;
  if (cola.length === 0) {
    container.innerHTML =
      '<p style="color:var(--muted); font-style:italic;">No hay preguntas en la sesión. Carga desde el banco.</p>';
    return;
  }
  container.innerHTML = cola
    .map(
      (p, i) => `
    <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:${i < idx ? "rgba(45,186,111,.1)" : i === idx ? "rgba(245,197,24,.1)" : "rgba(255,255,255,.04)"}; border:1px solid ${i < idx ? "var(--ok)" : i === idx ? "var(--y)" : "var(--border)"}; border-radius:8px; margin-bottom:6px;">
      <span style="font-family:'Bebas Neue',sans-serif; font-size:18px; color:var(--y); min-width:28px;">${i + 1}</span>
      <span style="flex:1; font-weight:600;">${esc(p.texto)}</span>
      <span style="font-size:12px; color:var(--muted);">⏱ ${p.duracion}s</span>
      ${i < idx ? '<span style="color:var(--ok); font-weight:700;">✓</span>' : i === idx ? '<span class="live-badge">EN VIVO</span>' : ""}
    </div>
  `,
    )
    .join("");
}

/* ── Lanzar/avanzar pregunta (usa engine) ───────────────────── */
window.lanzarPregunta = async function () {
  if (!isHost()) {
    toast("Otro admin controla la sesión", "err");
    return;
  }
  try {
    await nextPregunta();
    toast("✅ Pregunta lanzada", "ok");
  } catch (e) {
    toast("Error: " + e.message, "err");
  }
};

/* ── Cerrar pregunta (usa engine — idempotente) ──────────────────── */
window.cerrarPregunta = async function () {
  if (!isHost()) {
    toast("Otro admin controla la sesión", "err");
    return;
  }
  try {
    await cerrarPregunta();
    toast("🔒 Pregunta cerrada — puntos calculados", "ok");
  } catch (e) {
    toast("Error: " + e.message, "err");
  }
};

/* ── Siguiente pregunta / mostrar ranking ───────────────────────── */
window.siguientePregunta = async function () {
  if (!isHost()) {
    toast("Otro admin controla la sesión", "err");
    return;
  }
  const state = engineState();
  if (state.fase === "revelada" || state.fase === "ranking") {
    try {
      await mostrarRanking();
      toast("📊 Ranking mostrado", "ok");
    } catch (e) {
      toast("Error: " + e.message, "err");
    }
  } else {
    try {
      await cerrarPregunta();
      setTimeout(async () => {
        if (isHost()) await nextPregunta();
      }, 2000);
    } catch (e) {
      toast("Error: " + e.message, "err");
    }
  }
};

/* ── Finalizar asamblea (con snapshot) — usa engine ─────────────────── */
window.finalizarAsamblea = async function () {
  try {
    const userSnap = await getDoc(doc(fsdb, "members", auth.currentUser.uid));
    if (!userSnap.exists() || userSnap.data().rol !== "coordinador") {
      toast("Solo los coordinadores pueden finalizar la asamblea", "err");
      return;
    }
  } catch (e) {
    toast("Error verificando permisos", "err");
    return;
  }

  const ok = confirm(
    "¿Finalizar la asamblea actual? Se guardará un snapshot histórico y se acumulará en rankingGlobal.",
  );
  if (!ok) return;

  try {
    await finalizarSesion();
    toast(
      "🏁 Asamblea finalizada · Snapshot guardado · RankingGlobal actualizado",
      "ok",
    );
  } catch (e) {
    console.error(e);
    toast("Error al finalizar asamblea", "err");
  }
};

/* ── Pregunta activa (UI) ─────────────────────────────── */
function mostrarPreguntaActiva(p, data) {
  const card = document.getElementById("preguntaActivaCard");
  if (!card) return;
  card.classList.add("visible");
  document.getElementById("paTexto").textContent = p.texto || "—";

  const opcionesDiv = document.getElementById("paOpciones");
  const letras = ["A", "B", "C", "D"];
  opcionesDiv.innerHTML = (p.opciones || [])
    .map(
      (op, i) =>
        `<span class="pa-opcion ${i === p.correcta ? "correcta" : ""}">${letras[i]}. ${op}</span>`,
    )
    .join("");
}

/* ── Respuestas en vivo ──────────────────────────────── */
function mostrarRespuestasLive(resps, p) {
  const lista = document.getElementById("respLiveList");
  if (!lista) return;
  const letras = ["A", "B", "C", "D"];
  lista.innerHTML = resps
    .map(
      (r) =>
        '<div class="resp-item">' +
        '<img class="resp-item-foto" src="' +
        avatarFallbackAdmin(r.nombre || "?") +
        '" alt="">' +
        '<div class="resp-item-nombre">' +
        escaparHTML(r.nombre || "Anónimo") +
        "</div>" +
        '<div class="resp-item-resp">' +
        (letras[r.idx] || "?") +
        "</div>" +
        '<div class="resp-item-pts">' +
        (r.idx === p.correcta ? "+" + (r.pts || 1) : "0") +
        "</div>" +
        "</div>",
    )
    .join("");
}

/* ── Ranking en vivo ─────────────────────────────────── */
function actualizarRanking(respuestas) {
  if (!respuestas) return;
  const pts = {};
  Object.values(respuestas).forEach((bloque) => {
    Object.values(bloque).forEach((r) => {
      const uid = r.uid || "anon";
      pts[uid] = (pts[uid] || 0) + (r.idx === r.correcta ? r.pts || 1 : 0);
    });
  });

  const ranking = Object.entries(pts)
    .map(([key, val]) => ({ key, pts: val }))
    .sort((a, b) => b.pts - a.pts);

  if (ranking.length === 0) {
    document.getElementById("rankingCard").classList.remove("visible");
    document.getElementById("rankLista").innerHTML = "";
    return;
  }

  document.getElementById("rankingCard").classList.add("visible");
  const lista = document.getElementById("rankLista");
  lista.innerHTML = ranking
    .map((r, i) => {
      const pos = i + 1;
      const posClass =
        pos === 1 ? "g1" : pos === 2 ? "g2" : pos === 3 ? "g3" : "";
      const itemClass =
        pos === 1 ? "top1" : pos === 2 ? "top2" : pos === 3 ? "top3" : "";
      return (
        '<div class="rank-item ' +
        itemClass +
        '">' +
        '<div class="rank-pos ' +
        posClass +
        '">' +
        pos +
        "</div>" +
        '<div class="rank-nombre">' +
        escaparHTML(r.key) +
        "</div>" +
        '<div class="rank-pts">' +
        r.pts +
        "</div>" +
        "</div>"
      );
    })
    .join("");
}

/* ── Ranking global ──────────────────────────────────── */
function escucharRankingGlobal() {
  if (rankingGlobalListener) return;
  try {
    rankingGlobalListener = onValue(
      ref(rtdb, "rankingGlobal"),
      (snap) => {
        const data = snap.val() || {};
        const lista = document.getElementById("rankingGlobalList");
        if (!lista) return;
        const entries = Object.entries(data).map(([key, v]) => ({
          key,
          nombre: v.nombre || "Anónimo",
          pts: v.pts || 0,
          fotoUrl: v.fotoUrl || "",
        }));
        entries.sort((a, b) => b.pts - a.pts);
        if (entries.length === 0) {
          lista.innerHTML =
            '<div class="resp-vacia">Aún no hay puntos acumulados</div>';
          return;
        }
        lista.innerHTML = entries
          .map((e, i) => {
            const pos = i + 1;
            const posClass =
              pos === 1 ? "g1" : pos === 2 ? "g2" : pos === 3 ? "g3" : "";
            const itemClass =
              pos === 1 ? "top1" : pos === 2 ? "top2" : pos === 3 ? "top3" : "";
            const fotoSrc = e.fotoUrl
              ? convertirUrlDrive(e.fotoUrl)
              : avatarFallbackAdmin(e.nombre);
            const fallback = avatarFallbackAdmin(e.nombre);
            return (
              '<div class="rank-item ' +
              itemClass +
              '">' +
              '<div class="rank-pos ' +
              posClass +
              '">' +
              pos +
              "</div>" +
              '<img src="' +
              fotoSrc +
              '" class="rank-foto" alt="" onerror="this.onerror=null;this.src=\'' +
              fallback +
              "'\">" +
              '<div class="rank-nombre">' +
              escaparHTML(e.nombre) +
              "</div>" +
              '<div><div class="rank-pts">' +
              e.pts +
              "</div>" +
              '<div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">pts</div></div>' +
              "</div>"
            );
          })
          .join("");
      },
      (error) => {
        console.warn("RTDB listener error (rankingGlobal):", error.message);
      },
    );
  } catch (e) {
    console.warn("RTDB onValue setup error (rankingGlobal):", e.message);
  }
}

/* ── Reiniciar ranking (asamblea actual) ────────────── */
window.reiniciarRanking = async function () {
  const ok = confirm(
    "¿Reiniciar el ranking de ESTA asamblea? Se borrarán todas las respuestas acumuladas.",
  );
  if (!ok) return;
  await remove(ref(rtdb, "asamblea/respuestas"));
  document.getElementById("statConectados").textContent = "0";
  document.getElementById("statAciertos").textContent = "0";
  document.getElementById("rankingCard").classList.remove("visible");
  toast("🔄 Ranking de la asamblea reiniciado", "ok");
};

/* ── Reiniciar ranking global ───────────────────────── */
window.reiniciarRankingGlobal = async function () {
  const ok = confirm(
    "¿Reiniciar el ranking GLOBAL? Se borrará el acumulado histórico de todas las asambleas.",
  );
  if (!ok) return;
  const ok2 = confirm(
    "⚠️ Última confirmación: ¿De verdad quieres borrar TODO el ranking global?",
  );
  if (!ok2) return;
  await remove(ref(rtdb, "rankingGlobal"));
  await remove(ref(rtdb, "asamblea/respuestas"));
  toast("♻️ Ranking global reiniciado", "ok");
};

/* ── Borradores (guardar/cargar/eliminar) ─────────── */
window.guardarBorrador = function () {
  const texto = document.getElementById("npTexto").value.trim();
  if (!texto) {
    toast("Escribe la pregunta primero", "err");
    return;
  }
  const opciones = ["opA", "opB", "opC", "opD"]
    .map((id) => document.getElementById(id).value.trim())
    .filter(Boolean);
  const radio = document.querySelector('input[name="correcta"]:checked');
  const duracion = parseInt(document.getElementById("npDuracion").value);
  push(ref(rtdb, RTDB_PATHS.borradores), {
    texto,
    opciones,
    correcta: radio ? parseInt(radio.value) : 0,
    duracion,
    ts: Date.now(),
  });
  toast("💾 Guardado", "ok");
};

function escucharBorradores() {
  try {
    onValue(
      ref(rtdb, RTDB_PATHS.borradores),
      (snap) => {
        const data = snap.val();
        const lista = document.getElementById("histLista");
        if (!lista) return;
        if (!data) {
          lista.innerHTML =
            '<div class="hist-vacio">No hay preguntas guardadas aún.</div>';
          return;
        }
        const letras = ["A", "B", "C", "D"];
        lista.innerHTML = Object.entries(data)
          .reverse()
          .map(
            ([key, p]) => `
        <div class="hist-item">
          <div style="flex:1">
            <div class="hist-item-txt">${p.texto}</div>
            <div class="hist-item-meta">
              ${(p.opciones || []).map((op, i) => `<span style="margin-right:8px;color:${i === p.correcta ? "#7fe8aa" : "rgba(255,248,231,.3)"}">${letras[i]}. ${op}</span>`).join("")}
              · ⏱ ${p.duracion}s
            </div>
          </div>
          <button class="btn btn-ghost" style="font-size:12px;padding:8px 14px;" onclick="cargarBorrador('${key}')">Cargar</button>
          <button class="btn btn-danger" style="font-size:12px;padding:8px 14px;" onclick="eliminarBorrador('${key}')">🗑</button>
        </div>`,
          )
          .join("");
      },
      (error) => {
        console.warn("RTDB listener error (borradores):", error.message);
      },
    );
  } catch (e) {
    console.warn("RTDB onValue setup error (borradores):", e.message);
  }
}

window.cargarBorrador = async function (key) {
  try {
    const snap = await get(ref(rtdb, RTDB_PATHS.borradores + "/" + key));
    const p = snap.val();
    if (!p) return;
    const npTexto = document.getElementById("npTexto");
    if (npTexto) npTexto.value = p.texto || "";
    ["opA", "opB", "opC", "opD"].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.value = p.opciones && p.opciones[i] ? p.opciones[i] : "";
    });
    if (p.correcta != null) {
      const r = document.querySelector(
        `input[name="correcta"][value="${p.correcta}"]`,
      );
      if (r) r.checked = true;
    }
    const npDuracion = document.getElementById("npDuracion");
    if (npDuracion) npDuracion.value = p.duracion || 20;
    toast("Pregunta cargada ✓", "ok");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    console.error(e);
    toast("Error al cargar borrador", "err");
  }
};

window.eliminarBorrador = function (key) {
  remove(ref(rtdb, RTDB_PATHS.borradores + "/" + key));
  toast("Eliminado", "");
};

/* ── Gestión de Líderes (Firestore) — sincroniza /admins RTDB ─────────────────── */
window.loadMembersByRole = async function () {
  try {
    const container = document.getElementById("members-by-role");
    if (!container) return;
    container.innerHTML = "<p>Cargando miembros...</p>";

    const membersSnap = await getDocs(collection(fsdb, "members"));
    const roles = { miembro: [], servidor: [], apoyo: [], coordinador: [] };

    membersSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const role = data.rol || "miembro";
      if (roles[role]) {
        roles[role].push({ id: docSnap.id, ...data });
      }
    });

    Object.values(roles).forEach((arr) =>
      arr.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")),
    );

    const roleLabels = {
      miembro: "Miembros",
      servidor: "Servidores",
      apoyo: "Apoyos",
      coordinador: "Coordinadores",
    };
    const roleColors = {
      miembro: "",
      servidor: "#4A8FA8",
      apoyo: "#C4869A",
      coordinador: "#F5C518",
    };

    let html = "";
    Object.entries(roles).forEach(([role, members]) => {
      html += `<div class="role-section" style="margin-bottom:20px;">`;
      html += `<h4 style="color:${roleColors[role] || "var(--muted)"}; margin-bottom:8px;">${roleLabels[role]} (${members.length})</h4>`;
      if (members.length === 0) {
        html += `<p style="color:var(--muted); font-style:italic;">No hay ${roleLabels[role].toLowerCase()}</p>`;
      } else {
        html += `<ul style="list-style:none; padding:0;">`;
        members.forEach((m) => {
          html += `<li style="padding:6px 12px; background:var(--bg3); border:1px solid var(--border); border-radius:8px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">`;
          html += `<span>${m.nombre || "Sin nombre"}</span>`;
          if (m.email)
            html += `<span style="font-size:12px; color:var(--muted);">${m.email}</span>`;
          html += `</li>`;
        });
        html += `</ul>`;
      }
      html += `</div>`;
    });

    container.innerHTML = html;
  } catch (e) {
    console.error("Error loading members by role:", e);
    document.getElementById("members-by-role").innerHTML =
      '<p style="color:var(--err)">Error cargando miembros</p>';
  }
};

window.loadMemberSelector = async function () {
  try {
    const container = document.getElementById("member-selector");
    if (!container) return;
    container.innerHTML = "<p>Cargando...</p>";

    const membersSnap = await getDocs(collection(fsdb, "members"));
    const members = [];
    membersSnap.forEach((docSnap) => {
      members.push({ id: docSnap.id, ...docSnap.data() });
    });
    members.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

    let html =
      '<select id="member-to-change" style="width:100%; padding:12px; background:var(--bg3) !important; border:1.5px solid var(--border) !important; border-radius:12px; font-family:Outfit,sans-serif; font-size:14px; color:var(--cream) !important; outline:none; -webkit-appearance:none; appearance:none;">';
    html +=
      '<option value="" style="background:var(--bg3); color:var(--cream);">-- Seleccione un miembro --</option>';
    members.forEach((m) => {
      html += `<option value="${m.id}" style="background:var(--bg3); color:var(--cream);">${m.nombre || "Sin nombre"}${m.email ? ` (${m.email})` : ""}</option>`;
    });
    html += "</select>";
    container.innerHTML = html;

    document
      .getElementById("member-to-change")
      .addEventListener("change", function () {
        if (this.value) {
          window.loadMemberDetails(this.value);
        } else {
          document.getElementById("role-change-form").style.display = "none";
        }
      });
  } catch (e) {
    console.error("Error loading member selector:", e);
    document.getElementById("member-selector").innerHTML =
      '<p style="color:var(--err)">Error cargando miembros</p>';
  }
};

window.loadMemberDetails = async function (memberId) {
  try {
    const memberSnap = await getDoc(doc(fsdb, "members", memberId));
    if (!memberSnap.exists()) {
      alert("Miembro no encontrado");
      return;
    }
    const data = memberSnap.data();
    document.getElementById("selected-member-name").textContent =
      data.nombre || "Sin nombre";
    document.getElementById("role-select").value = data.rol || "miembro";
    document.getElementById("role-change-form").style.display = "block";

    document.getElementById("update-role-button").onclick = async () => {
      const newRole = document.getElementById("role-select").value;
      await window.updateMemberRole(memberId, newRole);
    };
  } catch (e) {
    console.error(e);
    alert("Error cargando detalles del miembro");
  }
};

window.updateMemberRole = async function (memberId, newRole) {
  try {
    const userSnap = await getDoc(doc(fsdb, "members", auth.currentUser.uid));
    const userRole = userSnap.data().rol;

    const validRoles = ["miembro", "servidor", "apoyo", "coordinador"];
    if (!validRoles.includes(newRole)) {
      alert("Rol inválido");
      return;
    }

    if (newRole === "coordinador" && userRole !== "coordinador") {
      alert("Solo los coordinadores pueden asignar el rol de coordinador");
      return;
    }

    await updateDoc(doc(fsdb, "members", memberId), {
      rol: newRole,
      fechaActualizacionRol: fsServerTimestamp(),
    });

    // Sincronizar /admins RTDB
    const staffRoles = ["servidor", "apoyo", "coordinador"];
    if (staffRoles.includes(newRole)) {
      const memberSnap = await getDoc(doc(fsdb, "members", memberId));
      const email = memberSnap.exists() ? memberSnap.data().email : "";
      await set(ref(rtdb, RTDB_PATHS.admins(memberId)), {
        email,
        rol: newRole,
        ts: rtdbTS(),
      });
    } else {
      await remove(ref(rtdb, RTDB_PATHS.admins(memberId)));
    }

    // Mantener sincronizado también el acceso de este usuario actual en caso de cambios de rol
    if (auth.currentUser?.uid === memberId) {
      await syncCurrentUserAdminState();
    }

    document.getElementById("role-change-result").innerHTML = `
      <div style="color:var(--ok); padding:8px 0;">
        Rol actualizado exitosamente a ${newRole}
      </div>`;
    window.loadMembersByRole();
    setTimeout(() => {
      document.getElementById("member-to-change").value = "";
      document.getElementById("role-change-form").style.display = "none";
    }, 1500);
  } catch (e) {
    console.error(e);
    document.getElementById("role-change-result").innerHTML = `
      <div style="color:var(--err); padding:8px 0;">
        Error al actualizar rol: ${e.message}
      </div>`;
  }
};

/* ── Sugerencias y Feedback ────────────────────────── */
function sugerenciaTema(d) {
  return d.tema || d.suggestion_tema || "Sin tema";
}
function sugerenciaDesc(d) {
  return d.descripcion || d.suggestion || "Sin descripción";
}
function feedbackComent(d) {
  return d.comentario || d.comment || "Sin comentario";
}
function feedbackAsam(d) {
  return d.asambleaFecha || d.assembly_date || "No especificada";
}
function feedbackPuntos(d) {
  const p = d.puntuacion ?? d.rating ?? 0;
  const n = Math.max(0, Math.min(5, Math.round(Number(p) || 0)));
  return n;
}
function docFecha(d) {
  if (d.createdAt?.seconds)
    return new Date(d.createdAt.seconds * 1000).toLocaleString();
  if (d.fechaCreacion?.seconds)
    return new Date(d.fechaCreacion.seconds * 1000).toLocaleString();
  if (d.created_at) {
    const f = new Date(d.created_at);
    return isNaN(f) ? "Fecha desconocida" : f.toLocaleString();
  }
  return "Fecha desconocida";
}
function docNombre(d) {
  return d.nombre || d.name || "Anónimo";
}

window.loadSuggestions = async function loadSuggestions() {
  try {
    const container = document.getElementById("suggestions-list");
    if (!container) return;
    container.innerHTML = "<p>Cargando sugerencias...</p>";

    const snap = await getDocs(collection(fsdb, "suggestions"));

    if (snap.empty) {
      container.innerHTML =
        '<p style="color:var(--muted); font-style:italic;">No hay sugerencias aún.</p>';
      return;
    }

    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => {
      const fa =
        a.createdAt?.seconds ||
        (a.created_at ? new Date(a.created_at).getTime() / 1000 : 0) ||
        0;
      const fb =
        b.createdAt?.seconds ||
        (b.created_at ? new Date(b.created_at).getTime() / 1000 : 0) ||
        0;
      return fb - fa;
    });

    let html = '<ul style="list-style:none; padding:0;">';
    docs.forEach((d) => {
      const fecha = docFecha(d);
      html += `<li style="background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:12px; padding:14px 18px; margin-bottom:8px;">`;
      html += `<div style="font-weight:600; margin-bottom:4px;">${escaparHTML(sugerenciaTema(d))}</div>`;
      html += `<div style="font-size:13px; color:var(--muted); margin-bottom:4px;">${escaparHTML(sugerenciaDesc(d))}</div>`;
      html += `<div style="font-size:11px; color:var(--muted);">Por: ${escaparHTML(docNombre(d))} · ${fecha}</div>`;
      html += `</li>`;
    });
    html += "</ul>";
    container.innerHTML = html;
  } catch (e) {
    console.error("Error loading suggestions:", e);
    document.getElementById("suggestions-list").innerHTML =
      '<p style="color:var(--err)">Error cargando sugerencias</p>';
  }
};

window.loadFeedback = async function loadFeedback() {
  try {
    const container = document.getElementById("feedback-list");
    if (!container) return;
    container.innerHTML = "<p>Cargando feedback...</p>";

    const snap = await getDocs(collection(fsdb, "feedback"));

    if (snap.empty) {
      container.innerHTML =
        '<p style="color:var(--muted); font-style:italic;">No hay feedback aún.</p>';
      return;
    }

    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => {
      const fa =
        a.createdAt?.seconds ||
        (a.created_at ? new Date(a.created_at).getTime() / 1000 : 0) ||
        0;
      const fb =
        b.createdAt?.seconds ||
        (b.created_at ? new Date(b.created_at).getTime() / 1000 : 0) ||
        0;
      return fb - fa;
    });

    let html = '<ul style="list-style:none; padding:0;">';
    docs.forEach((d) => {
      const fecha = docFecha(d);
      const n = feedbackPuntos(d);
      const estrellas = "⭐".repeat(n) + "☆".repeat(5 - n);
      html += `<li style="background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:12px; padding:14px 18px; margin-bottom:8px;">`;
      html += `<div style="font-weight:600; margin-bottom:4px;">Asamblea: ${escaparHTML(feedbackAsam(d))}</div>`;
      html += `<div style="font-size:13px; color:var(--muted); margin-bottom:4px;">${escaparHTML(feedbackComent(d))}</div>`;
      html += `<div>${estrellas}</div>`;
      html += `<div style="font-size:11px; color:var(--muted);">Por: ${escaparHTML(docNombre(d))} · ${fecha}</div>`;
      html += `</li>`;
    });
    html += "</ul>";
    container.innerHTML = html;
  } catch (e) {
    console.error("Error loading feedback:", e);
    document.getElementById("feedback-list").innerHTML =
      '<p style="color:var(--err)">Error cargando feedback</p>';
  }
};

/* ── KAHOOT Sessions: Preparar, Activar, Finalizar ─────────── */

// Variable para guardar el ID de la sesión KAHOOT que se está preparando
let _kahootSessionEnPreparacion = null;

window.crearKahootSession = async function () {
  const titulo = document.getElementById("kahootTitulo").value.trim();
  const fecha = document.getElementById("kahootFecha").value;
  if (!titulo) {
    toast("Escribe un título para el KAHOOT", "err");
    return;
  }
  if (!fecha) {
    toast("Selecciona una fecha", "err");
    return;
  }
  try {
    toast("Creando sesión KAHOOT...", "");
    const sessionId = await createKahootSession({
      titulo,
      fechaAsamblea: fecha,
      creadoPor: auth.currentUser.uid,
    });
    _kahootSessionEnPreparacion = sessionId;
    toast(`✅ KAHOOT "${titulo}" creado`, "ok");
    document.getElementById("kahootTitulo").value = "";
    document.getElementById("kahootFecha").value = "";
    await window.loadKahootSessions();
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  }
};

window.loadKahootSessions = async function () {
  const select = document.getElementById("kahootSessionSelect");
  if (!select) return;
  try {
    select.innerHTML = '<option value="">-- Cargando sesiones... --</option>';
    const sessions = await listKahootSessions();
    select.innerHTML =
      '<option value="">-- Seleccionar sesión KAHOOT --</option>';
    select.onchange = () => window.verKahootSession();
    if (sessions.length === 0) {
      select.innerHTML +=
        '<option value="" disabled>No hay sesiones preparadas</option>';
      syncKahootAddButtonState(null);
      return;
    }

    const editableSession =
      sessions.find((s) => isKahootEditable(s)) || sessions[0];

    sessions.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      const fechaStr = s.fechaAsamblea ? ` (${s.fechaAsamblea})` : "";
      const estado = normalizeKahootSessionState(s.estado);
      opt.textContent = `${s.titulo}${fechaStr} — ${s.preguntas ? s.preguntas.length : 0} preguntas (${estado})`;
      select.appendChild(opt);
    });

    if (_kahootSessionEnPreparacion) {
      select.value = _kahootSessionEnPreparacion;
      _kahootSessionEnPreparacion = null;
      window.verKahootSession();
    } else if (editableSession) {
      select.value = editableSession.id;
      window.verKahootSession();
    } else {
      syncKahootAddButtonState(null);
    }

    const btnCargar = document.getElementById("btnCargarKahoot");
    const btnVer = document.getElementById("btnVerKahoot");
    if (btnCargar) btnCargar.style.display = "inline-flex";
    if (btnVer) btnVer.style.display = "inline-flex";
  } catch (e) {
    console.error(e);
    select.innerHTML = '<option value="">Error cargando sesiones</option>';
    syncKahootAddButtonState(null);
    toast("Error cargando sesiones: " + e.message, "err");
  }
};

function isKahootEditable(session) {
  return canAddQuestionsToKahootSession(session);
}

function syncKahootAddButtonState(session) {
  const btnAgregar = document.getElementById("btnAgregarAlKahoot");
  if (!btnAgregar) return;

  if (!session) {
    btnAgregar.style.display = "none";
    btnAgregar.disabled = true;
    btnAgregar.title = "Selecciona un KAHOOT";
    return;
  }

  const editable = isKahootEditable(session);
  btnAgregar.style.display = "inline-flex";
  btnAgregar.disabled = !editable;
  btnAgregar.title = editable
    ? "Agregar nuevas preguntas a este KAHOOT"
    : "Selecciona una sesión válida para editar";
  btnAgregar.style.opacity = editable ? "1" : "0.6";
}

window.verKahootSession = async function () {
  const select = document.getElementById("kahootSessionSelect");
  const infoDiv = document.getElementById("kahootSessionInfo");
  const countSpan = document.getElementById("kahootPreguntasCount");
  if (!select || !select.value) {
    toast("Selecciona una sesión primero", "err");
    syncKahootAddButtonState(null);
    return;
  }
  try {
    const session = await getKahootSession(select.value);
    if (!session) {
      toast("Sesión no encontrada", "err");
      syncKahootAddButtonState(null);
      return;
    }
    const estado = normalizeKahootSessionState(session.estado);
    const estadoLabel =
      estado === "preparada"
        ? "🟡 Preparada"
        : estado === "activa"
          ? "🟢 Activa"
          : estado === "finalizada"
            ? "🔵 Finalizada"
            : estado;
    infoDiv.innerHTML = `
      <strong>${esc(session.titulo)}</strong> ${session.fechaAsamblea ? ` — ${session.fechaAsamblea}` : ""}<br>
      Estado: ${estadoLabel} · Preguntas: ${session.preguntas ? session.preguntas.length : 0} · Creado: ${session.creadoEn ? new Date(session.creadoEn.seconds * 1000).toLocaleString() : "N/A"}
    `;
    infoDiv.style.display = "block";
    if (countSpan)
      countSpan.textContent = `${session.preguntas ? session.preguntas.length : 0} preguntas en esta sesión`;
    syncKahootAddButtonState(session);
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
    syncKahootAddButtonState(null);
  }
};

window.agregarPreguntasAKahoot = async function () {
  const select = document.getElementById("kahootSessionSelect");
  if (!select || !select.value) {
    toast("Selecciona una sesión KAHOOT primero", "err");
    return;
  }

  const session = await getKahootSession(select.value).catch(() => null);
  if (!session) {
    toast("La sesión seleccionada ya no existe", "err");
    return;
  }

  if (!isKahootEditable(session)) {
    const editableSession = (await listKahootSessions()).find((s) =>
      isKahootEditable(s),
    );
    if (editableSession) {
      select.value = editableSession.id;
      await window.verKahootSession();
      toast(
        "Se cambió a la sesión válida disponible para agregar preguntas",
        "err",
      );
      return;
    }
    toast("Selecciona una sesión válida para editar", "err");
    return;
  }

  const selected = Array.from(
    document.querySelectorAll("#preguntas-banco input[type=checkbox]:checked"),
  ).map((el) => el.dataset.id);
  if (selected.length === 0) {
    toast("Selecciona al menos una pregunta del banco", "err");
    return;
  }
  try {
    toast(`Agregando ${selected.length} preguntas...`, "");
    const result = await addQuestionsToKahootSession(select.value, selected);
    toast(
      `✅ ${result.added} preguntas agregadas al KAHOOT (total: ${result.total})`,
      "ok",
    );
    window.verKahootSession();
    window.loadPreguntasBanco();
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  }
};

window.activarKahootSession = async function () {
  const select = document.getElementById("kahootSessionSelect");
  if (!select || !select.value) {
    toast("Selecciona una sesión KAHOOT primero", "err");
    return;
  }
  try {
    toast("Activando sesión KAHOOT...", "");
    await activateKahootSession(select.value);
    toast("✅ Sesión KAHOOT activada — lista en proyector y celulares", "ok");
    // Cambiar a vista de control sesión activa
    window.loadKahootSessions();
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  }
};

window.finalizarKahootSession = async function () {
  // Solo coordinadores pueden finalizar
  try {
    const userSnap = await getDoc(doc(fsdb, "members", auth.currentUser.uid));
    if (!userSnap.exists() || userSnap.data().rol !== "coordinador") {
      toast("Solo los coordinadores pueden finalizar el KAHOOT", "err");
      return;
    }
  } catch (e) {
    toast("Error verificando permisos", "err");
    return;
  }
  const ok = confirm(
    "¿Finalizar el KAHOOT activo? Se guardará el snapshot histórico completo y se actualizará el ranking global.",
  );
  if (!ok) return;
  try {
    await finalizeKahootSession();
    toast(
      "🏁 KAHOOT finalizado · Snapshot histórico guardado · RankingGlobal actualizado",
      "ok",
    );
    // Recargar lista de sesiones y historial
    window.loadKahootSessions();
    window.loadKahootHistorial();
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  }
};

window.loadKahootHistorial = async function () {
  const container = document.getElementById("kahoot-historial");
  if (!container) return;
  container.innerHTML =
    '<p style="color:var(--muted); font-style:italic;">Cargando historial...</p>';
  try {
    // Leer del histórico anual (colección historico/{anio}/kahoot_sessions)
    const { collection, query, orderBy, getDocs, doc, getDoc } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const { fsdb } = await import("./firebase-init.js");
    const anioActual = new Date().getFullYear();
    const histRef = collection(
      fsdb,
      "historico",
      String(anioActual),
      "kahoot_sessions",
    );
    let snap;
    try {
      snap = await getDocs(query(histRef, orderBy("finalizadaEn", "desc")));
    } catch (e) {
      snap = await getDocs(query(histRef, orderBy("finalizadoEn", "desc")));
    }
    const sesiones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (sesiones.length === 0) {
      container.innerHTML =
        '<p style="color:var(--muted); font-style:italic;">No hay KAHOOTs finalizados este año.</p>';
      return;
    }
    container.innerHTML = sesiones
      .map((s) => {
        const ts = getKahootHistoryTimestamp(s);
        const fechaFinal =
          ts && ts.seconds
            ? new Date(ts.seconds * 1000).toLocaleString()
            : ts
              ? new Date(ts * 1000).toLocaleString()
              : "N/A";
        return `
      <div class="banco-item" style="background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:12px; padding:16px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="flex:1; min-width:200px;">
            <div style="font-weight:600; margin-bottom:4px;">${esc(s.titulo)}</div>
            <div style="font-size:12px; color:var(--muted);">
              Fecha: ${s.fechaAsamblea || "N/A"} · Finalizado: ${fechaFinal} · ${s.preguntas ? s.preguntas.length : 0} preguntas · ${s.participantes ? Object.keys(s.participantes).length : 0} participantes
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-ghost" onclick="verDetalleKahootHistorico('${s.id}')" style="font-size:12px;">👁️ Ver detalle</button>
            <button class="btn btn-primary" onclick="reusarPreguntasKahoot('${s.id}')" style="font-size:12px;">♻️ Reutilizar preguntas</button>
          </div>
        </div>
      </div>
    `;
      })
      .join("");
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p style="color:var(--err);">Error cargando historial: ${e.message}</p>`;
    toast("Error cargando historial: " + e.message, "err");
  }
};

window.verDetalleKahootHistorico = async function (sessionId) {
  try {
    const { collection, doc, getDoc } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const { fsdb } = await import("./firebase-init.js");
    const anioActual = new Date().getFullYear();
    const snap = await getDoc(
      doc(fsdb, "historico", String(anioActual), "kahoot_sessions", sessionId),
    );
    if (!snap.exists()) {
      toast("Sesión no encontrada", "err");
      return;
    }
    const s = snap.data();
    const ts = getKahootHistoryTimestamp(s);
    const fechaFinal =
      ts && ts.seconds
        ? new Date(ts.seconds * 1000).toLocaleString()
        : ts
          ? new Date(ts * 1000).toLocaleString()
          : "N/A";
    let html = `<h4 style="margin-bottom:12px; color:var(--y);">${esc(s.titulo)}</h4>`;
    html += `<p style="color:var(--muted); margin-bottom:16px;">Fecha: ${s.fechaAsamblea || "N/A"} · Finalizado: ${fechaFinal}</p>`;
    html += `<p><strong>Ranking final:</strong></p><ul style="margin-left:20px;">`;
    if (s.rankingFinal && s.rankingFinal.length > 0) {
      s.rankingFinal.forEach((r, i) => {
        html += `<li>${i + 1}. ${esc(r.nombre || r.uid)} — ${r.pts} pts</li>`;
      });
    } else {
      html += `<li>No hay ranking</li>`;
    }
    html += `</ul>`;
    html += `<p><strong>Preguntas (${s.preguntas ? s.preguntas.length : 0}):</strong></p><ul style="margin-left:20px;">`;
    if (s.preguntas && s.preguntas.length > 0) {
      s.preguntas.forEach((p, i) => {
        html += `<li>${i + 1}. ${esc(p.texto)} (⏱ ${p.duracion}s) — Correcta: ${String.fromCharCode(65 + (p.correcta || 0))}</li>`;
      });
    } else {
      html += `<li>Sin preguntas</li>`;
    }
    html += `</ul>`;
    alert(html); // Simple, usar modal en el futuro
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  }
};

window.reusarPreguntasKahoot = async function (sessionId) {
  try {
    const { collection, doc, getDoc } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const { fsdb } = await import("./firebase-init.js");
    const anioActual = new Date().getFullYear();
    const snap = await getDoc(
      doc(fsdb, "historico", String(anioActual), "kahoot_sessions", sessionId),
    );
    if (!snap.exists()) {
      toast("Sesión no encontrada", "err");
      return;
    }
    const s = snap.data();
    if (!s.preguntas || s.preguntas.length === 0) {
      toast("Esta sesión no tiene preguntas", "err");
      return;
    }
    // Crear nueva sesión KAHOOT con estas preguntas
    const nuevoTitulo = prompt(
      "Título para la nueva sesión (reutilizando preguntas):",
      s.titulo + " (reutilizado)",
    );
    if (!nuevoTitulo) return;
    const nuevaFecha = prompt(
      "Fecha para la nueva sesión (YYYY-MM-DD):",
      new Date().toISOString().split("T")[0],
    );
    if (!nuevaFecha) return;
    const newSessionId = await createKahootSession({
      titulo: nuevoTitulo,
      fechaAsamblea: nuevaFecha,
      creadoPor: auth.currentUser.uid,
      preguntaIds: s.preguntas.map((p) => p.bancoId),
    });
    _kahootSessionEnPreparacion = newSessionId;
    toast(
      `✅ Nueva sesión creada con ${s.preguntas.length} preguntas reutilizadas`,
      "ok",
    );
    window.loadKahootSessions();
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  }
};

/* ── Tab change handler (called from inline script) ────────── */
window.onAdminTabChange = function (tabName) {
  if (tabName === "gestion-lideres") {
    if (window.loadMembersByRole) window.loadMembersByRole();
    if (window.loadMemberSelector) window.loadMemberSelector();
  } else if (tabName === "sugerencias-feedback") {
    if (window.loadSuggestions) window.loadSuggestions();
    if (window.loadFeedback) window.loadFeedback();
  } else if (tabName === "asamblea") {
    if (window.loadPreguntasBanco) window.loadPreguntasBanco();
    if (window.loadKahootSessions) window.loadKahootSessions();
    if (window.loadKahootHistorial) window.loadKahootHistorial();
  }
};

/* ── Permisos por rol (centralizado) ── */
function applyRolePermissions(rol) {
  const currentTab =
    document.querySelector(".tab-content.active")?.id || "asamblea";
  const isCoord = rol === "coordinador";
  const buttonIds = ["tab-gestion-lideres", "tab-sugerencias-feedback"];
  buttonIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = !isCoord;
  });

  const restricted = new Set(["gestion-lideres", "sugerencias-feedback"]);
  document.querySelectorAll(".tab-content").forEach((el) => {
    const shouldBeVisible = !restricted.has(el.id) || isCoord;
    el.hidden = !shouldBeVisible;
    el.classList.toggle(
      "active",
      el.id === (isCoord ? currentTab : "asamblea"),
    );
  });

  document.querySelectorAll(".tab-button").forEach((el) => {
    const isActive =
      el.getAttribute("onclick")?.includes(`'${currentTab}'`) ||
      el.classList.contains("active");
    el.classList.toggle("active", isActive && el.hidden !== true);
  });

  if (!isCoord && document.getElementById("asamblea")) {
    document.getElementById("asamblea").classList.add("active");
    const btn = document.querySelector(".tab-button[onclick*='asamblea']");
    if (btn) btn.classList.add("active");
  }

  window._userRol = rol;
}

/* ── openTab protegido ── */
window.openTab = function (evt, tabName) {
  const restricted = ["gestion-lideres", "sugerencias-feedback"];
  if (restricted.includes(tabName) && window._userRol !== "coordinador") {
    if (document.getElementById("asamblea")) {
      document.getElementById("asamblea").classList.add("active");
      const defaultBtn = document.querySelector(
        ".tab-button[onclick*='asamblea']",
      );
      if (defaultBtn) defaultBtn.classList.add("active");
    }
    return;
  }

  document.querySelectorAll(".tab-content").forEach((el) => {
    const isAllowed =
      !restricted.includes(el.id) || window._userRol === "coordinador";
    el.hidden = !isAllowed;
    el.classList.toggle("active", isAllowed && el.id === tabName);
  });

  document.querySelectorAll(".tab-button").forEach((el) => {
    const onclick = el.getAttribute("onclick") || "";
    const isSelected = onclick.includes(`'${tabName}'`);
    el.classList.toggle("active", isSelected);
  });

  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add("active");
  }
  if (window.onAdminTabChange) window.onAdminTabChange(tabName);
};
