/**
 * admin.js — Módulo de Administración LUXTO-NSP (SDK modular)
 *
 * Funcionalidades:
 *   - Control del modo asamblea (toggle, lanzar/cerrar preguntas, ranking en vivo)
 *   - Gestión de borradores (guardar/cargar/eliminar)
 *   - Ranking global acumulado (RTDB)
 *   - Gestión de líderes (cambiar roles, ver miembros por rol)
 *   - Sugerencias y feedback
 *   - Snapshot histórico al finalizar asamblea (asambleas_kahoot + historico)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase, ref, onValue, set, update, remove, push, serverTimestamp as rtdbTS, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ── Config Firebase ─────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyDLl5CLvdaSzZ_K6VXrlJzm4VvN9HQouJo",
  authDomain:        "luxto-nsp.firebaseapp.com",
  projectId:         "luxto-nsp",
  storageBucket:     "luxto-nsp.firebasestorage.app",
  messagingSenderId: "3542836325",
  appId:             "1:3542836325:web:cf65cd50edcc431500d28c",
  databaseURL:       "https://luxto-nsp-default-rtdb.firebaseio.com"
};

const app    = initializeApp(firebaseConfig);
const auth   = getAuth(app);
const fsdb   = getFirestore(app);
const rtdb   = getDatabase(app);

/* ── Admins hardcodeados (seguridad temporal, migrar a reglas de Firestore en el futuro) ── */
const ADMINS = [
  "henry.alfaro1@unmsm.edu.pe",
  "paolosotil97@gmail.com",
  "jorgediego.123.2002@gmail.com",
  "gianfracamones@gmail.com",
  "alvarorodrigosalazar.2001@gmail.com"
];

let preguntaNumActual = 0;
let toggleEnProceso = false;
let rankingGlobalListener = null;

/* ── Utils ───────────────────────────────────────────── */
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

function avatarFallbackAdmin(nombre) {
  const inicial = (nombre || "?").charAt(0).toUpperCase();
  return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><circle cx='40' cy='40' r='40' fill='%232a2218'/><text x='40' y='52' text-anchor='middle' font-family='Outfit,sans-serif' font-size='32' font-weight='700' fill='%23F5C518'>" + inicial + "</text></svg>";
}

function escaparHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ── Auth ────────────────────────────────────────────── */
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }

  // Verificar si es admin (hardcodeado por ahora)
  if (!ADMINS.includes(user.email)) {
    // Permitir líderes y coordinadores (verificar en Firestore)
    try {
      const memberSnap = await getDoc(doc(fsdb, "members", user.uid));
      if (!memberSnap.exists()) throw new Error("No member doc");
      const rol = memberSnap.data().rol;
      if (rol !== "lider" && rol !== "coordinador") throw new Error("Not authorized");
      // Si es líder o coordinador, continuar (líder ve solo modo asamblea)
      if (rol === "coordinador") {
        document.getElementById("gestion-lideres").style.display = "block";
        document.getElementById("sugerencias-feedback").style.display = "block";
      }
      // Guardar rol para usar en UI (botón finalizar asamblea)
      window._userRol = rol;
    } catch (e) {
      toast("Acceso restringido", "err");
      setTimeout(() => window.location.href = "dashboard.html", 2000);
      return;
    }
  } else {
    // Admin hardcodeado → tratar como coordinador
    window._userRol = "coordinador";
  }
  inicializar();
});

window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

async function inicializar() {
  try {
    const snap = await get(ref(rtdb, "asamblea/preguntaNum"));
    preguntaNumActual = snap.val() || 0;
  } catch (e) { /* ignore */ }
  escucharAsamblea();
  escucharBorradores();
  escucharRankingGlobal();
}

