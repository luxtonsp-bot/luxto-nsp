import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, query, where, getDocs, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyDLl5CLvdaSzZ_K6VXrlJzm4VvN9HQouJo",
  authDomain:        "luxto-nsp.firebaseapp.com",
  projectId:         "luxto-nsp",
  storageBucket:     "luxto-nsp.firebasestorage.app",
  messagingSenderId: "3542836325",
  appId:             "1:3542836325:web:cf65cd50edcc431500d28c",
  databaseURL:       "https://luxto-nsp-default-rtdb.firebaseio.com"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let usuarioActual = null;
let nombreActual  = "";
let calorificacion  = 0;
let memberData = null; // To store member document data for admin check

/* ── Toast ───────────────────────────────────────────── */
function toast(msg, tipo="") {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = "show " + tipo;
  setTimeout(() => t.className = "", 3200);
}

/* ── Convierte URL de Drive a thumbnail público ──────── */
function convertirUrlDrive(url) {
  if (!url) return "";
  if (url.includes("drive.google.com/thumbnail")) return url;
  const m = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
         || url.match(/\/d\/([a-zA-Z0-9_-]{20,})/)
         || url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w400";
  return url;
}

/* ── Comprimir imagen antes de subir ────────────────── */
function comprimirImagen(file, maxPx, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else       { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(resolve, "image/jpeg", quality);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/* ── Parsear decimales en formato español ("19,69") ──── */
function parseNum(v) {
  if (v === null || v === undefined || v === "") return NaN;
  return parseFloat(String(v).replace(",", "."));
}

/* ── Animación de conteo (números que suben de 0→valor) ── */
function animateCount(el, target, { decimals = 0, suffix = "", dur = 1200 } = {}) {
  if (!el) return;
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    const val = from + (target - from) * eased;
    el.textContent = val.toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target.toFixed(decimals) + suffix;
  }
  requestAnimationFrame(tick);
}

/* ── Reveal por scroll ──────────────────────────────── */
function setupReveal() {
  const els = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add("in"), (i % 4) * 90);
        io.unobserve(e.target);
      }
    });
  }, { threshold: .12 });
  els.forEach(el => io.observe(el));
}

/* ── Lanzar confeti ─────────────────────────────────── */
function lanzarConfetti() {
  const confetti = document.getElementById("confetti");
  const jsConfetti = new JSConfetti();
  jsConfetti.addConfetti({
    emojis: ['🎉', '✨', '🌟'],
    confettiNumber: 60,
    confettiRadius: 3,
  });
}

/* ── Cargar dashboard desde Firestore ──────────────── */
async function cargarDashboard(email) {
  try {
    const memberRef = doc(db, "members", email); // Using email as document ID for now? We should use UID.
    // Actually, we should use the UID. We have the user's UID from the auth object.
    // But we don't have the user object here. We have the email.
    // We will change the member document ID to be the UID. We must adjust.
    // However, the migrated data uses email as the document ID? We don't know.
    // We will query by email instead.
    const membersQuery = query(collection(db, "members"), where("email", "==", email));
    const querySnapshot = await getDocs(membersQuery);
    if (querySnapshot.empty) {
      toast("No se encontraron datos del miembro.", "err");
      return;
    }
    // We assume there is only one member with this email.
    const docSnap = querySnapshot.docs[0];
    const data = docSnap.data();
    memberData = data; // Store for admin check later
    nombreActual = data.name;
    document.getElementById("perfilNombre").textContent = data.name;
    document.getElementById("topbarNombre").textContent = (data.name || "").split(" ")[0];

    // Photo handling: we expect fotoDisplay and fotoThumb in the member document.
    let photoUrl = data.fotoDisplay || data.fotoUrl; // fallback to fotoUrl if fotoDisplay not present
    if (photoUrl) {
      document.getElementById("perfilFoto").src = photoUrl;
      document.getElementById("topbarFoto").src = photoUrl;
    }

    if (data.esCumple) {
      document.getElementById("cumpleMsg").textContent = data.msgCumple;
      document.getElementById("bannerCumple").classList.add("visible");
      setTimeout(lanzarConfetti, 500);
    }

    const e = data.estadisticas;
    if (e) {
      animateCount(document.getElementById("statAsist"),  parseNum(e.asistencias) || 0);
      animateCount(document.getElementById("statTard"),   parseNum(e.tardanzas)   || 0);
      animateCount(document.getElementById("statFaltas"), parseNum(e.faltas)      || 0);

      const pct = parseNum(e.porcentaje) || 0;
      animateCount(document.getElementById("statFidel"), Math.round(pct), { suffix: "%" });
      setTimeout(() => {
        document.getElementById("fidelBarFill").style.width = Math.min(pct, 100) + "%";
      }, 300);

      // ⭐ Nota de rendimiento (columna G de "Estadistica")
      renderNota(e.notaRendimiento);

      document.getElementById("rTotal").textContent     = e.totalAsambleas;
      document.getElementById("rAsist").textContent     = e.asistencias;
      document.getElementById("rTardanzas").textContent = e.tardanzas;
      document.getElementById("rRetraso").textContent   = e.promedioRetraso
        ? (Math.round(parseNum(e.promedioRetraso) * 10) / 10) + " min" : "0 min";
      document.getElementById("rUltima").textContent    = e.ultimaAsistencia;

      const estadoEl  = document.getElementById("rEstado");
      const badgesEl  = document.getElementById("perfilBadges");
      const estadoStr = (e.estado || "").toString();

      let estadoClass = "badge-estado-activo";
      let estadoText  = "🟢 Activo";
      if (estadoStr.includes("riesgo") || estadoStr.includes("🟡")) {
        estadoClass = "badge-estado-riesgo"; estadoText = "🟡 En riesgo";
      }
      if (estadoStr.includes("nactivo") || estadoStr.includes("🔴")) {
        estadoClass = "badge-estado-inactivo"; estadoText = "🔴 Inactivo";
      }
      estadoEl.textContent = estadoText;

      badgesEl.innerHTML = "";
      const badgeEstado = document.createElement("span");
      badgeEstado.className = "badge-pill " + estadoClass;
      badgeEstado.textContent = estadoText;
      const badgeGen = document.createElement("span");
      badgeGen.className = "badge-pill badge-generacion";
      badgeGen.textContent = "@luxto_nsp";
      badgesEl.appendChild(badgeEstado);
      badgesEl.appendChild(badgeGen);
    }
  } catch(err) {
    toast("Error de conexión con el servidor.", "err");
  }
}

