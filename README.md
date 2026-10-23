# 🕊️ Luxto-NSP — Portal del Grupo Juvenil Luz de Cristo

> **Parroquia Nuestra Señora de la Piedad** · Villa Jardín · San Luis · Lima · Perú  
> *Desde 2010 — "Así brille la luz de ustedes delante de los hombres..." (Mt 5:16)*

[![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-181717?logo=github)](https://luxtonsp-bot.github.io/luxto-nsp/)
[![Firebase](https://img.shields.io/badge/Firebase-v11-FFCA28?logo=firebase&logoColor=white)](https://firebase.google.com/)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JS%20ESM-F7DF1E?logo=javascript&logoColor=black)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

---

## 🎯 ¿Qué es Luxto-NSP?

Portal web completo para el **Grupo Juvenil Luz de Cristo** — **100% Firebase**, sin dependencia de Google Apps Script / Sheets para funcionalidades core.

| Capa | Tecnología | Qué hace |
|------|------------|----------|
| **Frontend** | HTML5 + CSS3 + Vanilla JS (ES Modules) | 13 páginas responsive, glassmorphism dark/light theme, animaciones fluidas |
| **Auth & DB** | **Firebase Auth + Firestore + RTDB** | Login Email/Password, perfiles, asistencia, tablas dinámicas, histórico, planificación, fotos, Kahoot en tiempo real |
| **Hosting** | **GitHub Pages** | Despliegue automático desde `main` + preview por rama |

> **Migración completada (oct 2026):** Asistencias, miembros, tablas, histórico, sugerencias, feedback, fotos, Kahoot — todo en Firestore/RTDB. Apps Script eliminado del flujo crítico.

---

## 📁 Estructura del Repositorio

```
luxto-nsp/
├── index.html                 # Landing pública
├── pages/                     # 13 páginas del portal
│   ├── historia.html          # Cronología épica completa
│   ├── login.html             # Login Firebase Email/Password
│   ├── registro.html          # Registro con fuzzy matching + creación cuenta Firebase + uid_map
│   ├── dashboard.html         # Panel miembro (stats, foto, sugerencias, feedback con selector asamblea)
│   ├── tomar-asistencia.html  # 👮 Staff: Tomar / Ver Día / Resumen Anual asistencia
│   ├── gestion-grupo.html     # 👮 Staff: Perseverantes, nuevos, cierre de año → histórico
│   ├── historial.html         # 👮 Staff: Histórico años (asistencia, tablas, Kahoot, sugerencias, feedback)
│   ├── planificacion.html     # 👮 Staff: Planificar asambleas, generar esquema HD WhatsApp
│   ├── tablas.html            # 👮 Staff: Tablas dinámicas (definir columnas, ingresar datos)
│   ├── admin.html             # 👮 Coordinador: Kahoot en vivo + sugerencias/feedback admin
│   ├── proyector.html         # Pantalla grande: preguntas, ranking, podio en vivo
│   └── asamblea.html          # Móvil miembro: responder Kahoot (solo A/B/C/D)
├── assets/
│   ├── css/portal.css         # Estilos globales (tokens, glassmorphism, responsive)
│   ├── js/
│   │   ├── firebase-init.js   # Inicialización Firebase (compat + modular) + export db/auth
│   │   ├── auth-permissions.js # Módulo compartido: roles staff (servidor/coordinador/apoyo)
│   │   ├── proyector_logic.js # Lógica compartida asambleas (RTDB listeners, timer, ranking)
│   │   └── utils.js           # Utilidades (fecha Lima, foto Drive, toast, etc.)
│   └── images/                # Logos, hero, directivos, coro
├── scripts/                   # Scripts de migración y utilitarios Node (firebase-admin)
│   ├── migrate_asistencia_a_uuid.mjs    # Migración IDs AuthUID/legacy → UUID
│   └── fix_uid_map_missing.mjs          # Crea uid_map faltantes por email/uid match
├── migration/                 # Reportes y backups de migración (gitignored)
├── .github/workflows/         # GitHub Actions: deploy production/preview, cumpleaños
├── firestore.rules            # Reglas de seguridad por rol (uid_map ↔ memberId)
├── database.rules.json        # Reglas RTDB (Kahoot: admins escriben, público lee)
├── package.json
└── README.md
```

---

## 🌐 Páginas y Funcionalidades

### 1. `index.html` — Landing Pública
- Hero con foto grupal animada, stats (2010, 9 periodos, +50 servidores)
- Quiénes somos: valores (Fe, Fraternidad, Servicio, Misión) + timeline 2010-2025
- Historia (resumen con link a `historia.html`)
- Coro Parroquial: servicios + contacto WhatsApp
- Donaciones: 3 métodos (Yape, Plin, Transferencia) + QR + transparencia
- CTA ingreso al portal miembros

### 2. `historia.html` — Cronología Épica Completa
- Fundación: 15 nov 2010 · 30 abr 2011 (nombre oficial "Luz de Cristo")
- 9 Períodos directivos (2011-2025) con tarjetas: foto, cargo, rol
- Estados especiales: `memoria` (vela 🕯️), `asesor-card` (badge azul)
- Sección Coro: historia + timeline + cards + contacto
- Equipo por período: chips con avatar + nombre

### 3. `login.html` / `registro.html` — Auth Firebase
| Flujo | Detalle |
|-------|---------|
| **Login** | Email/contraseña + "¿Olvidaste contraseña?" (`sendPasswordResetEmail`) |
| **Registro** | Paso 1: Fuzzy matching nombre contra `miembros_registro` (insensible a tildes/mayúsculas/orden, tolera typos, exige nombre+apellido). Paso 2: Crea usuario Firebase Auth + actualiza `members/{memberId}` (email, uid, fechaNacimiento) + crea `uid_map/{authUid}` + marca `miembros_registro.tieneCuenta=true` |
| **Seguridad** | Solo miembros en `miembros_registro` pueden crear cuenta. Deduplicación por nombre normalizado. |

### 4. `dashboard.html` — Panel del Miembro
- Banner cumpleaños 🎂 con confetti automático
- Hero "Nota de Rendimiento": gauge SVG animado (0-20) + mensaje contextual + chip estado
- Stats Grid (animados 0→valor): Asistencias ✅ · Tardanzas ⏰ · Faltas ❌ · Fidelidad 🔥 (% + barra)
- Resumen asistencia: total, tardanzas, promedio retraso, última, estado (activo/riesgo/inactivo)
- **Sugerir tema** → Firestore `sugerencias` (texto, fecha ISO, uid, nombre, email)
- **Feedback estrellas** (1-5) + comentario → selector de asamblea (fecha + hora) → Firestore `feedback` (calificacion, comentario, fechaAsamblea, fecha ISO, uid)
- Subida foto: compresión client-side → base64 thumb (≤8KB, 128px) en `members.fotoThumb` + grande en `fotos/{authUid}`
- Modo Asamblea banner (si `asamblea/activa=true` en RTDB)

### 5. `tomar-asistencia.html` — **Staff** (servidor/coordinador/apoyo)
**3 Sub-vistas (tabs):**
- 📝 **Tomar Asistencia**: Buscar miembro → ✓ Presente / ✗ Ausente → **el miembro desaparece de la lista al marcar** + tardanza automática (Lima UTC-5, tolerancia 10 min)
- 📅 **Día Específico**: Selector fecha → lista completa (presentes ✓ con tardanza / ausentes ✗) + resumen stats
- 📈 **Resumen Anual**: Selector año → **TODOS los miembros** (sin filtro `estadoAnioActual`) con % asistencia contra fechas reales con datos, total histórico recalculado, fotos base64 + fallback iniciales

### 6. `gestion-grupo.html` — **Staff**
- **Perseverantes y Nuevos**: Checkbox para marcar miembros que continúan (`estadoAnioActual: 'perseverante'`)
- **Nuevos Integrantes**: Formulario (nombre, cumpleaños, primera asamblea) → crea en `members` + `miembros_registro`
- **Cierre de Año**: Copia colecciones a `historico/{año}/` (asistencia, tablas, Kahoot, sugerencias, feedback) + actualiza `estadoAnioActual`

### 7. `historial.html` — **Staff**
- **Selector año** (poblado dinámicamente desde `historico/`)
- **5 tipos de vista**: Resumen General, Asistencia, Tablas Dinámicas, Ranking Kahoot, Sugerencias y Feedback
- Datos leídos de `historico/{año}/{colección}`

### 8. `planificacion.html` — **Staff**
- **Selector año + sábado/día** (genera sábados automáticamente)
- **Formulario asamblea**: activar, hora, tema, categoría, objetivo, ponentes
- **Esquema detallado**: editor con templates (default/detallado) + insert timestamp
- **Vista previa** + **Descargar imagen HD 4x** (1920px) para WhatsApp via `html2canvas`
- Crea/actualiza doc en `asambleas/{fecha}` con `hayAsamblea: true`

### 9. `tablas.html` — **Staff**
- **Crear tabla**: nombre, descripción, año, definir columnas (texto/número/booleano/fecha/monto)
- **Ingresar datos**: filas dinámicas según columnas definidas
- **Listar tablas** propias → ver/editar
- Guarda en `tablas_definiciones/` + `tablas_dinamicas/{tableId}/`

### 10. Sistema de Asambleas Kahoot en Tiempo Real (3 vistas sincronizadas vía RTDB)

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   admin.html    │────▶│  Firebase RTDB   │◀───│  proyector.html  │
│ (Coordinador)   │     │  /asamblea       │     │ (Pantalla grande)│
└─────────────────┘     └────────┬─────────┘     └──────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  asamblea.html   │
                        │ (Móvil miembro)  │
                        └──────────────────┘
```

#### `admin.html` — Panel Coordinador
- **Toggle Asamblea ON/OFF** (limpia respuestas, resetea `preguntaNum=0`)
- **Crear preguntas**: texto, 2-4 opciones, correcta, duración (10-60s) → guarda en `/borradores`
- **Pregunta activa en vivo**: respuestas recibidas en tiempo real (foto, nombre, ✓/✗, pts, tiempo)
- **Ranking en vivo** (top 10 con fotos) + **Ranking Global Histórico**
- **Botones**: Lanzar/Siguiente (countdown 3-2-1) / Cerrar / Finalizar / Reiniciar
- **Pestañas admin**: Sugerencias (lee `sugerencias` + `suggestions` legacy) + Feedback (lee `feedback` con estrellas)

#### `proyector.html` — Vista Pantalla Grande
- **Pantallas**: Espera → Countdown → Pregunta completa (barras % en vivo) → Ranking → Podio
- **Admin Bar** (toggleable): botones de control remoto
- **Timer** circular SVG + barra horizontal (color: amarillo → naranja → rojo)
- **Animaciones**: entrada, pop-in correcta, confetti podio

#### `asamblea.html` — Vista Móvil Miembro
- **Solo letras A/B/C/D** (texto completo en proyector)
- **Timer** + hint "📺 Lee las opciones en el proyector"
- **Resultado**: ✅/❌/⏰ + puntos (`1000 * (1 - tiempo/duración/2)`, mín 200)
- **Podio final** (top 3 pedestales) + ranking completo + confetti

---

## 🔐 Sistema de Permisos

### Módulo compartido: `assets/js/auth-permissions.js`
```javascript
const STAFF_ROLES = ['coordinador', 'servidor', 'apoyo'];
const STAFF_PAGES = [
    'tomar-asistencia.html', 'gestion-grupo.html',
    'tablas.html', 'historial.html', 'planificacion.html'
];
const COORDINATOR_ONLY_PAGES = ['admin.html'];
```

### Lógica de acceso:
| Rol | Acceso |
|-----|--------|
| **Coordinador** | **TODAS** las páginas (incluye `admin.html`) |
| **Servidor / Apoyo** | **TODAS** menos `admin.html` |
| **Miembro** | Solo páginas públicas (`dashboard.html`, `historia.html`, `proyector.html`, `asamblea.html`, `login.html`, `registro.html`) |

### Flujo:
1. Usuario logueado → `auth.onAuthStateChanged` (SDK compat global)
2. `AuthPermissions.initStaffPermissionCheck()` → consulta `uid_map/{authUid}` → `members/{memberId}.rol`
3. Según rol y página → permite o muestra "Acceso denegado" + botón Dashboard

> **Nota**: Para dar/quitar acceso, solo edita el campo `rol` en `gestion-grupo.html` o directo en Firestore `members/{memberId}.rol`. El archivo JS **no se toca**.

---

## ☁️ Modelo Firestore (Arquitectura Dual-ID)

```
members/{memberId} (UUID canónico)
  ├── nombre, email, rol (miembro/servidor/coordinador/apoyo)
  ├── estadoAnioActual (activo/perseverante/baja)
  ├── fotoThumb (base64 ≤8KB, 128px), fotoDriveId
  ├── asistenciasTotales (recalculado desde asistencia real)
  ├── ultimaAsistencia (YYYY-MM-DD)
  ├── fechaNacimiento, fechaNacimientoMMdd
  ├── fechaIngresoGrupo, fechaCreacion
  └── uid (Auth UID)

uid_map/{authUid} (puente Auth ↔ Firestore)
  └── memberId, email, createdAt

asistencia/{año}/{fecha}/{memberId}
  ├── presente: boolean
  ├── tardanzaMinutos: number
  ├── esTardanza: boolean
  ├── fechaHora: ISO string
  └── timestamp: serverTimestamp

asambleas/{fecha}
  ├── hayAsamblea: boolean
  ├── horaInicio, tema, ponentes, esquema
  └── creadoEn: serverTimestamp

asambleas_kahoot/{docId}
  ├── nombre, puntos, fecha, año

tablas_definiciones/{tableId}
  ├── nombre, descripcion, año, columnas[], creadorUID
  └── fechaCreacion: serverTimestamp

tablas_dinamicas/{tableId}/rows/{rowId}
  └── {col1: val, col2: val, ...}

historico/{año}/
  ├── asistencia/{fecha}/
  ├── tablas_dinamicas/
  ├── asambleas_kahoot/
  ├── sugerencias/
  └── feedback/

miembros_registro/{memberId}
  └── nombre: string, email?, tieneCuenta: boolean

fotos/{authUid}
  └── data (base64 grande), actualizado

sugerencias/{id} + suggestions/{id} (legacy)
  ├── nombre, email, texto, fecha (ISO), uid

feedback/{id}
  ├── nombre, email, calificacion (1-5), comentario
  ├── fechaAsamblea (YYYY-MM-DD), fecha (ISO), uid
```

---

## 🔒 Seguridad

### Protecciones implementadas
- **Auth guard**: `onAuthStateChanged` → login si no hay sesión
- **Staff guard**: `auth-permissions.js` verifica rol en Firestore vía `uid_map`
- **Admin RTDB guard**: Nodo `/admins/{uid}` en Realtime Database rules
- **Anti-XSS**: `textContent` para datos dinámicos
- **onerror fix**: `this.onerror=null` evita loops en imágenes
- **Firestore rules**: por rol (`isStaff()`, `isCoordinator()`) usando `getMemberId(uid)` que resuelve vía `uid_map`

### Firebase Realtime Database Rules (Kahoot)
```json
{
  "rules": {
    "asamblea": {
      "activa": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
      "preguntaActual": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
      "respuestas": {
        "$preguntaId": {
          "$uid": { ".write": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).exists())" }
        }
      }
    },
    "rankingGlobal": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
    "borradores": { ".read": "auth != null", ".write": "auth != null && root.child('admins').child(auth.uid).exists()" }
  }
}
```
> Lecturas públicas en `asamblea/activa`, `preguntaActual`, `rankingGlobal` para que proyector y móvil funcionen sin login. Escrituras requieren `/admins/{uid}`.

---

## 🎨 Diseño & UX

| Aspecto | Detalle |
|---------|---------|
| **Paleta** | Amarillo `#F5C518` · Naranja `#C4703A` · Azul `#4A8FA8` · Rosa `#C4869A` · Negro cálido `#2a2218` · Crema `#FBF7EE` |
| **Tipografía** | `Lora` (serif, títulos) · `Outfit` (sans, UI) · `Cinzel` (display, historia) · `Bebas Neue` (números grandes) |
| **Tema** | Light (index, historia, login/registro) · Dark (dashboard, staff pages, asamblea, proyector) |
| **Efectos** | Glassmorphism, gradientes radiales animados, float/spin, reveal-on-scroll, confetti canvas |
| **Responsive** | Mobile-first, breakpoints 980px / 780px / 480px, hamburger menu, grids auto-fit |
| **Accesibilidad** | `prefers-reduced-motion`, focus-visible, alt en imágenes, semántica HTML5 |
| **Fotos** | Base64 en `fotoThumb` (≤8KB, 128px) → evita CSP GitHub Pages; `fotoDriveId` para sync |

---

## 🚀 Despliegue — dos links independientes

| Link | Rama | Cuándo se actualiza |
|------|------|---------------------|
| **Producción:** `https://luxtonsp-bot.github.io/luxto-nsp/` | `main` | Push a `main` (`.github/workflows/deploy-production.yml`) |
| **Preview:** `https://luxtonsp-bot.github.io/luxto-nsp/preview/<rama>/` | cualquier ≠ `main` | Push a esa rama (`.github/workflows/deploy-preview.yml`) |

### Cómo funciona
- Todo en rama **`gh-pages`** (GitHub Pages sirve raíz):
  - **Raíz** = `main` → producción
  - **`gh-pages/preview/<rama>/`** = rama de trabajo → link propio
- Workflow preview copia **solo sitio estático** (`index.html`, `pages/`, `assets/`) — **nunca** credenciales, scripts, migración (protegidos por `.gitignore`)

### ⚠️ PASO MANUAL ÚNICO (pendiente) — cambiar fuente de Pages
1. `https://github.com/luxtonsp-bot/luxto-nsp/settings/pages`
2. **\"Build and deployment\"** → **\"Source\"** → **\"Deploy from a branch\"**
3. **Branch:** `gh-pages` / **Folder:** `/ (root)` → **Save**

---

## 📜 Scripts de Migración (Node + firebase-admin)

| Script | Uso | Descripción |
|--------|-----|-------------|
| `scripts/migrate_asistencia_a_uuid.mjs` | `node migrate_asistencia_a_uuid.mjs [--backup|--apply|--delete-old]` | Migra docs de asistencia de AuthUID/legacy IDs → UUID canónico. Idempotente. `--backup` exporta todo a `migration/backup_asistencia_<timestamp>.json` (obligatorio antes de `--apply`). `--delete-old` borra viejos solo si nuevo existe y coincide + todos usuarios tienen `uid_map`. |
| `scripts/fix_uid_map_missing.mjs` | `node fix_uid_map_missing.mjs [--apply]` | Lista usuarios Auth sin `uid_map`. Busca match único en `members` por email (case-insensitive) o `uid`. `--apply` crea `uid_map/{authUid}` solo para matches únicos. |

---

## ✅ ESTADO DEL PROYECTO (actualizado 2026-10-23)

| Componente | Estado | Detalles |
|------------|--------|----------|
| **Migración datos** | ✅ Completada | 1,198 docs asistencia migrados a UUID; 63 members UUID; 45 uid_map válidos; 4 Auth sin uid_map (fix script listo) |
| **Firestore rules** | ✅ Desplegadas | Reglas por rol + `getMemberId()` vía `uid_map` + `sugerencias`/`suggestions`/`feedback`/`preguntas` |
| **RTDB rules** | ✅ Desplegadas | Kahoot: admins escriben, público lee |
| **GitHub Actions** | ✅ Configurados | Deploy preview/production + cumpleaños automático |
| **Tardanzas** | ✅ Implementadas | `calcularTardanza()` serverTimestamp, Lima UTC-5, tolerancia 10 min |
| **Finalizar asamblea** | ✅ Solo coordinador | Validación server-side + UI oculta para no-coordinadores |
| **Finalizar asistencia** | ✅ Solo activos | Filtra `estadoAnioActual === 'activo'` |
| **Responsividad móvil** | ✅ Completa (13/13 páginas) | Breakpoints consistentes |
| **Sistema permisos Staff** | ✅ Centralizado | `auth-permissions.js` usa Firebase compat SDK global |
| **Fotos base64** | ✅ 26 miembros | ≤8KB, 128px, evita CSP GitHub Pages |
| **Resumen Anual fix** | ✅ 33 fechas reales | Excluye fechas futuras, incluye todos los miembros, % correcto |
| **Miembro desaparece al marcar** | ✅ | DOM removal en `markAttendance()` |
| **Registro fuzzy matching** | ✅ | Tolerante a tildes, typos, orden; exige nombre+apellido; deduplica por nombre normalizado |
| **Feedback selector asamblea** | ✅ | Dropdown con fecha formateada + hora; envía `fechaAsamblea` seleccionada |
| **Sugerencias legacy + nuevas** | ✅ | Admin lee `sugerencias` + `suggestions` fusionadas |

---

## 🛠️ Desarrollo Local

```bash
# Clonar
git clone https://github.com/luxtonsp-bot/luxto-nsp.git
cd luxto-nsp

# Servidor local
npx serve .          # o python -m http.server 8000
# Abre http://localhost:3000 (o 8000)
```

> **Nota:** Firebase funciona en localhost si autorizas el dominio en Firebase Console → Authentication → Settings → Authorized domains.

---

## 📄 Licencia

MIT License — Libre para uso, modificación y distribución.  
*Hecho con 🤍 para el Grupo Juvenil Luz de Cristo.*

---

## 👥 Créditos

- **Desarrollo**: Paolo Alfaro Sotil ([@elbrujo325](https://github.com/elbrujo325))
- **Comunidad**: Jóvenes de la Parroquia Nuestra Señora de la Piedad
- **Asesores**: P. Andrés, Ricardo Vidal, y todos los que guiaron el grupo
- **Fotos**: Miembros del grupo a lo largo de los años

---

> **"Ustedes son la sal de la tierra... la luz del mundo."** — Mateo 5:13-16