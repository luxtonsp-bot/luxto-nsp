# 🕊️ Luxto-NSP — Portal del Grupo Juvenil Luz de Cristo

> **Parroquia Nuestra Señora de la Piedad** · Villa Jardín · San Luis · Lima · Perú  
> *Desde 2010 — "Así brille la luz de ustedes delante de los hombres..." (Mt 5:16)*

[![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-181717?logo=github)](https://luxtonsp-bot.github.io/luxto-nsp/)
[![Firebase](https://img.shields.io/badge/Firebase-v10-FFCA28?logo=firebase&logoColor=white)](https://firebase.google.com/)
[![Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-Backend-4285F4?logo=google&logoColor=white)](https://script.google.com/)
[![Vanilla JS](https://img.shields.io/badge/Vanilla-JS%20ESM-F7DF1E?logo=javascript&logoColor=black)]()
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

---

## 🎯 ¿Qué es Luxto-NSP?

Portal web completo para el **Grupo Juvenil Luz de Cristo** que integra:

| Capa | Tecnología | Qué hace |
|------|------------|----------|
| **Frontend** | HTML5 + CSS3 + Vanilla JS (ES Modules) | 8 páginas responsive, glassmorphism dark/light theme, animaciones fluidas |
| 
| **Auth & Real-time** | **Firebase Auth + Realtime Database** | Login Google, asambleas en vivo con timer, podio, ranking en tiempo real |
| **Backend & Data** | **Google Apps Script + Sheets + Drive** | Registro de miembros, asistencia, fotos, sugerencias, feedback, estadísticas |
| **Hosting** | **GitHub Pages** | Despliegue automático desde `main` |

---

## 📁 Estructura del Repositorio

```
luxto-nsp/
├── index.html           # Landing page pública (hero, quiénes somos, historia, coro, donaciones, CTA)
├── historia.html        # Cronología completa 2010-2025: directivas, asesores, coro, equipo, memoria
├── login.html           # Inicio de sesión con Firebase Auth (Google) + reset password
├── registro.html        # Registro 2 pasos: validar nombre en Sheet → crear cuenta Firebase
├── dashboard.html       # Panel del miembro: stats, nota rendimiento, sugerencias, feedback, cumpleaños
├── asamblea.html        # Vista móvil del miembro: solo letras A/B/C/D grandes + timer circular
├── proyector.html       # Vista proyector (pantalla grande): pregunta completa, ranking en vivo, admin bar
├── admin.html           # Panel coordinador: crear preguntas, activar asamblea, ranking global, finalizar
├── proyector_logic.js   # Lógica compartida proyector (Firebase listeners, timer, ranking, countdown)
├── logo_luxto.png       # Logo del grupo
├── foto_grupo.jpg       # Foto grupal (hero)
├── *.jpg / *.png        # Fotos de directivos, coro, historia (referenciadas en historia.html)
├── remove_watermark.py  # Script utilidad para limpiar marcas de agua de imágenes
└── README.md            # Este archivo
```

---

## 🌐 Páginas y Funcionalidades

### 1. `index.html` — Landing Pública
- **Hero** con foto grupal animada, stats (2010, 9 periodos, +50 servidores)
- **Quiénes somos**: valores (Fe, Fraternidad, Servicio, Misión) + timeline 2010-2025
- **Historia** (resumen con link a `historia.html`)
- **Coro Parroquial**: servicios (animación litúrgica, ensayos, formaciones, eventos) + contacto WhatsApp
- **Donaciones**: 3 métodos (Yape, Plin, Transferencia) + QR placeholders + transparencia de uso de fondos
- **CTA** de ingreso al portal miembros
- **Versículos bíblicos** (Sal y Luz) + Footer con redes sociales

### 2. `historia.html` — Cronología Épica Completa
> **Nueva (2025)** — Rediseño total con estilo histórico/inmersivo
- **Fundación**: 15 nov 2010 (creación) · 30 abr 2011 (nombre oficial "Luz de Cristo")
- **9 Períodos directivos** (2011-2025) con tarjetas de persona: foto, cargo, rol
- **Estados especiales**: 
  - `memoria` → 🕯️ vela animada para fallecidos (Omar Naveda † 2025)
  - `asesor-card` → badge azul para asesores espirituales
- **Sección Coro**: historia + timeline servicios + cards de servicio + contacto
- **Equipo por período**: chips con avatar + nombre
- **Footer** con versículo, links, redes sociales (IG, FB, TT, YT)

### 3. `login.html` / `registro.html` — Auth Firebase
| Flujo | Detalle |
|-------|---------|
| **Login** | Email/contraseña + "¿Olvidaste contraseña?" (Firebase `sendPasswordResetEmail`) |
| **Registro** | **Paso 1**: Valida nombre completo contra Google Sheet (Apps Script `validarMiembro`)<br>**Paso 2**: Si existe → crea usuario Firebase Auth + guarda `email` + `uid` en Sheet (`guardarEmail`) |
| **Seguridad** | Solo miembros registrados en el Sheet oficial pueden crear cuenta |

### 4. `dashboard.html` — Panel del Miembro
- **Banner cumpleaños** 🎂 con confetti automático
- **Hero "Nota de Rendimiento"**: gauge SVG animado (0-20) + mensaje contextual + chip estado
- **Stats Grid** (animados 0→valor): Asistencias ✅ · Tardanzas ⏰ · Faltas ❌ · Fidelidad 🔥 (% + barra)
- **Resumen asistencia**: total, asistencias, tardanzas, promedio retraso, última, estado (activo/riesgo/inactivo)
- **Sugerir tema**: textarea → Apps Script `guardarSugerencia`
- **Feedback estrellas** (1-5) + comentario → Apps Script `guardarFeedback`
- **Modo Asamblea banner** (se muestra solo si `asamblea/activa=true` en Firebase)
- **Reveal on scroll** (IntersectionObserver) + confetti en logros

### 5. Sistema de Asambleas en Tiempo Real (3 vistas sincronizadas)

> **Arquitectura:** Firebase Realtime Database como bus de eventos + Apps Script como persistencia histórica

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

#### `admin.html` — Panel Coordinador ⚙️
- **Toggle Asamblea ON/OFF** (escritura atómica: limpia respuestas, resetea `preguntaNum=0`)
- **Crear preguntas** (guardadas en `/borradores`): texto, 2-4 opciones, correcta (radio), duración (10-60s)
- **Historial preguntas** guardadas (cargar/eliminar)
- **Pregunta activa en vivo**: texto, opciones, respuestas recibidas en tiempo real (foto, nombre, respuesta, ✓/✗, pts, tiempo)
- **Ranking en vivo** (top 10 con fotos)
- **Ranking Global Histórico** (acumulado de todas las asambleas en `/rankingGlobal`)
- **Botones de control**:
  - `🚀 Lanzar pregunta 1` / `Siguiente →` (con countdown 3-2-1 en proyector)
  - `⏹ Cerrar pregunta` (revela correcta + ranking)
  - `🏁 Finalizar asamblea` (acumula en ranking global + borra respuestas + podio)
  - `🔄 Reiniciar ranking` (solo esta asamblea) / `♻️ Reiniciar ranking global` (todo histórico)

#### `proyector.html` — Vista Pantalla Grande 🖥️
- **Pantallas**: Espera → Countdown 3-2-1 → Pregunta completa (texto + 4 opciones con barras % en vivo) → Ranking → Podio final
- **Admin Bar** (solo admins, toggleable): botones Lanzar/Siguiente/Cerrar/Finalizar/Ver Ranking
- **Respuestas en vivo**: barras de porcentaje por opción + contadores
- **Timer** circular SVG + barra horizontal (cambio color: amarillo → naranja → rojo)
- **Animaciones**: entrada de tarjetas, pop-in correcta, confetti en podio
- **Watermark** "Luz de Cristo" esquina inferior

#### `asamblea.html` — Vista Móvil Miembro 📱
- **Solo letras grandes A/B/C/D** (el texto completo se lee en proyector)
- **Timer** circular + barra + hint "📺 Lee las opciones en el proyector"
- **Selección visual** (escala + color) → envío a Firebase
- **Resultado**: ✅/❌/⏰ + puntos ganados (fórmula: `1000 * (1 - tiempoRespuesta / duracion / 2)`, mínimo 200)
- **Podio final** (top 3 con pedestales animados) + ranking completo + confetti
- **Botón "Volver al dashboard"**

#### Estructura Firebase `/asamblea`
```json
{
  "activa": true,
  "estado": "activa",                    // "activa" | "finalizada"
  "preguntaNum": 5,
  "preguntaActual": {
    "id": "p_1700000000000",
    "numero": 5,
    "texto": "¿...?",
    "opciones": ["A", "B", "C", "D"],
    "correcta": 2,
    "duracion": 20,
    "estado": "activa",                  // "activa" | "cerrada" | "esperando"
    "ts": 1700000000000
  },
  "respuestas": {
    "p_1700000000000": {
      "uid1": { "nombre":"Juan","email":"...","fotoUrl":"...","fotoMostrar":"...","respuesta":"C","idx":2,"correcta":true,"puntos":850,"tiempo":3.2,"ts":{".sv":"timestamp"} }
    }
  }
}
```

#### Ranking Global (`/rankingGlobal`)
```json
{
  "uid_key": { "nombre":"Juan","email":"...","fotoUrl":"...","pts":3420,"ultimaAsamblea":1700000000000 }
}
```

---

## ⚙️ Google Apps Script Backend

**URL Base:** `https://script.google.com/macros/s/AKfycbykddHb1fYX7TOK6tt6Dx11f_SDjJOcFawZbjAjgQn7oJ9Zj0Jm8IWJ1BvMX_XuGOgK6g/exec`

| Acción | Parámetros | Qué hace |
|--------|------------|----------|
| `getDashboard` | `email` | Stats miembro (asistencias, tardanzas, faltas, %, nota, estado, última, esCumple, msgCumple, fotoUrl, nombre) |
| `validarMiembro` | `nombre` | Busca en Sheet "Miembros" (col A), retorna `ok`, `fila`, `nombreReal` |
| `guardarEmail` | `fila`, `email`, `uid` | Escribe email (col B) y UID (col C) en fila del miembro |
| `guardarFotoUrl` | `email`, `base64` | Sube a Drive, retorna `fotoUrl` (thumbnail público) |
| `guardarSugerencia` | `nombre`, `email`, `sugerencia` | Añade fila a Sheet "Sugerencias" (timestamp, nombre, email, texto) |
| `guardarFeedback` | `nombre`, `email`, `calificacion`, `comentario` | Añade fila a Sheet "Feedback" (timestamp, nombre, email, 1-5, texto) |

**Sheets esperadas:**
- `Miembros` → A: Nombre, B: Email, C: UID, D: FotoUrl, E: Generación, F: Cumpleaños, G: NotaRendimiento
- `Asistencia` → log por fecha (para calcular stats)
- `Sugerencias` / `Feedback` → logs

---

## 🔒 Seguridad

### Protecciones implementadas
- **Auth guard**: `onAuthStateChanged` redirige a login si no hay sesión
- **Admin guard**: lista de emails verificados en cada página protegida
- **Anti-XSS**: `textContent` en vez de `innerHTML` para datos dinámicos
- **onerror fix**: `this.onerror=null` evita loops infinitos en imágenes

### Firebase config

Firebase config (apiKey, etc.) es público por diseño en apps cliente — **no es un secreto**, Google lo documenta así. La seguridad real reside en las reglas de Realtime Database, no en ocultar esta configuración.

### Reglas de Firebase Realtime Database

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "admins": {
      ".read": "auth != null",
      ".write": false
    },
    "asamblea": {
      "activa": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
      "estado": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
      "preguntaActual": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
      "preguntaNum": { ".read": true, ".write": "auth != null && root.child('admins').child(auth.uid).exists()" },
      "respuestas": {
        ".read": "auth != null",
        "$preguntaId": {
          "$uid": {
            ".write": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).exists())"
          }
        }
      }
    },
    "borradores": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('admins').child(auth.uid).exists()"
    },
    "rankingGlobal": {
      ".read": true,
      ".write": "auth != null && root.child('admins').child(auth.uid).exists()"
    },
    "users": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).exists())",
        ".write": "auth != null && (auth.uid === $uid || root.child('admins').child(auth.uid).exists())"
      }
    }
  }
}
```

> Las lecturas públicas (`asamblea/activa`, `estado`, `preguntaActual`, `rankingGlobal`) siguen sin requerir autenticación, para que el modo asamblea y el proyector funcionen sin login. Las escrituras ahora requieren que el UID del usuario exista en el nodo `/admins` (verificado en el servidor), no solo que esté logueado.

### Lista de Admins (autorización en servidor)

Los emails de coordinadores en el código (`ADMINS` array en cada HTML) solo controlan la interfaz (mostrar/ocultar botones de admin). La autorización real ocurre en las reglas de Firebase, que verifican el UID del usuario autenticado contra un nodo `/admins` en la base de datos:

```
/admins/{uid}: true
```

Esto evita que alguien manipulando el JavaScript del navegador pueda escribir datos sin ser realmente administrador, ya que la validación ahora vive del lado del servidor (Firebase Rules), no solo en el cliente.

---

## 🎨 Diseño & UX

| Aspecto | Detalle |
|---------|---------|
| **Paleta** | Amarillo `#F5C518` · Naranja `#C4703A` · Azul `#4A8FA8` · Rosa `#C4869A` · Negro cálido `#2a2218` · Crema `#FBF7EE` |
| **Tipografía** | `Lora` (serif, títulos) · `Inter`/`Outfit` (sans, UI) · `Cinzel` (display, historia) · `Bebas Neue` (números grandes) · `Fraunces` (acento) |
| **Tema** | Light (index, historia, login/registro) · Dark (dashboard, asamblea, proyector, admin) |
| **Efectos** | Glassmorphism, gradientes radiales animados, float/spin keyframes, reveal-on-scroll, confetti canvas |
| **Responsive** | Mobile-first, breakpoints 980px / 640px / 560px, hamburger menu, grids auto-fit |
| **Accesibilidad** | `prefers-reduced-motion`, focus-visible, alt en imágenes, semántica HTML5 |