/* ── Escuchar estado de la asamblea (RTDB) ───────────────── */
function escucharAsamblea() {
  onValue(ref(rtdb, "asamblea"), (snap) => {
    const data = snap.val() || {};

    if (!toggleEnProceso) {
      document.getElementById("toggleAsamblea").checked = data.activa === true;
    }
    actualizarEstadoUI(data.activa === true);

    const p = data.preguntaActual;
    if (p && p.estado === "activa") {
      mostrarPreguntaActiva(p, data);
    } else {
      document.getElementById("preguntaActivaCard").classList.remove("visible");
    }

    if (p && data.respuestas && data.respuestas[p.id]) {
      const resps = Object.values(data.respuestas[p.id]);
      document.getElementById("statConectados").textContent = resps.length;
      document.getElementById("statAciertos").textContent = resps.filter(r => r.correcta).length;
      mostrarRespuestasLive(resps, p);
      actualizarRanking(data.respuestas);
    } else {
      document.getElementById("statConectados").textContent = "0";
      document.getElementById("statAciertos").textContent = "0";
      document.getElementById("respLiveList").innerHTML = '<div class="resp-vacia">Esperando respuestas...</div>';
      document.getElementById("rankingCard").classList.remove("visible");
      document.getElementById("rankLista").innerHTML = "";
    }

    document.getElementById("statPreguntas").textContent = preguntaNumActual;
  });
}

function actualizarEstadoUI(activa) {
  const label = document.getElementById("estadoLabel");
  const sub = document.getElementById("estadoSub");
  const btnFin = document.getElementById("btnFinalizar");
  const btnReset = document.getElementById("btnResetRanking");

  if (!label || !sub) return;

  // Verificar si es coordinador (para botón finalizar)
  let esCoordinador = false;
  try {
    // El rol se verificó en onAuthStateChanged, guardarlo en variable global
    esCoordinador = window._userRol === "coordinador";
  } catch (e) { /* ignore */ }

  if (activa) {
    label.textContent = "🟢 Activo";
    label.className = "estado-label on";
    sub.textContent = "Los miembros ya pueden ingresar a la asamblea";
    if (btnFin) btnFin.style.display = esCoordinador ? "inline-flex" : "none";
    if (btnReset) btnReset.style.display = "inline-flex";
  } else {
    label.textContent = "⚫ Inactivo";
    label.className = "estado-label off";
    sub.textContent = "Activa el modo, sube preguntas, y controla todo desde el proyector";
    if (btnFin) btnFin.style.display = "none";
    if (btnReset) btnReset.style.display = "none";
  }
}

/* ── Toggle asamblea ───────────────────────────────────── */
window.toggleModoAsamblea = async function (activa) {
  if (toggleEnProceso) return;
  toggleEnProceso = true;
  document.getElementById("toggleAsamblea").checked = activa;
  try {
    if (activa) {
      await remove(ref(rtdb, "asamblea/respuestas"));
      await update(ref(rtdb, "asamblea"), {
        activa: true,
        estado: "activa",
        preguntaNum: 0,
        preguntaActual: {
          estado: "esperando", numero: 0,
          texto: "", opciones: [], correcta: -1, duracion: 20,
          id: "waiting_" + Date.now(), ts: Date.now()
        }
      });
      preguntaNumActual = 0;
      document.getElementById("rankingCard").classList.remove("visible");
      document.getElementById("rankLista").innerHTML = "";
    } else {
      await update(ref(rtdb, "asamblea"), {
        activa: false,
        estado: "finalizada",
        "preguntaActual/estado": "esperando"
      });
      document.getElementById("rankingCard").classList.remove("visible");
    }
    toast(activa ? "✅ Asamblea activada (ranking en blanco)" : "Asamblea desactivada", activa ? "ok" : "");
  } catch (e) {
    console.error(e);
    toast("Error: " + e.message, "err");
  } finally {
    toggleEnProceso = false;
  }
};