/* ── Cargar y renderizar historial de tardanzas ───────── */
let tardanzaHistorial = [];
async function cargarHistorialTardanzas() {
  try {
    // We assume we have usuarioActual set
    if (!usuarioActual) return;
    const attendanceLogQuery = query(collection(db, "attendance_log"), where("email", "==", usuarioActual.email), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(attendanceLogQuery);
    tardanzaHistorial = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      tardanzaHistorial.push({
        fecha: data.date, // We stored date as YYYY-MM-DD string
        tardanza: data.lateness_minutes || 0,
        presente: data.present || false
      });
    });
    renderizarHistorialTardanzas();
  } catch(err) {
    toast("Error al cargar historial de tardanzas.", "err");
  }
}

/* ── Renderizar historial de tardanzas ───────────────── */
function renderizarHistorialTardanzas() {
  const ctx = document.getElementById("tardanzaChart").getContext("2d");
  const empty = document.getElementById("chartEmpty");
  if (tardanzaHistorial.length === 0) {
    ctx.style.display = "none";
    empty.style.display = "flex";
    if (tardanzaChart) { tardanzaChart.destroy(); tardanzaChart = null; }
    return;
  }

  ctx.style.display = "block";
  empty.style.display = "none";

  const labels = tardanzaHistorial.map(d => d.fecha);
  const values = tardanzaHistorial.map(d => d.tardanza);

  if (tardanzaChart) tardanzaChart.destroy();

  tardanzaChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Tardanza (min)",
        data: values,
        backgroundColor: values.map(v => v > 10 ? "rgba(217,64,64,0.8)" : v > 5 ? "rgba(212,136,26,0.8)" : "rgba(46,158,107,0.8)"),
        borderColor: values.map(v => v > 10 ? "rgba(217,64,64,1)" : v > 5 ? "rgba(212,136,26,1)" : "rgba(46,158,107,1)"),
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(28,24,20,0.95)",
          titleFont: { family: "Lora", size: 14 },
          bodyFont: { family: "Inter", size: 13 },
          padding: 12,
          callbacks: {
            label: ctx => `Tardanza: ${ctx.raw} min`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: "Inter", size: 11 }, color: "#5e554a", maxRotation: 45, minRotation: 20 }
        },
        y: {
          beginAtZero: true,
          ticks: { font: { family: "Inter", size: 11 }, color: "#5e554a" }
        }
      }
    }
  });
}

