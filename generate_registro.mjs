/**
 * Generador de registro.html con fuzzy matching integrado
 * Incluye nombre-match.js inline para búsqueda amigable
 */

const fs = require('fs');
const path = require('path');

const registroHTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Crear cuenta — Luz de Cristo</title>
<link rel="icon" href="https://luxtonsp-bot.github.io/luxto-nsp/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="../assets/images/logo_luxto.png">
<link rel="icon" type="image/png" sizes="16x16" href="../assets/images/logo_luxto.png">
<link rel="apple-touch-icon" href="../assets/images/logo_luxto.png">
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --y: #F5C518; --o: #C4703A; --b: #4A8FA8;
  --ink: #1c1814; --paper: #FBF7EE; --white: #fff;
  --muted: #5e554a; --err: #d94040; --ok: #2e9e6b;
  --border: #e8e2d4;
  --grad: linear-gradient(135deg,#F5C518,#e09a2e,#C4703A);
  --shadow: 0 20px 60px -16px rgba(28,24,20,.18);
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  font-family:'Inter',sans-serif;
  background:var(--paper);
  min-height:100vh;
  display:grid;
  grid-template-columns:1fr 1fr;
}

/* ── PANEL IZQUIERDO (visual) ── */
.panel-left{
  background:var(--grad);
  position:relative;
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  padding:48px 52px;
  overflow:hidden;
  min-height:100vh;
}
.panel-left::before{
  content:'';position:absolute;inset:0;
  background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'><circle cx='200' cy='200' r='180' fill='none' stroke='rgba(255,255,255,.12)' stroke-width='1'/><circle cx='200' cy='200' r='120' fill='none' stroke='rgba(255,255,255,.08)' stroke-width='1'/><circle cx='200' cy='200' r='60' fill='none' stroke='rgba(255,255,255,.06)' stroke-width='1'/></svg>") no-repeat center/contain;
}
.pl-logo{display:flex;align-items:center;gap:14px;position:relative;z-index:1;}
.pl-logo img{width:52px;height:52px;object-fit:contain;filter:drop-shadow(0 4px 12px rgba(0,0,0,.2));}
.pl-logo-name{font-family:'Lora',serif;font-size:20px;font-weight:600;color:white;line-height:1.2;}
.pl-logo-sub{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.7);}

.pl-body{position:relative;z-index:1;}
.pl-versiculo{
  font-family:'Lora',serif;font-style:italic;font-size:18px;
  color:rgba(255,255,255,.92);line-height:1.75;margin-bottom:20px;
}
.pl-versiculo strong{font-style:normal;font-weight:700;color:white;}
.pl-ref{font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.6);}

.pl-steps{display:flex;flex-direction:column;gap:16px;position:relative;z-index:1;}
.pl-step{display:flex;align-items:center;gap:14px;}
.pl-step-num{
  width:32px;height:32px;border-radius:50%;
  background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.35);
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:700;color:white;flex-shrink:0;
}
.pl-step.done .pl-step-num{background:white;color:var(--o);}
.pl-step-text{font-size:14px;color:rgba(255,255,255,.8);font-weight:500;}

/* ── PANEL DERECHO (formulario) ── */
.panel-right{
  display:flex;flex-direction:column;
  justify-content:center;align-items:center;
  padding:48px 52px;
  min-height:100vh;
}
.form-header{width:100%;max-width:420px;margin-bottom:36px;}
.form-back{
  display:inline-flex;align-items:center;gap:6px;
  text-decoration:none;color:var(--muted);font-size:13px;font-weight:600;
  margin-bottom:24px;transition:color .2s;
}
.form-back:hover{color:var(--o);}
.form-title{
  font-family:'Lora',serif;font-size:32px;font-weight:600;
  color:var(--ink);line-height:1.1;margin-bottom:8px;
}
.form-title em{font-style:italic;color:var(--o);}
.form-sub{font-size:15px;color:var(--muted);line-height:1.6;}