/* ── Lanzar pregunta ───────────────────────────────────── */
window.lanzarPregunta = async function () {
  // Cargar desde el formulario o desde el borrador más reciente
  const texto = document.getElementById("npTexto").value.trim();
  if (!texto) { toast("Escribe la pregunta primero", "err"); return; }

  const opciones = ["opA", "opB", "opC", "opD"]
    .map(id => document.getElementById(id).value.trim())
    .filter(Boolean);
  if (opciones.length < 2) { toast("Agrega al menos 2 opciones", "err"); return; }

  const radio = document.querySelector('input[name="correcta"]:checked');
  if (!radio) { toast("Marca la respuesta correcta", "err"); return; }

  const correcta = parseInt(radio.value);
  const duracion = parseInt(document.getElementById("npDuracion").value);
  preguntaNumActual++;

  const preguntaId = "q_" + Date.now();
  const pregunta = {
    id: preguntaId,
    numero: preguntaNumActual,
    texto,
    opciones,
    correcta,
    duracion,
    estado: "activa",
    ts: Date.now()
  };

  await set(ref(rtdb, "asamblea/preguntaNum"), preguntaNumActual);
  await set(ref(rtdb, "asamblea/preguntaActual"), pregunta);

  // Limpiar respuestas previas
  await remove(ref(rtdb, "asamblea/respuestas"));

  // Iniciar timer para cerrar automáticamente
  setTimeout(() => {
    cerrarPregunta();
  }, duracion * 1000);

  toast("✅ Pregunta lanzada", "ok");
};

/* ── Cerrar pregunta ──────────────────────────────────── */
window.cerrarPregunta = async function () {
  try {
    const snap = await get(ref(rtdb, "asamblea/preguntaActual"));
    const p = snap.val();
    if (p && p.estado === "activa") {
      await update(ref(rtdb, "asamblea/preguntaActual"), { estado: "cerrada" });
      toast("🔒 Pregunta cerrada", "");
    }
  } catch (e) {
    console.error(e);
  }
};

/* ── Siguiente pregunta ───────────────────────────────── */
window.siguientePregunta = async function () {
  try {
    await update(ref(rtdb, "asamblea/preguntaActual"), {
      estado: "esperando",
      texto: "",
      opciones: [],
      correcta: -1,
      id: "waiting_" + Date.now()
    });
    toast("Listo para la siguiente pregunta", "");
  } catch (e) {
    console.error(e);
  }
};