---

## 🚀 Despliegue

### GitHub Pages (Automático)
1. Push a `main` → GitHub Actions / Pages sirve desde root
2. URL: `https://luxtonsp-bot.github.io/luxto-nsp/`

### Configuración previa
1. **Firebase Console** → Authentication → Sign-in method → Email/Password ✅
2. **Firebase Console** → Realtime Database → Create database → Reglas (ver arriba)
3. **Google Cloud** → Apps Script → Desplegar como "Web App" (Execute as: Me, Access: Anyone) → Copiar URL a `API` constante en todos los HTML
4. **Google Sheet** → Columnas según tabla backend
5. **Drive** → Carpeta para fotos de perfil (Apps Script sube ahí)

---

## 📝 Changelog Reciente (desde `2f80ba2` → `575607f`)

| Commit | Fecha | Cambio |
|--------|-------|--------|
| `575607f` | 2025 | Fotos Pilar Arana y Cecilia Salazar periodo 2015-2017 |
| `4040b1a` | 2025 | Eliminar badges cargo redundantes en historia.html |
| `66c2b34` | 2025 | Foto Padre Andrés actualizada |
| `397588e` | 2025 | Fotos de miembros en historia.html |
| `32f3250` | 2025 | Directivas 2023-2025 y 2026-presente con equipo correcto |
| `399f108` | 2025 | **Nueva sección "Historia del Coro" en historia.html** |
| `8135603` | 2025 | Botones TikTok y YouTube en footer historia.html |
| `effc688` | 2025 | Rediseño Quiénes Somos + historia.html estilo épico |
| `de1c52e` | 2025 | **Refactor total asambleas**: admin solo sube preguntas, proyector controla todo (countdown, ranking, finalizar), asamblea.html solo letras A/B/C/D |
| `c3ecd75` | 2025 | **Modo Proyector**: nuevo `proyector.html`, link en admin, asamblea.html móvil-only |
| `c48a2fc` | 2025 | Dashboard: estética + nuevas métricas (nota rendimiento gauge, fidelidad, cumpleaños) |
| `d301b23` | 2025 | Update asamblea.html |

### Mejoras de seguridad (2026-06-30)

- **Reglas de Firebase inseguras (alerta automática de Firebase):** La regla raíz original (`.read`/`.write`: `"auth != null"`) permitía que cualquier usuario logueado leyera y escribiera TODA la base de datos, no solo los administradores. Firebase detectó esto automáticamente y envió una alerta por correo. Se corrigió implementando reglas granulares por nodo, con verificación de admin vía `/admins/{uid}` en vez de depender únicamente del check de JavaScript en el cliente (que era fácilmente evadible).

---

---

## 🛠️ Desarrollo Local

```bash
# Clonar
git clone https://github.com/luxtonsp-bot/luxto-nsp.git
cd luxto-nsp

# Servidor local (cualquier static server)
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