form{width:100%;max-width:420px;display:flex;flex-direction:column;gap:20px;}

.field{display:flex;flex-direction:column;gap:6px;}
.label{font-size:13px;font-weight:700;color:var(--ink);letter-spacing:.2px;}
.field-hint{font-size:12px;color:var(--muted);margin-top:-2px;}
input{
  width:100%;padding:14px 16px;
  border:1.5px solid var(--border);border-radius:12px;
  font-family:'Inter',sans-serif;font-size:15px;color:var(--ink);
  background:white;outline:none;
  transition:border-color .2s,box-shadow .2s;
}
input:focus{border-color:var(--o);box-shadow:0 0 0 3px rgba(196,112,58,.12);}
input.error{border-color:var(--err);}
input.valid{border-color:var(--ok);}

/* Estado de validación del nombre */
.validacion-nombre{
  display:none;
  padding:12px 16px;border-radius:10px;font-size:13px;font-weight:600;
  align-items:center;gap:10px;
}
.validacion-nombre.ok{display:flex;background:rgba(46,158,107,.1);color:var(--ok);border:1px solid rgba(46,158,107,.25);}
.validacion-nombre.err{display:flex;background:rgba(217,64,64,.08);color:var(--err);border:1px solid rgba(217,64,64,.2);}
.validacion-nombre.loading{display:flex;background:rgba(74,143,168,.08);color:var(--b);border:1px solid rgba(74,143,168,.2);}

/* Lista de sugerencias */
.sugerencias{
  display:none;
  flex-direction:column;
  gap:8px;
  margin-top:8px;
  padding:12px;
  background:white;
  border:1.5px solid var(--border);
  border-radius:12px;
  max-height:300px;
  overflow-y:auto;
  box-shadow:0 8px 24px -8px rgba(28,24,20,.12);
}
.sugerencias.visible{display:flex;}
.sugerencia-item{
  display:flex;
  align-items:center;
  gap:12px;
  padding:10px 12px;
  border-radius:8px;
  background:rgba(245,197,24,.08);
  cursor:pointer;
  transition:all .15s;
  border:1px solid transparent;
}
.sugerencia-item:hover{
  background:rgba(196,112,58,.15);
  border-color:rgba(196,112,58,.3);
}
.sugerencia-item.selected{
  background:rgba(196,112,58,.2);
  border-color:var(--o);
}
.sugerencia-avatar{
  width:40px;height:40px;border-radius:50%;
  object-fit:cover;
  background:var(--border);
  flex-shrink:0;
}
.sugerencia-info{flex:1;min-width:0;}
.sugerencia-nombre{font-weight:600;color:var(--ink);font-size:14px;}
.sugerencia-meta{font-size:11px;color:var(--muted);display:flex;gap:8px;margin-top:2px;}
.sugerencia-badge{
  font-size:10px;font-weight:700;
  padding:2px 6px;border-radius:4px;
  background:var(--grad);color:white;
}
.sugerencia-badge.con-cuenta{background:var(--ok);}

.btn-submit{
  width:100%;padding:16px;border-radius:100px;
  background:var(--grad);color:white;
  font-family:'Inter',sans-serif;font-size:16px;font-weight:700;
  border:none;cursor:pointer;
  box-shadow:0 14px 30px -10px rgba(196,112,58,.5);
  transition:all .25s;position:relative;overflow:hidden;
}
.btn-submit:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 20px 40px -10px rgba(196,112,58,.6);}
.btn-submit:disabled{opacity:.6;cursor:not-allowed;transform:none;}

.divider{
  display:flex;align-items:center;gap:12px;
  color:var(--muted);font-size:13px;
}
.divider::before,.divider::after{
  content:'';flex:1;height:1px;background:var(--border);
}

.link-login{
  text-align:center;font-size:14px;color:var(--muted);
}
.link-login a{color:var(--o);font-weight:700;text-decoration:none;}
.link-login a:hover{text-decoration:underline;}

