# 🕊️ Luxto-NSP — Portal de Miembros

**Grupo Juvenil Luz de Cristo**  
Parroquia Nuestra Señora de la Piedad — #SábadoDeLuxto

---

## 📋 Descripción

Portal web para la gestión del grupo juvenil **Luz de Cristo**. Permite a los miembros ver su perfil, estadísticas de asistencia, participar en asambleas interactivas en tiempo real, y enviar sugerencias/feedback. Los coordinadores pueden activar asambleas, lanzar preguntas con temporizador, ver respuestas en vivo y rankings.

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (HTML)                       │
│  index.html · login.html · registro.html                │
│  dashboard.html · asamblea.html · admin.html             │
└──────────────┬──────────────────┬───────────────────────┘
               │                  │
               ▼                  ▼
┌──────────────────────┐ ┌────────────────────────┐
│   Firebase Auth      │ │  Firebase Realtime DB   │
│   (Autenticación)    │ │  (Asambleas en vivo)    │
│                      │ │                          │
│  • signInWithEmail   │ │  /asamblea/activa       │
│  • createUser        │ │  /asamblea/estado       │
│  • resetPassword     │ │  /asamblea/preguntaActual│
│                      │ │  /asamblea/respuestas/* │
│                      │ │  /borradores/*           │
└──────────────────────┘ └────────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Google Apps Script (Backend)       │
│   • Registro de miembros (Sheets)    │
│   • Asistencia / Stats              │
│   • Subida de fotos → Drive         │
│   • Sugerencias / Feedback          │
└──────────────────────────────────────┘
```

## 📦 Stack Tecnológico

| Componente | Tecnología |
|---|---|
| **Frontend** | HTML5 + CSS3 + JavaScript ES Modules (vanilla) |
| **Auth** | Firebase Auth v10.12 (email/password) |
| **DB en tiempo real** | Firebase Realtime Database |
| **Backend** | Google Apps Script (Web App) |
| **Base de datos** | Google Sheets (registro, asistencia) |
| **Almacenamiento** | Google Drive (fotos de perfil) |
| **Hosting** | GitHub Pages |
| **Fuentes** | Lora, Inter, Bebas Neue, Fraunces |

## 📄 Páginas

### `index.html` — Landing
- Página principal del grupo juvenil
- Galería de fotos, sección "Sobre nosotros", versículo bíblico
- Links a registro y login

### `login.html` — Inicio de Sesión
- Login con Firebase Auth (`signInWithEmailAndPassword`)
- Modal de reset de contraseña (`sendPasswordResetEmail`)
- Diseño glassmorphism dark

### `registro.html` — Registro (2 pasos)
1. **Verificar nombre** contra Google Sheets vía Apps Script (`validarMiembro`)
2. **Crear cuenta** en Firebase Auth + guardar email/UID en Sheets (`guardarEmail`)
- Solo miembros activos del grupo pueden registrarse

### `dashboard.html` — Panel del Miembro
- **Perfil:** nombre, foto de perfil (subida a Drive), estado (🟢 Activo / 🟡 En riesgo / 🔴 Inactivo)
- **Stats:** asistencias, tardanzas, faltas, fidelidad (%)
- **Banner de cumpleaños** automático
- **Modo asamblea:** banner en tiempo real (escucha Firebase RTDB `asamblea/activa`)
- **Sugerencias:** textarea → Apps Script
- **Feedback:** estrellas ⭐ + comentario → Apps Script
- **Foto de perfil:** comprime → base64 → Apps Script → Google Drive thumbnail

### `asamblea.html` — Modo Asamblea (Tiempo Real)
- **5 pantallas:** No activa → Esperando → Pregunta → Resultado → Podio
- **Escucha Firebase RTDB** en tiempo real para:
  - Estado de la asamblea (activa/inactiva/finalizada)
  - Pregunta actual con opciones y timer
  - Respuestas de otros participantes
- **Timer circular SVG** con animación de cuenta regresiva
- **Opciones de respuesta** con colores diferenciados (A=naranja, B=azul, C=dorado, D=rosa)
- **Sistema de puntos:** velocidad = más puntos (máx 1000, mín 200)
- **Podio final:** TOP 3 con fotos, coronas y pedestales animados
- **Ranking completo** con fotos de perfil de cada participante
- **Confetti** 🎊 animado en Canvas al finalizar
- **Bug fix:** `podioMostrado` flag evita re-renderizar el podio en cada tick de RTDB

### `admin.html` — Panel del Coordinador
- **Acceso restringido** a lista de emails admin
- **Toggle asamblea** ON/OFF (escribe en RTDB `asamblea/activa`)
- **Botón "Finalizar asamblea"** → dispara podio para todos los participantes
- **Botón "Reiniciar ranking"** → borra `/asamblea/respuestas` del RTDB
- **Nueva pregunta:** texto, 4 opciones (A-D), marca correcta, tiempo límite (10-60s)
- **Pregunta activa en vivo:** muestra la pregunta lanzada con respuestas en tiempo real
- **Respuestas en vivo:** cada respuesta muestra avatar + nombre + opción + puntos
- **Ranking en vivo:** con fotos de perfil, medallas 🥇🥈🥉
- **Borradores:** guardar/cargar/eliminar preguntas para reutilizar (RTDB `/borradores`)

## 🔐 Autenticación y Autorización

### Firebase Auth
- Proveedor: email/password (solo Gmail)
- Registro 2 pasos: verificación de nombre → creación de cuenta
- Reset de contraseña por email

### Lista de Admins (hardcodeada)
```javascript
const ADMINS = [
    "henry.alfaro1@unmsm.edu.pe",
    "paolosotil97@gmail.com",
    "jorgediego.123.2002@gmail.com",
    "gianfracamones@gmail.com",
    "alvarorodrigosalazar.2001@gmail.com"
];
```

## 🔥 Firebase Realtime Database — Estructura

```
luxto-nsp-default-rtdb/
├── asamblea/
│   ├── activa: boolean              // Toggle ON/OFF
│   ├── estado: "activa"|"finalizada" // Estado general
│   ├── preguntaActual/
│   │   ├── id: "p_1713..."          // ID único
│   │   ├── numero: 1                // Número de pregunta
│   │   ├── texto: "¿...?"           // Texto de la pregunta
│   │   ├── opciones: [...]           // Array de opciones
│   │   ├── correcta: 0              // Índice de la respuesta correcta
│   │   ├── duracion: 20             // Segundos
│   │   ├── estado: "activa"|"cerrada"|"esperando"
│   │   └── ts: 1713...              // Timestamp
│   └── respuestas/
│       └── {preguntaId}/
│           └── {uid}/
│               ├── nombre, email, fotoUrl
│               ├── respuesta, idx
│               ├── correcta, puntos, tiempo
│               └── ts
└── borradores/
    └── {key}/
        ├── texto, opciones, correcta
        ├── duracion, ts
```

## 📊 Google Apps Script — API

**URL:** `https://script.google.com/macros/s/AKfycb.../exec`

### Acciones (POST con JSON body):

| Acción | Descripción | Parámetros |
|---|---|---|
| `validarMiembro` | Verifica nombre contra Sheets | `nombre` |
| `guardarEmail` | Guarda email y UID en fila del Sheet | `fila`, `email`, `uid` |
| `getDashboard` | Obtiene stats del miembro | `email` |
| `guardarFotoUrl` | Sube foto base64 a Drive y guarda URL | `email`, `base64` |
| `guardarSugerencia` | Guarda sugerencia en Sheet | `nombre`, `email`, `sugerencia` |
| `guardarFeedback` | Guarda calificación + comentario | `nombre`, `email`, `calificacion`, `comentario` |

### `getDashboard` retorna:
```json
{
    "ok": true,
    "nombre": "María García",
    "fotoUrl": "https://drive.google.com/...",
    "esCumple": true,
    "msgCumple": "¡Feliz cumpleaños!",
    "estadisticas": {
        "asistencias": 8,
        "tardanzas": 2,
        "faltas": 1,
        "porcentaje": "80",
        "totalAsambleas": 11,
        "promedioRetraso": "3.5",
        "ultimaAsistencia": "2026-05-10",
        "estado": "🟢 Activo"
    }
}
```

## 🎨 Paleta de Colores

| Token | Color | Uso |
|---|---|---|
| `--y` | `#F5C518` | Dorado — títulos, puntos, acentos |
| `--o` | `#C4703A` | Naranja warm — gradientes, opción A |
| `--b` | `#4A8FA8` | Azul — opción B, links |
| `--r` | `#C4869A` | Rosa — opción D, detalles |
| `--ok` | `#2dba6f` | Verde — correcto, éxito |
| `--err` | `#e03c3c` | Rojo — incorrecto, error |
| `--bg` | `#16120d` | Fondo dark warm |
| `--bg2` | `#1f1a12` | Cards dark |
| `--cream` | `rgba(255,248,231,.9)` | Texto principal |

## 📱 Flujo de Usuario

```
Landing (index.html)
    ├── Registro (registro.html)
    │       1. Verificar nombre contra Sheets
    │       2. Crear cuenta Firebase Auth
    │       3. Guardar email en Sheets
    │       └── → Dashboard
    └── Login (login.html)
            ├── Ingresar con email/password
            ├── Reset contraseña
            └── → Dashboard

Dashboard (dashboard.html)
    ├── Peril + Stats de asistencia
    ├── Banner cumpleaños
    ├── Banner "¡Asamblea activa!" (si RTDB activa=true)
    ├── Subir foto de perfil → Drive
    ├── Enviar sugerencia → Sheets
    └── Enviar feedback ⭐ → Sheets

Asamblea (asamblea.html) — solo si activa
    ├── Esperar pregunta
    ├── Responder con timer
    ├── Ver resultado (correcto/incorrecto)
    ├── Repetir por cada pregunta
    └── Podio final 🏆 + confetti

Admin (admin.html) — solo coordinadores
    ├── Activar/desactivar asamblea
    ├── Lanzar preguntas (texto + opciones + timer)
    ├── Ver respuestas en vivo con fotos
    ├── Ver ranking en vivo
    ├── Finalizar asamblea → podio para todos
    ├── Reiniciar ranking (borrar respuestas)
    └── Guardar/cargar borradores de preguntas
```

## 🔒 Seguridad

- **Auth guard:** `onAuthStateChanged` redirige a login si no hay sesión
- **Admin guard:** lista de emails verificados en cada página protegida
- **Anti-XSS:** `textContent` en vez de `innerHTML` para datos dinámicos
- **onerror fix:** `this.onerror=null` evita loops infinitos en imágenes
- **Firebase config:** las claves están expuestas (normal en web apps cliente), la seguridad depende de las reglas de Firebase y Sheets

### Reglas de Firebase Realtime Database
\`\`\`json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null",
    "asamblea": {
      "activa": { ".read": true, ".write": "auth != null" },
      "estado": { ".read": true, ".write": "auth != null" },
      "preguntaActual": { ".read": true, ".write": "auth != null" },
      "respuestas": { ".read": "auth != null", ".write": "auth != null" }
    },
    "borradores": { ".read": "auth != null", ".write": "auth != null" },
    "rankingGlobal": { ".read": true, ".write": "auth != null" },
    "users": { ".read": "auth != null", ".write": "auth != null" }
  }
}
\`\`\`
> ⚠️ Los paths `asamblea/activa`, `asamblea/estado`, `asamblea/preguntaActual` y `rankingGlobal` tienen `.read: true` para que la asamblea sea accesible sin auth (para el modo asamblea en tiempo real). Las escrituras requieren autenticación.

### Bugs corregidos (2026-05-18)
- **Podio no aparecía:** Al finalizar la asamblea, `preguntaActualId` se reseteaba a `null` cuando la pregunta se cerraba, haciendo que el código pensara que el usuario no había participado. Se añadió `participoEnAsamblea` como flag independiente.
- **Ranking global no se reiniciaba:** Al finalizar la asamblea, las respuestas (`asamblea/respuestas`) no se borraban después de acumular en el ranking global, causando que los puntos viejos se sumaran nuevamente en la próxima finalización. Ahora se borran automáticamente.
- **Número de pregunta inconsistente:** `preguntaNumActual` no persistía en Firebase, causando inconsistencia si el admin recargaba la página. Ahora se guarda en `asamblea/preguntaNum`.

## 📂 Estructura de Archivos

```
luxto-nsp/
├── index.html          # Landing page
├── login.html          # Inicio de sesión
├── registro.html       # Registro de miembros (2 pasos)
├── dashboard.html      # Panel del miembro
├── asamblea.html       # Modo asamblea interactivo
├── admin.html          # Panel del coordinador
├── logo_luxto.png      # Logo del grupo
├── foto_grupo.jpg      # Foto grupal
└── README.md           # Este archivo
```

## 🚀 Deploy

El sitio está alojado en **GitHub Pages** desde el repositorio `luxtonsp-bot/luxto-nsp`.

```bash
# Clonar
git clone https://github.com/luxtonsp-bot/luxto-nsp.git

# Servir localmente (cualquier servidor estático)
npx serve .
# o
python3 -m http.server 8000
```

## ⚙️ Configuración Requerida

1. **Firebase Project:** Crear proyecto en [Firebase Console](https://console.firebase.google.com/)
   - Habilitar Authentication (email/password)
   - Habilitar Realtime Database
   - Configurar reglas de seguridad

2. **Google Apps Script:**
   - Crear proyecto con las funciones `doPost`
   - Desplegar como Web App (acceso: cualquiera)
   - Actualizar la URL en `registro.html`, `dashboard.html` y `asamblea.html`

3. **Google Sheets:**
   - Hoja de registro de miembros con columnas: Nombre, Email, UID, FotoURL, etc.
   - Hoja de asistencia con columnas: Fecha, Miembro, Estado (P/T/F)

---

*Hecho con ❤️ para la gloria de Dios — Mateo 5:16*