/* ── Verificar modo asamblea ────────────────────────── */
async function verificarModoAsamblea() {
  try {
    // We assume we have usuarioActual set
    if (!usuarioActual) return;
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const configDoc = await getDoc(doc(db, "config", dateStr));
    if (configDoc.exists()) {
      const data = configDoc.data();
      if (data.hasAsamblea) {
        document.getElementById("modoAsamblea").classList.add("visible");
      } else {
        document.getElementById("modoAsamblea").classList.remove("visible");
      }
    }
  } catch(err) {
    // Silently fail for mode check
  }
}

/* ── Guardar foto de perfil ─────────────────────────── */
window.subirFoto = async () => {
  const input = document.getElementById("inputFoto");
  if (!input.files.length) { toast("Selecciona una imagen primero", "err"); return; }
  const file = input.files[0];
  const btn = document.querySelector("#inputFoto ~ .btn-enviar");
  btn.disabled = true; btn.textContent = "Subiendo...";
  try {
    // Create two sizes: thumbnail (100px) and display (400px)
    const [thumbBlob, displayBlob] = await Promise.all([
      comprimirImagen(file, 100, 0.7),
      comprimirImagen(file, 400, 0.8)
    ]);
    const [thumbBase64, displayBase64] = await Promise.all([
      blobToBase64(thumbBlob),
      blobToBase64(displayBlob)
    ]);
    // Update the member document with the two sizes
    if (usuarioActual) {
      const memberRef = doc(db, "members", usuarioActual.uid); // Use UID as document ID
      await updateDoc(memberRef, {
        fotoThumb: thumbBase64,
        fotoDisplay: displayBase64
      });
    }
    // Update the images
    document.getElementById("perfilFoto").src = displayBase64;
    document.getElementById("topbarFoto").src  = displayBase64;
    toast("¡Foto guardada! ✓", "ok");
  } catch(e) {
    toast("No se pudo subir la foto. Intenta de nuevo.", "err");
  } finally {
    btn.disabled = false; btn.textContent = "Cambiar foto →";
    input.value = "";
  }
};

/* ── Convierte Blob a Base64 ────────────────────────── */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/* ── Sugerencias ────────────────────────────────────── */
window.enviarSugerencia = async () => {
  const txt = document.getElementById("txtSugerencia").value.trim();
  if (!txt) { toast("Escribe tu sugerencia primero", "err"); return; }
  const btn = document.querySelector("#txtSugerencia ~ .btn-enviar");
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    if (usuarioActual) {
      await addDoc(collection(db, "suggestions"), {
        name: nombreActual,
        email: usuarioActual.email,
        suggestion: txt,
        date: new Date().toISOString(),
        status: "pendiente",
        created_at: new Date()
      });
    }
    document.getElementById("txtSugerencia").value = "";
    toast("¡Sugerencia enviada! Gracias 🙏", "ok");
  } catch(e) {
    toast("Error al enviar. Intenta de nuevo.", "err");
  } finally {
    btn.disabled = false; btn.textContent = "Enviar sugerencia →";
  }
};

/* ── Feedback estrellas ─────────────────────────────── */
window.selectStar = (val) => {
  calificacion = val;
  document.querySelectorAll(".star").forEach((s, i) => {
    s.textContent = i < val ? "⭐" : "☆";
    s.classList.toggle("active", i < val);
  });
};

window.enviarFeedback = async () => {
  const txt = document.getElementById("txtFeedback").value.trim();
  if (!calificacion) { toast("Selecciona una calificación ⭐", "err"); return; }
  const btn = document.querySelector("#txtFeedback ~ .btn-enviar");
  btn.disabled = true; btn.textContent = "Enviando...";
  try {
    if (usuarioActual) {
      await addDoc(collection(db, "feedback"), {
        name: nombreActual,
        email: usuarioActual.email,
        rating: calificacion,
        comment: txt,
        date: new Date().toISOString(),
        created_at: new Date()
      });
    }
    document.getElementById("txtFeedback").value = "";
    window.selectStar(0); calificacion = 0;
    toast("¡Feedback enviado! Gracias por tu opinión 🙏", "ok");
  } catch(e) {
    toast("Error al enviar. Intenta de nuevo.", "err");
  } finally {
    btn.disabled = false; btn.textContent = "Enviar feedback →";
  }
};

/* ── Cerrar sesión ──────────────────────────────────── */
window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

/* ── Auth guard ─────────────────────────────────────── */
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  usuarioActual = user;
  await cargarDashboard(user.email); // We are using email to query, but we should use UID. We'll fix in cargarDashboard.
  // Admin check: use role from memberData
  if (memberData && (memberData.rol === "admin" || memberData.rol === "coordinador" || memberData.rol === "líder")) {
    document.getElementById("adminBtnWrap").style.display = "block";
  }
  setupReveal();
  cargarHistorialTardanzas();
  verificarModoAsamblea();
});