/* Toast / mensaje global */
#toast{
  position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
  background:var(--ink);color:white;
  padding:14px 24px;border-radius:100px;
  font-size:14px;font-weight:600;
  opacity:0;transition:all .3s;pointer-events:none;
  max-width:90vw;text-align:center;z-index:999;
}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
#toast.err{background:var(--err);}
#toast.ok{background:var(--ok);}

/* Paso 2 oculto hasta que se seleccione un miembro */
#paso2{display:none;}
#paso2.visible{display:contents;}

@media(max-width:800px){
  body{grid-template-columns:1fr;}
  .panel-left{display:none;}
  .panel-right{padding:40px 24px;}
}
</style>
</head>
<body>

<!-- PANEL IZQUIERDO -->
<div class="panel-left">
  <div class="pl-logo">
    <img src="../assets/images/logo_luxto.png" alt="Logo" onerror="this.style.display='none'">
    <div>
      <div class="pl-logo-name">Luz de Cristo</div>
      <div class="pl-logo-sub">Portal de miembros</div>
    </div>
  </div>

  <div class="pl-body">
    <p class="pl-versiculo">
      "Así brille la <strong>luz de ustedes</strong> delante de los hombres, para que vean sus buenas obras y glorifiquen al Padre que está en los cielos."
    </p>
    <p class="pl-ref">Mateo 5:16</p>
  </div>

  <div class="pl-steps" id="pasos">
    <div class="pl-step" id="step1">
      <div class="pl-step-num">1</div>
      <div class="pl-step-text">Busca tu nombre en el registro</div>
    </div>
    <div class="pl-step" id="step2">
      <div class="pl-step-num">2</div>
      <div class="pl-step-text">Ingresa tu email y contraseña</div>
    </div>
    <div class="pl-step" id="step3">
      <div class="pl-step-num">3</div>
      <div class="pl-step-text">Ingresa a tu dashboard</div>
    </div>
  </div>
</div>

<!-- PANEL DERECHO -->
<div class="panel-right">
  <div class="form-header">
    <a href="../index.html" class="form-back">
      ← Volver al inicio
    </a>
    <h1 class="form-title">Crea tu<br><em>cuenta</em></h1>
    <p class="form-sub">Solo miembros activos pueden registrarse. Escribe tu nombre y te mostraremos coincidencias.</p>
  </div>

  <form id="formRegistro" novalidate>

    <!-- PASO 1: Buscar nombre con fuzzy matching -->
    <div class="field">
      <label for="nombre">Tu nombre <span style="color:var(--o)">*</span></label>
      <span class="field-hint">Escribe como quieras: ignoramos tildes, mayúsculas y orden</span>
      <input type="text" id="nombre" placeholder="Ej: luana doming" autocomplete="name">
      <div class="validacion-nombre" id="validNombre"></div>
      <!-- Lista de sugerencias -->
      <div class="sugerencias" id="sugerencias" role="listbox" aria-label="Coincidencias encontradas"></div>
    </div>

    <!-- PASO 2: solo aparece si se selecciona un miembro -->
    <div id="paso2">
      <div class="field">
        <label for="email">Tu Gmail <span style="color:var(--o)">*</span></label>
        <span class="field-hint">Usa el mismo Gmail con el que entrarás siempre</span>
        <input type="email" id="email" placeholder="tunombre@gmail.com" autocomplete="email">
      </div>

      <div class="field">
        <label for="password">Contraseña <span style="color:var(--o)">*</span></label>
        <span class="field-hint">Mínimo 6 caracteres</span>
        <input type="password" id="password" placeholder="••••••••" autocomplete="new-password">
      </div>

      <div class="field">
        <label for="password2">Confirmar contraseña <span style="color:var(--o)">*</span></label>
        <input type="password" id="password2" placeholder="••••••••" autocomplete="new-password">
      </div>

      <div class="field">
        <label for="fechaNacimiento">Fecha de nacimiento <span style="color:var(--o)">*</span></label>
        <span class="field-hint">Se usa para cumpleaños — la edad se calcula al vuelo</span>
        <input type="date" id="fechaNacimiento" required>
      </div>
    </div>

    <button type="submit" class="btn-submit" id="btnSubmit">
      Buscar mi nombre →
    </button>

    <div class="divider">o</div>
    <div class="link-login">¿Ya tienes cuenta? <a href="login.html">Ingresar aquí</a></div>

  </form>
