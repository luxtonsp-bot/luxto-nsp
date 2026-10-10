# 🕊️ Luxto-NSP — Portal del Grupo Juvenil Luz de Cristo

> **Parroquia Nuestra Señora de la Piedad** · Villa Jardín · San Luis · Lima · Perú  
> *Desde 2010 — "Así brille la luz de ustedes delante de los hombres..." (Mt 5:16)*

[![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-181717?logo=github)](https://luxtonsp-bot.github.io/luxto-nsp/)
[![Firebase](https://img.shields.io/badge/Firebase-v11-FFCA28?logo=firebase&logoColor=white)](https://firebase.google.com/)
[![Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-Backend-4285F4?logo=google&logoColor=white)](https://script.google.com/)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JS%20ESM-F7DF1E?logo=javascript&logoColor=black)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

---

## 🎯 ¿Qué es Luxto-NSP?

Portal web completo para el **Grupo Juvenil Luz de Cristo** que integra:

| Capa | Tecnología | Qué hace |
|------|------------|----------|
| **Frontend** | HTML5 + CSS3 + Vanilla JS (ES Modules) | 13 páginas responsive, glassmorphism dark/light theme, animaciones fluidas |
| **Auth & DB** | **Firebase Auth + Firestore** | Login Email/Password, perfiles, asistencia, tablas dinámicas, histórico, planificación, fotos |
| **Backend Legacy** | **Google Apps Script + Sheets + Drive** | Registro inicial, sugerencias, feedback, exportaciones (en migración a Firestore) |
| **Hosting** | **GitHub Pages** | Despliegue automático desde `main` + preview por rama |

---

## 📁 Estructura del Repositorio

```
luxto-nsp/
├── index.html                 # Landing pública
├── pages/                     # 13 páginas del portal
│   ├── historia.html          # Cronología épica completa
│   ├── login.html             # Login Firebase Email/Password
│   ├── registro.html          # Registro con validación Sheet
│   ├── dashboard.html         # Panel del miembro (stats, nota, sugerencias, feedback)
│   ├── tomar-asistencia.html  # 👮 Staff: Tomar / Ver / Resumen Anual asistencia
│   ├── gestion-grupo.html     # 👮 Staff: Perseverantes, nuevos, cierre de año
│   ├── historial.html         # 👮 Staff: Histórico años (asistencia, tablas, Kahoot, sugerencias)
│   ├── planificacion.html     # 👮 Staff: Planificar asambleas, generar esquema HD WhatsApp
│   ├── tablas.html            # 👮 Staff: Tablas dinámicas (definir columnas, ingresar datos)
│   ├── admin.html             # 👮 Staff: Control asambleas Kahoot en vivo
│   ├── proyector.html         # Pantalla grande: preguntas, ranking, podio en vivo
│   ├── asamblea.html          # Móvil miembro: responder Kahoot (solo letras A/B/C/D)
│   └── registro.html          # Registro miembros (validación Sheet → Firebase Auth)
├── assets/
│   ├── css/portal.css         # Estilos globales (tokens, glassmorphism, responsive)
│   ├── js/
│   │   ├── auth-permissions.js  # Módulo compartido: roles staff (servidor/coordinador/apoyo)
│   │   ├── proyector_logic.js   # Lógica compartida asambleas (Firebase listeners, timer, ranking)
│   │   └── utils.js             # Utilidades comunes (fecha Lima, foto Drive, toast, etc.)
│   └── images/                 # Logos, hero, directivos, coro
├── appscript/                  # Google Apps Script project (Sheets integration - legacy)
├── migration/                  # Scripts de migración Excel → Firestore + CSVs exportados
│   └── sheets_export/          # members.csv, attendance.csv, config.csv, attendance_log.csv
├── scripts/                    # Scripts utilitarios Python (fix fotos, recálculos, etc.)
├── .github/workflows/          # GitHub Actions: deploy production/preview, cumpleaños
└── README.md
```

---

## 🌐 Páginas y Funcionalidades

### 1. `index.html` — Landing Pública
- **Hero** con foto grupal animada, stats (2010, 9 periodos, +50 servidores)
- **Quiénes somos**: valores (Fe, Fraternidad, Servicio, Misión) + timeline 2010-2025
- **Historia** (resumen con link a `historia.html`)
- **Coro Parroquial**: servicios + contacto WhatsApp
- **Donaciones**: 3 métodos (Yape, Plin, Transferencia) + QR + transparencia
- **CTA** ingreso al portal miembros

### 2. `historia.html` — Cronología Épica Completa
- **Fundación**: 15 nov 2010 · 30 abr 2011 (nombre oficial "Luz de Cristo")
- **9 Períodos directivos** (2011-2025) con tarjetas: foto, cargo, rol
- **Estados especiales**: `memoria` (vela 🕯️), `asesor-card` (badge azul)
- **Sección Coro**: historia + timeline + cards + contacto
- **Equipo por período**: chips con avatar + nombre

### 3. `login.html` / `registro.html` — Auth Firebase
| Flujo | Detalle |
|-------|---------|
| **Login** | Email/contraseña + "¿Olvidaste contraseña?" (`sendPasswordResetEmail`) |
| **Registro** | Paso 1: Valida nombre contra Google Sheet (`validarMiembro`)<br>Paso 2: Crea usuario Firebase Auth + guarda `email` + `uid` en Sheet (`guardarEmail`) |
| **Seguridad** | Solo miembros en Sheet oficial pueden crear cuenta |

### 4. `dashboard.html` — Panel del Miembro
- **Banner cumpleaños** 🎂 con confetti automático
- **Hero "Nota de Rendimiento"**: gauge SVG animado (0-20) + mensaje contextual + chip estado
- **Stats Grid** (animados 0→valor): Asistencias ✅ · Tardanzas ⏰ · Faltas ❌ · Fidelidad 🔥 (% + barra)
- **Resumen asistencia**: total, tardanzas, promedio retraso, última, estado (activo/riesgo/inactivo)
- **Sugerir tema** → Apps Script `guardarSugerencia`
- **Feedback estrellas** (1-5) + comentario → Apps Script `guardarFeedback`
- **Modo Asamblea banner** (si `asamblea/activa=true`)

### 5. `tomar-asistencia.html` — **Staff** (servidor/coordinador/apoyo)
**3 Sub-vistas (tabs):**
- 📝 **Tomar Asistencia**: Buscar miembro → ✓ Presente / ✗ Ausente → **el miembro desaparece de la lista al marcar**
- 📅 **Día Específico**: Selector fecha → lista completa (presentes ✓ con tardanza / ausentes ✗) + resumen stats
- 📈 **Resumen Anual**: Selector año → **TODOS los miembros** (sin filtro `estadoAnioActual`) con:
  - % asistencia contra **fechas reales con datos** (no config, excluye fechas futuras)
  - Total histórico (`asistenciasTotales` recalculado desde datos reales)
  - Fotos base64 (evita CSP GitHub Pages) + fallback iniciales

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
- **Listar tablas** propias → ver/editar (placeholders para fase futura)
- Guarda en `tablas_definiciones/` + `tablas_dinamicas/{tableId}/`

### 10. Sistema de Asambleas Kahoot en Tiempo Real (3 vistas sincronizadas)

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

## 🔐 Sistema de Permisos (NUEVO - 2026-10-10)

### Módulo compartido: `assets/js/auth-permissions.js`
```javascript
const STAFF_ROLES = ['servidor', 'coordinador', 'apoyo'];
const STAFF_PAGES = [
    'tomar-asistencia.html',
    'gestion-grupo.html',
    'tablas.html',
    'historial.html',
    'planificacion.html'
];
```

### Flujo de autorización:
1. Usuario logueado → `auth.onAuthStateChanged`
2. Si página ∈ `STAFF_PAGES` → `AuthPermissions.initStaffPermissionCheck()`
3. Consulta `members` por `email` → obtiene `rol`
4. `STAFF_ROLES.includes(rol)` → **SÍ** = carga página, **NO** = página "Acceso denegado" + botón Dashboard

### Miembros con acceso Staff (actual):
| Nombre | Rol |
|--------|-----|
| Gianfranco Camones | servidor |
| Diego García | servidor |
| Paolo Alfaro | coordinador |
| Álvaro Salazar | servidor |
| Kiara Llauce | apoyo |
| Nicole Diaz | apoyo |
| Fernanda Valdivia | apoyo |
| Sebastian Caroy | apoyo |

> **Nota**: Para dar/quitar acceso, solo edita el campo `rol` en `gestion-grupo.html` o directo en Firestore. El archivo JS **no se toca**.

---

## ☁️ Modelo Firestore (Post-Migración)

```
members/{uid}
  ├── nombre, email, rol (miembro/servidor/coordinador/apoyo)
  ├── estadoAnioActual (activo/perseverante/baja)
  ├── fotoThumb (base64 ≤8KB), fotoDriveId
  ├── asistenciasTotales (recalculado desde asistencia real)
  ├── ultimaAsistencia (YYYY-MM-DD)
  ├── fechaNacimiento, fechaNacimientoMMdd
  └── fechaIngresoGrupo, fechaCreacion

asistencia/{año}/{fecha}/{uid}
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
  └── (ranking histórico por asamblea)

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

miembros_registro/{uid}
  └── nombre: string  (para validación en registro.html)

fotos/{uid}
  └── base64, driveId, updatedAt
```

---

## ⚙️ Google Apps Script Backend (Legacy - en migración)

**URL Base:** `https://script.google.com/macros/s/AKfycbykddHb1fYX7TOK6tt6Dx11f_SDjJOcFawZbjAjgQn7oJ9Zj0Jm8IWJ1BvMX_XuGOgK6g/exec`

| Acción | Parámetros | Qué hace |
|--------|------------|----------|
| `getDashboard` | `email` | Stats miembro (asistencias, tardanzas, faltas, %, nota, estado, última, esCumple, fotoUrl) |
| `validarMiembro` | `nombre` | Busca en Sheet "Miembros", retorna `ok`, `fila`, `nombreReal` |
| `guardarEmail` | `fila`, `email`, `uid` | Escribe email/UID en Sheet |
| `guardarFotoUrl` | `email`, `base64` | Sube a Drive, retorna `fotoUrl` (thumbnail) |
| `guardarSugerencia` | `nombre`, `email`, `sugerencia` | Añade a Sheet "Sugerencias" |
| `guardarFeedback` | `nombre`, `email`, `calificacion`, `comentario` | Añade a Sheet "Feedback" |

> **Migración en curso**: Asistencias, miembros, tablas, histórico ya en Firestore. Apps Script queda para registro inicial y exportaciones.

---

## 🔒 Seguridad

### Protecciones implementadas
- **Auth guard**: `onAuthStateChanged` → login si no hay sesión
- **Staff guard**: `auth-permissions.js` verifica rol en Firestore (server-side check)
- **Admin RTDB guard**: Nodo `/admins/{uid}` en Realtime Database rules
- **Anti-XSS**: `textContent` para datos dinámicos
- **onerror fix**: `this.onerror=null` evita loops en imágenes

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
|---|---|---|
| **Producción:** `https://luxtonsp-bot.github.io/luxto-nsp/` | `main` | Push a `main` (`.github/workflows/deploy-production.yml`) |
| **Preview:** `https://luxtonsp-bot.github.io/luxto-nsp/preview/<rama>/` | cualquier ≠ `main` | Push a esa rama (`.github/workflows/deploy-preview.yml`) |

### Cómo funciona
- Todo en rama **`gh-pages`** (GitHub Pages sirve raíz):
  - **Raíz** = `main` → producción
  - **`gh-pages/preview/<rama>/`** = rama de trabajo → link propio
- Workflow preview copia **solo sitio estático** (`index.html`, `pages/`, `assets/`) — **nunca** credenciales, Excel, scripts (protegidos por `.gitignore`)

### ⚠️ PASO MANUAL ÚNICO (pendiente) — cambiar fuente de Pages
1. `https://github.com/luxtonsp-bot/luxto-nsp/settings/pages`
2. **"Build and deployment"** → **"Source"** → **"Deploy from a branch"**
3. **Branch:** `gh-pages` / **Folder:** `/ (root)` → **Save**

---

## ✅ ESTADO DEL PROYECTO (actualizado 2026-10-10)

| Componente | Estado | Detalles |
|------------|--------|----------|
| **Migración datos** | ✅ Completada | 1.125 docs migrados a Firestore (modelo final) |
| **Firestore rules** | ✅ Desplegadas | Reglas por rol + fix `historico/{anio}` collectionGroup |
| **GitHub Actions** | ✅ Configurados | Deploy preview/production + cumpleaños automático |
| **Tardanzas** | ✅ Implementadas | `calcularTardanza()` serverTimestamp, Lima UTC-5, tolerancia 10 min |
| **Finalizar asamblea** | ✅ Solo coordinador | Validación server-side + UI oculta para no-coordinadores |
| **Finalizar asistencia** | ✅ Solo activos | Filtra `estadoAnioActual === 'activo'` |
| **Responsividad móvil** | ✅ Completa (13/13 páginas) | Breakpoints consistentes |
| **Sistema permisos Staff** | ✅ Nuevo (2026-10-10) | `auth-permissions.js` centralizado, 5 páginas protegidas |
| **Fotos base64** | ✅ 26 miembros | ≤8KB, 128px, evita CSP GitHub Pages |
| **Resumen Anual fix** | ✅ 33 fechas reales | Excluye fechas futuras, incluye todos los miembros, % correcto |
| **Miembro desaparece al marcar** | ✅ Nuevo (2026-10-10) | DOM removal en `markAttendance()` |

### 🎯 Próximos pasos inmediatos
1. **Validar con coordinador** en preview: `https://luxtonsp-bot.github.io/luxto-nsp/preview/feature-firebase-migration/`
   - [ ] Registro → login → dashboard
   - [ ] Planificación → activar asamblea + descargar esquema HD
   - [ ] Tomar asistencia → marcar presente/ausente → desaparece de lista
   - [ ] Admin → Kahoot en vivo + ranking
   - [ ] Historial → dropdown años + 5 vistas
   - [ ] Tablas → crear + ingresar datos
   - [ ] Gestión grupo → perseverantes + nuevos + cierre año
2. **Merge a `main`** tras aprobación → producción automática

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

> **Nota:** Firebase y Apps Script funcionan en localhost si autorizas el dominio en Firebase Console → Authentication → Settings → Authorized domains.

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