/* ── Finalizar asamblea (con snapshot) ─────────────────── */
window.finalizarAsamblea = async function () {
  // Solo coordinadores pueden finalizar (escribe en historico/ que requiere isCoordinator)
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

  const ok = confirm("¿Finalizar la asamblea actual? Se guardará un snapshot histórico.");
  if (!ok) return;

  try {
    // 1. Desactivar asamblea en RTDB
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split("T")[0]; // YYYY-MM-DD

    await remove(ref(rtdb, "asamblea/respuestas"));
    await update(ref(rtdb, "asamblea"), {
      activa: false,
      estado: "finalizada",
      "preguntaActual/estado": "esperando"
    });

    // 2. Guardar snapshot en Firestore (asambleas_kahoot/{fecha})
    const rankingSnap = await get(ref(rtdb, "rankingGlobal"));
    const rankingData = rankingSnap.val() || {};

    const preguntasSnap = await get(ref(rtdb, "borradores"));
    const preguntasData = preguntasSnap.val() || {};

    await setDoc(doc(fsdb, "asambleas_kahoot", hoyStr), {
      fecha: hoyStr,
      rankingGlobal: rankingData,
      totalPreguntas: preguntaNumActual,
      creadoEn: serverTimestamp()
    });

    // 3. Copiar a historico/{anio}/asambleas_kahoot/{fecha}
    await setDoc(doc(fsdb, "historico", String(hoy.getFullYear()), "asambleas_kahoot", hoyStr), {
      fecha: hoyStr,
      rankingGlobal: rankingData,
      totalPreguntas: preguntaNumActual,
      creadoEn: serverTimestamp()
    });

    document.getElementById("rankingCard").classList.remove("visible");
    toast("🏁 Asamblea finalizada · Snapshot guardado", "ok");
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
    .map((op, i) => `<span class="pa-opcion ${i === p.correcta ? 'correcta' : ''}">${letras[i]}. ${op}</span>`)
    .join("");
}

/* ── Respuestas en vivo ──────────────────────────────── */
function mostrarRespuestasLive(resps, p) {
  const lista = document.getElementById("respLiveList");
  if (!lista) return;
  const letras = ["A", "B", "C", "D"];
  lista.innerHTML = resps.map(r =>
    '<div class="resp-item">' +
      '<img class="resp-item-foto" src="' + avatarFallbackAdmin(r.nombre || "?") + '" alt="">' +
      '<div class="resp-item-nombre">' + escaparHTML(r.nombre || r.email || "Anónimo") + '</div>' +
      '<div class="resp-item-resp">' + (letras[r.respuesta] || "?") + '</div>' +
      '<div class="resp-item-pts">' + (r.correcta ? "+" + (r.pts || 1) : "0") + '</div>' +
    '</div>'
  ).join("");
}

/* ── Ranking en vivo ─────────────────────────────────── */
function actualizarRanking(respuestas) {
  if (!respuestas) return;
  const pts = {};
  Object.values(respuestas).forEach(bloque => {
    Object.values(bloque).forEach(r => {
      const uid = r.uid || r.email || "anon";
      pts[uid] = (pts[uid] || 0) + (r.correcta ? (r.pts || 1) : 0);
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
  lista.innerHTML = ranking.map((r, i) => {
    const pos = i + 1;
    const posClass = pos === 1 ? "g1" : pos === 2 ? "g2" : pos === 3 ? "g3" : "";
    const itemClass = pos === 1 ? "top1" : pos === 2 ? "top2" : pos === 3 ? "top3" : "";
    return '<div class="rank-item ' + itemClass + '">' +
      '<div class="rank-pos ' + posClass + '">' + pos + '</div>' +
      '<div class="rank-nombre">' + escaparHTML(r.key) + '</div>' +
      '<div class="rank-pts">' + r.pts + '</div>' +
    '</div>';
  }).join("");
}

/* ── Ranking global ──────────────────────────────────── */
function escucharRankingGlobal() {
  if (rankingGlobalListener) return;
  rankingGlobalListener = onValue(ref(rtdb, "rankingGlobal"), (snap) => {
    const data = snap.val() || {};
    const lista = document.getElementById("rankingGlobalList");
    if (!lista) return;
    const entries = Object.entries(data).map(([key, v]) => ({
      key,
      nombre: v.nombre || v.email || "Anónimo",
      pts: v.pts || 0,
      fotoUrl: v.fotoUrl || "",
      email: v.email || ""
    }));
    entries.sort((a, b) => b.pts - a.pts);
    if (entries.length === 0) {
      lista.innerHTML = '<div class="resp-vacia">Aún no hay puntos acumulados</div>';
      return;
    }
    lista.innerHTML = entries.map((e, i) => {
      const pos = i + 1;
      const posClass = pos === 1 ? "g1" : pos === 2 ? "g2" : pos === 3 ? "g3" : "";
      const itemClass = pos === 1 ? "top1" : pos === 2 ? "top2" : pos === 3 ? "top3" : "";
      const fotoSrc = e.fotoUrl ? convertirUrlDrive(e.fotoUrl) : avatarFallbackAdmin(e.nombre);
      const fallback = avatarFallbackAdmin(e.nombre);
      return '<div class="rank-item ' + itemClass + '">' +
        '<div class="rank-pos ' + posClass + '">' + pos + '</div>' +
        '<img src="' + fotoSrc + '" class="rank-foto" alt="" onerror="this.onerror=null;this.src=\'' + fallback + '\'">' +
        '<div class="rank-nombre">' + escaparHTML(e.nombre) + '</div>' +
        '<div><div class="rank-pts">' + e.pts + '</div>' +
        '<div style="font-size:9px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">pts</div></div>' +
        '</div>';
    }).join("");
  });
}

/* ── Reiniciar ranking (asamblea actual) ────────────── */
window.reiniciarRanking = async function () {
  const ok = confirm("¿Reiniciar el ranking de ESTA asamblea? Se borrarán todas las respuestas acumuladas.");
  if (!ok) return;
  await remove(ref(rtdb, "asamblea/respuestas"));
  preguntaNumActual = 0;
  document.getElementById("statConectados").textContent = "0";
  document.getElementById("statAciertos").textContent = "0";
  document.getElementById("rankingCard").classList.remove("visible");
  toast("🔄 Ranking de la asamblea reiniciado", "ok");
};

/* ── Reiniciar ranking global ───────────────────────── */
window.reiniciarRankingGlobal = async function () {
  const ok = confirm("¿Reiniciar el ranking GLOBAL? Se borrará el acumulado histórico de todas las asambleas.");
  if (!ok) return;
  const ok2 = confirm("⚠️ Última confirmación: ¿De verdad quieres borrar TODO el ranking global?");
  if (!ok2) return;
  await remove(ref(rtdb, "rankingGlobal"));
  await remove(ref(rtdb, "asamblea/respuestas"));
  preguntaNumActual = 0;
  toast("♻️ Ranking global reiniciado", "ok");
};

/* ── Borradores (guardar/cargar/eliminar) ─────────── */
window.guardarBorrador = function () {
  const texto = document.getElementById("npTexto").value.trim();
  if (!texto) { toast("Escribe la pregunta primero", "err"); return; }
  const opciones = ["opA", "opB", "opC", "opD"]
    .map(id => document.getElementById(id).value.trim())
    .filter(Boolean);
  const radio = document.querySelector('input[name="correcta"]:checked');
  const duracion = parseInt(document.getElementById("npDuracion").value);
  push(ref(rtdb, "borradores"), {
    texto,
    opciones,
    correcta: radio ? parseInt(radio.value) : 0,
    duracion,
    ts: Date.now()
  });
  toast("💾 Guardado", "ok");
};

function escucharBorradores() {
  onValue(ref(rtdb, "borradores"), (snap) => {
    const data = snap.val();
    const lista = document.getElementById("histLista");
    if (!lista) return;
    if (!data) {
      lista.innerHTML = '<div class="hist-vacio">No hay preguntas guardadas aún.</div>';
      return;
    }
    const letras = ["A", "B", "C", "D"];
    lista.innerHTML = Object.entries(data).reverse().map(([key, p]) => `
      <div class="hist-item">
        <div style="flex:1">
          <div class="hist-item-txt">${p.texto}</div>
          <div class="hist-item-meta">
            ${(p.opciones || []).map((op, i) => `<span style="margin-right:8px;color:${i === p.correcta ? '#7fe8aa' : 'rgba(255,248,231,.3)'}">${letras[i]}. ${op}</span>`).join("")}
            · ⏱ ${p.duracion}s
          </div>
        </div>
        <button class="btn btn-ghost" style="font-size:12px;padding:8px 14px;" onclick="cargarBorrador('${key}')">Cargar</button>
        <button class="btn btn-danger" style="font-size:12px;padding:8px 14px;" onclick="eliminarBorrador('${key}')">🗑</button>
      </div>`).join("");
  });
}

window.cargarBorrador = async function (key) {
  try {
    const snap = await get(ref(rtdb, "borradores/" + key));
    const p = snap.val();
    if (!p) return;
    document.getElementById("npTexto").value = p.texto;
    ["opA", "opB", "opC", "opD"].forEach((id, i) => {
      document.getElementById(id).value = (p.opciones && p.opciones[i]) ? p.opciones[i] : "";
    });
    if (p.correcta != null) {
      const r = document.querySelector(`input[name="correcta"][value="${p.correcta}"]`);
      if (r) r.checked = true;
    }
    document.getElementById("npDuracion").value = p.duracion || 20;
    toast("Pregunta cargada ✓", "ok");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    console.error(e);
    toast("Error al cargar borrador", "err");
  }
};

window.eliminarBorrador = function (key) {
  remove(ref(rtdb, "borradores/" + key));
  toast("Eliminado", "");
};

/* ── Gestión de Líderes (Firestore) ─────────────────── */
window.loadMembersByRole = async function () {
  try {
    const container = document.getElementById("members-by-role");
    if (!container) return;
    container.innerHTML = '<p>Cargando miembros...</p>';

    const membersSnap = await getDocs(collection(fsdb, "members"));
    const roles = { miembro: [], lider: [], coordinador: [] };

    membersSnap.forEach(docSnap => {
      const data = docSnap.data();
      const role = data.rol || "miembro";
      if (roles[role]) {
        roles[role].push({ id: docSnap.id, ...data });
      }
    });

    // Ordenar alfabéticamente
    Object.values(roles).forEach(arr => arr.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")));

    const roleLabels = { miembro: "Miembros", lider: "Líderes", coordinador: "Coordinadores" };
    const roleColors = { miembro: "", lider: "#4A8FA8", coordinador: "#F5C518" };

    let html = "";
    Object.entries(roles).forEach(([role, members]) => {
      html += `<div class="role-section" style="margin-bottom:20px;">`;
      html += `<h4 style="color:${roleColors[role] || 'var(--muted)'}; margin-bottom:8px;">${roleLabels[role]} (${members.length})</h4>`;
      if (members.length === 0) {
        html += `<p style="color:var(--muted); font-style:italic;">No hay ${roleLabels[role].toLowerCase()}</p>`;
      } else {
        html += `<ul style="list-style:none; padding:0;">`;
        members.forEach(m => {
          html += `<li style="padding:6px 12px; background:rgba(255,255,255,.04); border-radius:8px; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">`;
          html += `<span>${m.nombre || "Sin nombre"}</span>`;
          if (m.email) html += `<span style="font-size:12px; color:var(--muted);">${m.email}</span>`;
          html += `</li>`;
        });
        html += `</ul>`;
      }
      html += `</div>`;
    });

    container.innerHTML = html;
  } catch (e) {
    console.error("Error loading members by role:", e);
    document.getElementById("members-by-role").innerHTML = '<p style="color:var(--err)">Error cargando miembros</p>';
  }
};

window.loadMemberSelector = async function () {
  try {
    const container = document.getElementById("member-selector");
    if (!container) return;
    container.innerHTML = '<p>Cargando...</p>';

    const membersSnap = await getDocs(collection(fsdb, "members"));
    const members = [];
    membersSnap.forEach(docSnap => {
      members.push({ id: docSnap.id, ...docSnap.data() });
    });
    members.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

    let html = '<select id="member-to-change" style="width:100%; padding:12px; background:rgba(255,255,255,.06); border:1.5px solid var(--border); border-radius:12px; font-family:Outfit,sans-serif; font-size:14px; color:var(--cream); outline:none;">';
    html += '<option value="">-- Seleccione un miembro --</option>';
    members.forEach(m => {
      html += `<option value="${m.id}">${m.nombre || "Sin nombre"}${m.email ? ` (${m.email})` : ""}</option>`;
    });
    html += '</select>';
    container.innerHTML = html;

    document.getElementById("member-to-change").addEventListener("change", function () {
      if (this.value) {
        window.loadMemberDetails(this.value);
      } else {
        document.getElementById("role-change-form").style.display = "none";
      }
    });
  } catch (e) {
    console.error("Error loading member selector:", e);
    document.getElementById("member-selector").innerHTML = '<p style="color:var(--err)">Error cargando miembros</p>';
  }
};

window.loadMemberDetails = async function (memberId) {
  try {
    const memberSnap = await getDoc(doc(fsdb, "members", memberId));
    if (!memberSnap.exists()) { alert("Miembro no encontrado"); return; }
    const data = memberSnap.data();
    document.getElementById("selected-member-name").textContent = data.nombre || "Sin nombre";
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

    if (newRole === "coordinador" && userRole !== "coordinador") {
      alert("Solo los coordinadores pueden asignar el rol de coordinador");
      return;
    }

    await updateDoc(doc(fsdb, "members", memberId), {
      rol: newRole,
      fechaActualizacionRol: serverTimestamp()
    });

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
// Los docs migrados del Excel usan campos en inglés: name, suggestion, comment, rating,
// created_at (ISO string), date_sent/week, assembly_date.
// Los nuevos (desde la web) usan: tema, descripcion, comentario, puntuacion, createdAt (Timestamp).
// Estas helpers leen ambos esquemas.
function sugerenciaTema(d)  { return d.tema || d.suggestion_tema || "Sin tema"; }
function sugerenciaDesc(d)  { return d.descripcion || d.suggestion || "Sin descripción"; }
function feedbackComent(d)  { return d.comentario || d.comment || "Sin comentario"; }
function feedbackAsam(d)    { return d.asambleaFecha || d.assembly_date || "No especificada"; }
function feedbackPuntos(d)  {
  const p = d.puntuacion ?? d.rating ?? 0;
  const n = Math.max(0, Math.min(5, Math.round(Number(p) || 0)));
  return n;
}
function docFecha(d) {
  // createdAt (Timestamp modular), created_at (ISO string) o fechaCreacion (Timestamp compat)
  if (d.createdAt?.seconds) return new Date(d.createdAt.seconds * 1000).toLocaleString();
  if (d.fechaCreacion?.seconds) return new Date(d.fechaCreacion.seconds * 1000).toLocaleString();
  if (d.created_at) {
    const f = new Date(d.created_at);
    return isNaN(f) ? "Fecha desconocida" : f.toLocaleString();
  }
  return "Fecha desconocida";
}
function docNombre(d) { return d.nombre || d.name || "Anónimo"; }

window.loadSuggestions = async function () {
  try {
    const container = document.getElementById("suggestions-list");
    if (!container) return;
    container.innerHTML = '<p>Cargando sugerencias...</p>';

    const snap = await getDocs(collection(fsdb, "sugerencias"));

    if (snap.empty) {
      container.innerHTML = '<p style="color:var(--muted); font-style:italic;">No hay sugerencias aún.</p>';
      return;
    }

    // Ordenar por fecha descendente en cliente (los docs tienen created_at de tipos distintos)
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => {
      const fa = a.createdAt?.seconds || (a.created_at ? new Date(a.created_at).getTime() / 1000 : 0) || 0;
      const fb = b.createdAt?.seconds || (b.created_at ? new Date(b.created_at).getTime() / 1000 : 0) || 0;
      return fb - fa;
    });

    let html = '<ul style="list-style:none; padding:0;">';
    docs.forEach(d => {
      const fecha = docFecha(d);
      html += `<li style="background:rgba(255,255,255,.04); border:1px solid var(--border); border-radius:12px; padding:14px 18px; margin-bottom:8px;">`;
      html += `<div style="font-weight:600; margin-bottom:4px;">${escaparHTML(sugerenciaTema(d))}</div>`;
      html += `<div style="font-size:13px; color:var(--muted); margin-bottom:4px;">${escaparHTML(sugerenciaDesc(d))}</div>`;
      html += `<div style="font-size:11px; color:var(--muted);">Por: ${escaparHTML(docNombre(d))} · ${fecha}</div>`;
      html += `</li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
  } catch (e) {
    console.error("Error loading suggestions:", e);
    document.getElementById("suggestions-list").innerHTML = '<p style="color:var(--err)">Error cargando sugerencias</p>';
  }
};

window.loadFeedback = async function () {
  try {
    const container = document.getElementById("feedback-list");
    if (!container) return;
    container.innerHTML = '<p>Cargando feedback...</p>';

    const snap = await getDocs(collection(fsdb, "feedback"));

    if (snap.empty) {
      container.innerHTML = '<p style="color:var(--muted); font-style:italic;">No hay feedback aún.</p>';
      return;
    }

    // Ordenar por fecha descendente en cliente
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => {
      const fa = a.createdAt?.seconds || (a.created_at ? new Date(a.created_at).getTime() / 1000 : 0) || 0;
      const fb = b.createdAt?.seconds || (b.created_at ? new Date(b.created_at).getTime() / 1000 : 0) || 0;
      return fb - fa;
    });

    let html = '<ul style="list-style:none; padding:0;">';
    docs.forEach(d => {
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
    html += '</ul>';
    container.innerHTML = html;
  } catch (e) {
    console.error("Error loading feedback:", e);
    document.getElementById("feedback-list").innerHTML = '<p style="color:var(--err)">Error cargando feedback</p>';
  }
};