</div>

<div id="toast"></div>

<script type="module">
// ═══════════════════════════════════════════════════════════
// NOMBRE-MATCH.JS — Fuzzy matching inline (copia del shared)
// ═══════════════════════════════════════════════════════════

function normalizeName(name) {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')      // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9\\s]/g, '')          // solo alfanumérico y espacios
    .replace(/\\s+/g, ' ')                 // espacios múltiples → uno
    .trim();
}

function tokenize(name) {
  return normalizeName(name).split(' ').filter(t => t.length > 0);
}

function matchScore(query, target) {
  const qTokens = tokenize(query);
  const tTokens = tokenize(target);
  if (qTokens.length === 0 || tTokens.length === 0) return 0;
  let matches = 0;
  for (const qt of qTokens) {
    if (tTokens.includes(qt)) { matches++; continue; }
    for (const tt of tTokens) {
      if (tt.startsWith(qt) || qt.startsWith(tt)) { matches++; break; }
    }
  }
  return matches / Math.max(qTokens.length, tTokens.length);
}

function findMatches(query, candidates, threshold = 0.3) {
  const results = [];
  for (const candidate of candidates) {
    const score = matchScore(query, candidate.nombre);
    if (score >= threshold) {
      results.push({ ...candidate, score });
    }
  }
  return results.sort((a, b) => b.score - a.score || a.nombre.localeCompare(b.nombre));
}

// ═══════════════════════════════════════════════════════════
// FIREBASE INIT
// ═══════════════════════════════════════════════════════════
import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword }
                                 from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, getDoc, writeBatch, setDoc }
                                 from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "«REDACTED»",
  authDomain:        "luxto-nsp.firebaseapp.com",
  projectId:         "luxto-nsp",
  storageBucket:     "luxto-nsp.firebasestorage.app",
  messagingSenderId: "3542836325",
  appId:             "1:3542836325:web:cf65cd50edcc431500d28c"
};
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ═══════════════════════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════════════════════
let allMiembros = [];           // cache de miembros_registro
let miembroSeleccionado = null; // { memberId, nombre, email, tieneCuenta, fotoThumb }

// ═══════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════
function toast(msg, tipo = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show " + tipo;
  setTimeout(() => t.className = "", 3500);
}

function setLoading(si) {
  const btn = document.getElementById("btnSubmit");
  btn.disabled = si;
  if (si) {
    btn.textContent = "Procesando...";
  } else if (miembroSeleccionado) {
    btn.textContent = "Crear cuenta →";
  } else {
    btn.textContent = "Buscar mi nombre →";
  }
}

function mostrarValidacion(estado, msg) {
  const el = document.getElementById("validNombre");
  el.className = "validacion-nombre " + estado;
  el.innerHTML = (estado === "ok" ? "✅ " : estado === "err" ? "❌ " : "⏳ ") + msg;
}

function renderSugerencias(sugerencias) {
  const cont = document.getElementById("sugerencias");
  cont.innerHTML = "";
  if (sugerencias.length === 0) {
    cont.classList.remove("visible");
    return;
  }
  for (const s of sugerencias) {
    const item = document.createElement("div");
    item.className = "sugerencia-item";
    item.dataset.memberId = s.memberId;
    item.setAttribute("role", "option");
    item.innerHTML = \`
      <img class="sugerencia-avatar" src="\${s.fotoThumb || '../assets/images/avatar-placeholder.png'}" alt="" onerror="this.src='../assets/images/avatar-placeholder.png'">
      <div class="sugerencia-info">
        <div class="sugerencia-nombre">\${s.nombre}</div>
        <div class="sugerencia-meta">
          \${s.tieneCuenta ? '<span class="sugerencia-badge con-cuenta">Ya tiene cuenta</span>' : '<span class="sugerencia-badge">Registrar cuenta</span>'}
          <span>\${s.rol || 'miembro'}</span>
        </div>
      </div>
    \`;
    item.addEventListener("click", () => seleccionarMiembro(s));
    cont.appendChild(item);
  }
  cont.classList.add("visible");
}

function seleccionarMiembro(miembro) {
  miembroSeleccionado = miembro;
  // UI
  document.querySelectorAll(".sugerencia-item").forEach(el => el.classList.remove("selected"));
  const selectedEl = document.querySelector(\`.sugerencia-item[data-member-id="\${miembro.memberId}"]\`);
  if (selectedEl) selectedEl.classList.add("selected");
  document.getElementById("nombre").value = miembro.nombre;
  document.getElementById("nombre").classList.add("valid");
  document.getElementById("nombre").readOnly = true;
  document.getElementById("sugerencias").classList.remove("visible");
  document.getElementById("paso2").classList.add("visible");
  document.getElementById("paso2").style.display = "contents";
  document.getElementById("step1").classList.add("done");
  document.getElementById("btnSubmit").textContent = "Crear cuenta →";
  document.getElementById("email").focus();
  mostrarValidacion("ok", "¡Bienvenido/a, " + miembro.nombre.split(" ")[0] + "! Completa tu registro.");
}

// ═══════════════════════════════════════════════════════════
// CARGAR miembros_registro AL INICIO (pública, sin auth)
// ═══════════════════════════════════════════════════════════
async function cargarMiembrosRegistro() {
  try {
    const snap = await getDocs(collection(db, "miembros_registro"));
    allMiembros = snap.docs.map(d => ({ memberId: d.id, ...d.data() }));
    console.log("[Registro] Cargados", allMiembros.length, "miembros para fuzzy matching");
  } catch (e) {
    console.error("[Registro] Error cargando miembros_registro:", e);
    toast("Error cargando registro. Recarga la página.", "err");
  }
}

// ═══════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════

// Input nombre → fuzzy search en tiempo real
document.getElementById("nombre").addEventListener("input", (e) => {
  const query = e.target.value.trim();
  document.getElementById("nombre").classList.remove("error", "valid");
  document.getElementById("validNombre").className = "validacion-nombre";
  if (miembroSeleccionado) {
    miembroSeleccionado = null;
    document.getElementById("nombre").readOnly = false;
    document.getElementById("paso2").style.display = "none";
    document.getElementById("paso2").classList.remove("visible");
    document.getElementById("step1").classList.remove("done");
    document.getElementById("btnSubmit").textContent = "Buscar mi nombre →";
  }
  if (query.length >= 2) {
    const sugerencias = findMatches(query, allMiembros);
    renderSugerencias(sugerencias.slice(0, 8)); // máx 8 sugerencias
  } else {
    document.getElementById("sugerencias").classList.remove("visible");
  }
});

// Submit handler
document.getElementById("formRegistro").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!miembroSeleccionado) {
    const query = document.getElementById("nombre").value.trim();
    if (query.length < 2) {
      toast("Escribe al menos 2 letras de tu nombre", "err");
      return;
    }
    const sugerencias = findMatches(query, allMiembros);
    if (sugerencias.length === 1) {
      seleccionarMiembro(sugerencias[0]);
      return;
    }
    renderSugerencias(sugerencias.slice(0, 8));
    if (sugerencias.length > 0) {
      toast("Selecciona tu nombre de la lista", "");
    } else {
      toast("No se encontraron coincidencias. ¿Escribiste bien?", "err");
    }
    return;
  }
  await crearCuenta();
});

// ═══════════════════════════════════════════════════════════
// CREAR CUENTA — memberId permanente + uid_map
// ═══════════════════════════════════════════════════════════
async function crearCuenta() {
  if (!miembroSeleccionado) {
    toast("Error: No hay miembro seleccionado", "err");
    return;
  }

  const email  = document.getElementById("email").value.trim();
  const pass   = document.getElementById("password").value;
  const pass2  = document.getElementById("password2").value;
  const fechaNac = document.getElementById("fechaNacimiento").value;

  if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    toast("Ingresa un Gmail válido", "err"); return;
  }
  if (!fechaNac) {
    toast("Ingresa tu fecha de nacimiento", "err"); return;
  }
  if (pass.length < 6) {
    toast("La contraseña debe tener al menos 6 caracteres", "err"); return;
  }
  if (pass !== pass2) {
    toast("Las contraseñas no coinciden", "err"); return;
  }

  setLoading(true);
  try {
    // 1. Crear usuario en Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid  = cred.user.uid;

    // 2. Leer documento actual del miembro (en members/{memberId})
    const memberRef = doc(db, "members", miembroSeleccionado.memberId);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) {
      throw new Error("Documento del miembro no encontrado en members/");
    }
    const memberData = memberSnap.data();

    // 3. Escribir atomically:
    //    - members/{memberId}: actualizar email, uid, fechaNacimiento, fechaNacimientoMMdd
    //    - uid_map/{uid}: { memberId, email, createdAt }
    //    - miembros_registro/{memberId}: actualizar email, tieneCuenta=true
    const batch = writeBatch(db);

    const fechaNacMMdd = fechaNac.substring(5, 10); // "YYYY-MM-DD" -> "MM-DD"

    // members/{memberId} (ID PERMANENTE)
    batch.update(memberRef, {
      email: email,
      uid: uid,
      fechaNacimiento: fechaNac,
      fechaNacimientoMMdd: fechaNacMMdd
    });

    // uid_map/{uid} (enlace Auth ↔ memberId)
    const uidMapRef = doc(db, "uid_map", uid);
    batch.set(uidMapRef, {
      memberId: miembroSeleccionado.memberId,
      email: email,
      createdAt: new Date().toISOString()
    });

    // miembros_registro/{memberId} (actualizar lookup público)
    const registroRef = doc(db, "miembros_registro", miembroSeleccionado.memberId);
    batch.update(registroRef, {
      email: email,
      tieneCuenta: true
    });

    await batch.commit();

    // 4. Éxito
    document.getElementById("step2").classList.add("done");
    document.getElementById("step3").classList.add("done");
    toast("¡Cuenta creada! Redirigiendo a tu dashboard...", "ok");
    setTimeout(() => window.location.href = "dashboard.html", 1800);

  } catch (e) {
    let msg = "Error al crear la cuenta.";
    if (e.code === "auth/email-already-in-use") msg = "Este email ya tiene una cuenta. ¿Quieres iniciar sesión?";
    if (e.code === "auth/invalid-email")        msg = "El email no es válido.";
    if (e.code === "auth/weak-password")        msg = "La contraseña es muy débil.";
    if (e.code === "permission-denied")         msg = "Error de permisos. Contacta al coordinador.";
    toast(msg, "err");
    console.error("[Registro] Error:", e);
  }
  setLoading(false);
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
await cargarMiembrosRegistro();

</script>
</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'luxto-nsp', 'pages', 'registro.html'), registroHTML);
console.log('✅ registro.html actualizado con fuzzy matching');
`;

const scriptPath = path.join(__dirname, 'luxto-nsp', 'generate_registro.mjs');
fs.writeFileSync(scriptPath, registroHTML.replace(/^.*?const registroHTML = `/s, 'const registroHTML = `').replace(/`;\n\nfs.writeFileSync.*$/, '`;'));