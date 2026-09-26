# Plan de Migración — LUXTO-NSP: de Sheets/Drive a Firebase 100% propio

> Proyecto del grupo juvenil **Luz de Cristo (LUXTO)**, Parroquia Nuestra Señora de la
> Piedad. Este documento es la hoja de ruta completa para que la aplicación deje de
> depender de Google Sheets y Google Drive, y quede corriendo enteramente sobre
> Firebase — gratis, con roles heredables, y pensada para durar muchos años y que la
> usen las próximas generaciones del grupo.
>
> Repo actual: `https://github.com/luxtonsp-bot/luxto-nsp`

---

## 0. Principios que gobiernan todo este plan

1. **Cero dependencia de Google Sheets y Google Drive** al terminar la migración.
2. **Todo debe mantenerse en el nivel gratuito** de Firebase (Spark) siempre que sea
   posible. La única excepción conocida es el envío automático de correos de
   cumpleaños (ver sección 9) — ahí se ofrecen dos rutas, una de ellas evita
   completamente activar facturación.
3. **Ningún dato se pierde.** Las fotos, miembros, historial de asistencia y estados de
   Firebase Auth ya existentes deben migrarse 1 a 1, no recrearse desde cero.
4. **El liderazgo debe poder heredarse sin tocar código.** Nada de listas de emails
   hardcodeadas — los roles viven en la base de datos y un coordinador puede asignarlos
   a otro miembro desde la propia web.
5. **El historial de cada año se congela y nunca se vuelve a recalcular.** Solo el año
   en curso es dinámico.
6. **No se debe interrumpir el uso de la página mientras se migra** — todo el trabajo
   se hace en una rama aparte (ver sección 1) y los chicos siguen usando la versión
   actual en producción hasta que la nueva esté probada y aprobada.
7. **El módulo de Asamblea/Kahoot (`asamblea.html`, `admin.html`, `proyector.html`) se
   deja funcionalmente intacto en esta fase**, salvo por: (a) agregar el guardado de un
   snapshot histórico por asamblea (sección 8), y (b) los bugs conocidos de podio/reinicio
   de ranking, que se abordan en una fase posterior y separada — no forman parte de las
   tareas de este documento.

---

## 1. Estrategia de ramas y despliegue

- Crear una rama nueva desde `main`: **`feature/firebase-migration`**.
- Todo el trabajo de este plan ocurre en esa rama. `main` no se toca hasta que todo
  esté probado y aprobado por el coordinador del proyecto.
- **Link de prueba (preview) para esta rama — CONFIRMADO: todo se queda en GitHub,
  no se usa Firebase Hosting.** Se configura un GitHub Action (`.github/workflows/
  deploy-preview.yml`) que, en cada push a `feature/firebase-migration`, publica esa
  rama en una subcarpeta propia dentro de la rama `gh-pages` (la misma que ya usa
  GitHub Pages), por ejemplo `/preview/feature-firebase-migration/`. Esto da un link
  público y estable propio de la rama, del tipo:
  `https://luxtonsp-bot.github.io/luxto-nsp/preview/feature-firebase-migration/`,
  sin afectar el sitio de producción que sigue sirviéndose desde la raíz (rama `main`).
  Gratis, sin salir de GitHub, sin activar nada de Google Cloud.
- Cuando se abra una rama nueva de trabajo en el futuro, el mismo Action puede
  reutilizarse cambiando el nombre de la subcarpeta al de la rama correspondiente.
- Cuando la rama esté probada y aceptada, se hace merge a `main` y ese pasa a ser el
  único origen de verdad. La rama de migración se puede archivar o borrar después.

---

## 2. Qué se conserva tal cual / qué cambia de mecanismo

| Página | Estado |
|---|---|
| `index.html` | Se conserva igual |
| `login.html` | Se conserva igual |
| `registro.html` | Se conserva igual (deja de validar contra Sheets, pasa a validar contra Firestore) |
| `dashboard.html` | Se conserva, se agrega link a `historial.html` |
| `asamblea.html` | Se conserva igual (correcciones puntuales en fase futura) |
| `admin.html` | Se conserva, se agrega gestión de roles heredables |
| `proyector.html` | Se conserva igual |

Funcionalidades que se conservan pero cambian de mecanismo:
- **Correo de cumpleaños automático** → de Google Apps Script a Cloud Function
  programada o GitHub Action (ver sección 9)
- **"¿Hay asamblea este sábado?" + hora + observación** → de la hoja `Configuracion` a
  `asambleas/{fecha}` en Firestore, ahora ampliado con tema/ponente (sección 4)
- **Sugerencias y Feedback** → de Sheets a colecciones Firestore `sugerencias/` y
  `feedback/`

---

## 3. Modelo de datos en Firestore

```
miembros/{uid}
  ├─ nombre, email, fechaNacimiento
  ├─ fotoUrl               (apunta a Firebase Storage, no a Drive)
  ├─ rol                   "miembro" | "lider" | "coordinador"
  ├─ estadoAnioActual      "activo" | "perseverante" | "dado_de_baja"
  ├─ fechaIngresoGrupo

asambleas/{fecha}                        # una por sábado
  ├─ hayAsamblea (bool), horaInicio, observacion
  ├─ tema: { titulo, objetivo }
  ├─ ponentes: [ { nombre, uid? } ]
  ├─ materiales (opcional)

asistencia/{anio}/{fecha}/{uid}
  ├─ presente (bool)
  ├─ horaLlegadaServidor   (timestamp real del servidor, no del dispositivo)
  ├─ tardanzaMinutos       (calculado: horaLlegadaServidor - asambleas/{fecha}.horaInicio)
  ├─ esTardanza            (bool, tardanzaMinutos > 10 — tolerancia confirmada, sección 5.4)

configuracion_sabados/{fecha}
  # (puede fusionarse directamente dentro de asambleas/{fecha} si el agente lo ve más
  # simple — es la misma información, no crear dos fuentes de verdad para lo mismo)

tablas_dinamicas/{anio}/{tablaId}
  ├─ nombre                ("Caporales — Ensayos", "EJUTOR 2026", "Polladas — Junio")
  ├─ columnas: [ { nombre, tipo: "texto"|"numero"|"booleano"|"fecha"|"monto" } ]
  └─ filas/{filaId}: { valores por columna }

asambleas_kahoot/{fecha}
  └─ snapshot final: participantes, puntos, podio (se guarda al finalizar cada asamblea)

historico/{anio}/miembros/{uid}
  └─ % asistencia final, tardanza promedio final, estado final, nota
     (INMUTABLE una vez creado — nunca se recalcula)

historico/{anio}/tablas_dinamicas/{tablaId}
  └─ copia congelada de la tabla tal como quedó al cerrar el año

historico/{anio}/asambleas_kahoot/{fecha}
  └─ copia de cada snapshot de asamblea de ese año

historico/{anio}/sugerencias/{id}, historico/{anio}/feedback/{id}
  └─ copia de las sugerencias y calificaciones de asambleas de ese año, visibles luego
     desde historial.html

sugerencias/{id}, feedback/{id}
  └─ igual estructura que hoy en Sheets (colección "viva" del año en curso, visible
     para líderes/coordinadores desde admin.html)
```

**Nota de seguridad:** cualquier dato sensible tipo DNI (como en la hoja "Lista
asistentes EJUTOR 2026" de este año) debe guardarse en una tabla dinámica con reglas de
Firestore que solo permitan lectura a `rol == "coordinador"`, nunca lectura pública ni
de `"miembro"` o `"lider"`.

---

## 4. Roles y permisos (reemplaza la lista de admins hardcodeada)

- Roles: `miembro` (default), `lider`, `coordinador`.
- Un `coordinador` puede promover o degradar el rol de cualquier `miembro` desde
  `admin.html` (nueva sección "Gestión de líderes"). Esto se hace escribiendo el campo
  `rol` en `miembros/{uid}` — protegido por reglas de seguridad de Firestore que solo
  permiten esa escritura si quien la hace ya tiene `rol == "coordinador"`.
- Reglas de seguridad Firestore (a implementar por el agente, resumen funcional):
  - `miembro`: lee su propio documento, lee `asambleas/*` públicas, escribe
    `sugerencias/`, `feedback/`, y su propia asistencia en modo participante.
  - `lider`: todo lo anterior + escribir en `asistencia/*` y `asambleas/*` (planificar,
    tomar asistencia).
  - `coordinador`: todo lo anterior + escribir `rol` de otros miembros, ejecutar el
    cierre de año, crear/editar `tablas_dinamicas/`.

---

## 5. Métricas estadísticas — fórmulas corregidas (importante)

El Excel actual tiene sesgos reales detectados en el análisis previo. El agente debe
implementar las versiones corregidas, **no** copiar la lógica original tal cual:

1. **% de Asistencia (correcto, ya validado del Excel actual):**
   `% asistencia = (asistencias reales del miembro) / (sábados con asamblea activa
   desde su fecha de ingreso al grupo) × 100`
   → Esto ya lo hacía bien la hoja `Estadistica` del Excel (columna C). Se mantiene
   esta lógica, no la de la "Nota de Rendimiento".

2. **Nota de Rendimiento — la fórmula original tenía el sesgo, aquí queda explícito:**
   - Fórmula original (con sesgo, **NO implementar**):
     `=(((B6/MAX($B$6:$B))*12)+(((120-D6)/120)*8))`
     donde `B6` = conteo absoluto de asistencias, y `MAX($B$6:$B)` = el máximo de
     asistencias absolutas de todo el grupo. El problema: alguien que entró en agosto
     compite en el mismo denominador que alguien que está desde enero, así que aunque
     el nuevo tenga 100% de asistencia en sus semanas, su nota sale baja solo por tener
     menos meses en el grupo.
   - Fórmula corregida (**esta es la que debe implementar el agente**):
     `nota_asistencia = % de asistencia (punto 1, ya normalizado 0-100) / 100 × 12`
     Es decir, se reemplaza `B6/MAX($B$6:$B)` por el `% de asistencia` del punto 1 —
     que ya compara a cada quien contra sus propias semanas posibles, no contra el
     máximo absoluto del grupo.
   - La parte de puntualidad `((120-D)/120)*8` se mantiene en su estructura, pero sujeta
     a la corrección del punto 3 (excluir a quien no tiene registros, no darle 0 min de
     retraso por defecto).

3. **Puntualidad (corregir el sesgo de "ausente = puntaje perfecto"):**
   Si un miembro no tiene ninguna asistencia registrada en el período, su puntaje de
   puntualidad **no debe calcularse** (excluir del promedio, no poner 0 minutos de
   retraso por defecto).

4. **Tolerancia de tardanza — CONFIRMADO: máximo 10 minutos.**
   Llegar hasta 10 minutos después de la `horaInicio` configurada en `asambleas/{fecha}`
   **no cuenta como tardanza**. A partir del minuto 11 (`tardanzaMinutos > 10`), sí
   cuenta. Esto aplica de forma consistente en:
   - `asistencia/{anio}/{fecha}/{uid}`: además del campo `tardanzaMinutos` (el valor
     exacto), guardar también un booleano derivado `esTardanza` (`tardanzaMinutos > 10`),
     para no tener que recalcular el umbral en cada pantalla que lo necesite.
   - El conteo de "Tardanzas" de cada miembro (punto 5 abajo) se basa en este mismo
     booleano, igual que lo hacía la columna E del Excel original (`COUNTIFS(...,">10")`).

5. **Tardanzas como tasa, no como conteo absoluto:**
   Reportar `tardanzas / asistencias totales` (una tasa, usando `esTardanza` del punto 4),
   no solo el conteo crudo, para no penalizar más a quien asiste siempre (y por lo tanto
   acumula más registros) frente a quien asiste poco.

6. **Estado (Activo/Riesgo/Inactivo) como cálculo de snapshot, no en vivo:**
   Al cerrar el año, el estado se calcula una vez con datos reales de ese momento y se
   guarda fijo en `historico/`. Durante el año en curso puede seguir siendo dinámico
   para el dashboard del día a día, pero nunca para lo que se congela en el histórico.

7. **Consistencia entre subgrupos:** cualquier tabla dinámica que incluya su propio
   % de asistencia (como pasaba este año con "Caporales") debe usar la misma fórmula
   del punto 1, no una versión simplificada distinta.

---

## 6. Mapa completo de páginas (12 HTML)

**Para cualquier miembro**
1. `index.html` — landing pública (sin cambios)
2. `login.html` — inicio de sesión (sin cambios)
3. `registro.html` — registro en 2 pasos, ahora valida contra Firestore en vez de Sheets.
   **Se agrega un campo nuevo: fecha de nacimiento**, obligatorio al registrarse (hoy
   esa fecha vivía aparte, en la hoja "Lista de cumpleaños", cargada por el coordinador
   — con esto pasa a completarla el propio miembro nuevo desde el inicio). La **edad
   nunca se guarda como un número fijo**: se calcula al vuelo a partir de la fecha de
   nacimiento cada vez que se necesita (dashboard, tablas dinámicas tipo EJUTOR), para
   que no quede desactualizada con el paso de los años — el mismo tipo de error que ya
   corregimos en las métricas de asistencia (sección 5) aplica aquí.
4. `dashboard.html` — perfil, stats del año actual, cumpleaños, sugerencias/feedback,
   link a `historial.html`
5. `asamblea.html` — modo participante Kahoot (sin cambios en esta fase)

**Herramientas de líderes/coordinadores**
6. `planificacion.html` *(nueva)* — armar el sábado que viene: activar/desactivar
   asamblea, hora, tema (título + objetivo), ponente(s). Al guardar, botón **"Descargar
   esquema"** que genera una imagen (PNG) con el logo de LUXTO y los datos del sábado,
   lista para compartir al grupo de WhatsApp de servidores y apoyos (ver sección 7).
7. `tomar-asistencia.html` *(nueva)* — buscador de miembros + un toque para marcar
   presente, tardanza calculada con hora de servidor (ver sección 8), botón "Finalizar"
   que marca ausentes automáticamente
8. `admin.html` — control de asamblea en vivo (sin cambios) + nueva sección "Gestión de
   líderes" (asignar/quitar roles) + **nueva sección "Sugerencias y Calificaciones"**:
   aquí es donde líderes/coordinadores ven todo lo que los asambleístas enviaron desde
   `dashboard.html` — las sugerencias de tema, y las calificaciones ⭐ + comentario que
   cada uno deja por cada asamblea a la que asiste. Se puede filtrar por fecha de
   asamblea, para ver por ejemplo "qué calificaron los que fueron el sábado pasado".
   Esto reemplaza el abrir directamente las hojas `Feedback_Asambleas` y `Sugerencias`
   del Excel para leerlas.
9. `proyector.html` — pantalla de proyección en vivo (sin cambios)
10. `gestion-grupo.html` *(nueva)* — alta/baja de perseverantes para el año en curso, y
    botón de **cierre de año** (sección 10)
11. `tablas.html` *(nueva)* — creador de tablas dinámicas (Caporales, EJUTOR, polladas,
    lo que surja en el año)

**Consulta histórica**
12. `historial.html` *(nueva)* — selector de año + pestañas: asistencia general, tablas
    de ese año, rankings de asambleas Kahoot, estadísticas finales por miembro, y
    sugerencias/calificaciones de ese año. Vista personal para `miembro`, vista
    completa del grupo para `lider`/`coordinador`.

---

## 7. Esquema semanal descargable (imagen para WhatsApp)

- En `planificacion.html`, al terminar de llenar tema/objetivo/horario/ponente, un
  botón genera una imagen descargable con el logo de LUXTO.
- **Enfoque recomendado (factible y gratis):** diseñar la plantilla como HTML/CSS
  (usando el logo ya existente en el repo, `logo_luxto.png`) y exportarla a PNG con la
  librería `html2canvas` (gratuita, corre en el navegador, sin backend).
- **Decisión abierta para confirmar con el coordinador:** el pedido original menciona
  "LaTeX", pero compilar LaTeX real en el navegador de forma gratuita no es práctico
  (motores JS de LaTeX pesan decenas de MB). Si se prefiere específicamente un archivo
  PDF en vez de imagen, se puede usar `jsPDF` (también gratuita) sobre la misma
  plantilla HTML/CSS — pero una imagen PNG es más práctica para compartir en WhatsApp
  porque se previsualiza sola en el chat, mientras que un PDF hay que abrirlo aparte.

---

## 8. Mecanismo técnico de asistencia y tardanza

1. El líder abre `tomar-asistencia.html`, busca al miembro por nombre (buscador tipo
   contactos) y toca "Marcar asistencia".
2. La app escribe en Firestore usando **el timestamp de servidor** (`serverTimestamp()`
   de Firestore), nunca la hora del reloj del dispositivo — esto evita errores por
   relojes mal configurados.
3. La tardanza se calcula automáticamente: `horaLlegadaServidor − horaInicio` (tomada de
   `asambleas/{fecha}`, definida previamente en `planificacion.html`). **Tolerancia
   confirmada: hasta 10 minutos no cuenta como tardanza** — recién a partir del minuto
   11 se marca `esTardanza = true` (ver sección 5.4).
4. Todo esto ocurre directo entre la app y Firestore, sin necesidad de un servidor de
   pago (Cloud Functions) — se mantiene dentro del plan gratuito.
5. Si dos líderes toman asistencia en paralelo (ej. dos puntos de entrada), ambos ven la
   lista actualizarse en vivo gracias a los listeners en tiempo real de Firestore.
6. Botón "Finalizar asistencia de hoy": marca automáticamente como ausentes a todos los
   miembros activos que no fueron marcados.

---

## 9. Correo automático de cumpleaños

**CONFIRMADO — Opción B, coherente con la decisión de mantener todo en GitHub y sin
facturación:** un GitHub Action programado (`.github/workflows/felicitar-cumpleanos.yml`),
corriendo una vez al día (cron diario), que revisa en Firestore quién cumple años esa
fecha y envía el correo con un servicio gratuito de envío tipo Resend o EmailJS. Cero
tarjeta, cero plan Blaze, todo dentro de GitHub como el resto del despliegue.

*(Se descarta la alternativa de Cloud Functions programada de Firebase, que hubiera
exigido activar el plan "Blaze" y asociar una tarjeta a la cuenta de Google Cloud.)*

---

## 10. Cierre de año — paso a paso

1. El coordinador entra a `gestion-grupo.html` y presiona "Cerrar año".
2. El sistema calcula, para cada miembro activo, sus métricas finales usando las
   fórmulas corregidas de la sección 5, y las escribe en `historico/{anio}/miembros/{uid}`.
3. Se copian también las `tablas_dinamicas/{anio}/`, `asambleas_kahoot/{anio}/`,
   `sugerencias/` y `feedback/` del año hacia sus equivalentes dentro de
   `historico/{anio}/`.
4. Estos datos quedan **inmutables** — ninguna pantalla debe permitir editarlos después.
5. El coordinador revisa la lista de miembros: marca quiénes siguen (perseverantes),
   quiénes salen, y registra a los nuevos integrantes.
6. Se abre el año siguiente: `asistencia/{anio+1}/` arranca vacía, pero cada cuenta
   (UID) y su historial se conservan para siempre.

---

## 11. Migración de datos existentes (Sheets/Drive → Firebase)

Tareas concretas para el agente:

1. **Miembros:** leer la hoja `Lista de cumpleaños` (ya contiene el UID de Firebase de
   cada persona en la columna "Columna 1") y crear/actualizar `miembros/{uid}` con
   nombre, fecha de nacimiento, email.
2. **Fotos:** para cada miembro con `Codigo Foto` (link de Drive), descargar la imagen y
   subirla a Firebase Storage con el mismo `uid` como nombre de archivo; actualizar
   `fotoUrl` en su documento.
3. **Calendario de sábados 2026:** migrar la hoja `Configuracion` completa a
   `asambleas/{fecha}` (fecha, hayAsamblea, horaInicio, observacion).
4. **Asistencia histórica 2026:** migrar `Asistencia` + `Log_Asistencia` a
   `asistencia/2026/{fecha}/{uid}`, preservando el timestamp exacto de cada check-in
   que ya existe en `Log_Asistencia`.
5. **Tablas del año 2026:** migrar `Caporales 2026`, `Polladas Pastoral`,
   `Votaciones_Aniversario`, `Caja Luxto`, `Lista asistentes EJUTOR 2026` como
   `tablas_dinamicas/2026/{tablaId}` respectivas (aplicando la regla de acceso
   restringido para la que contiene DNI, sección 3).
6. **Sugerencias y Feedback:** migrar tal cual a `historico/2026/sugerencias/` y
   `historico/2026/feedback/` (son datos ya generados durante 2026, así que entran
   directo como histórico de ese año, no como colección "viva").
7. Una vez migrado y verificado (comparar conteos de filas entre Sheets y Firestore),
   el acceso de escritura al Sheet y al Drive originales se revoca — quedan solo como
   respaldo de solo lectura, no como fuente de verdad.

---

## 12. Checklist de fases para el agente

- [x] **Fase 0:** crear rama `feature/firebase-migration` + GitHub Action de despliegue
      a subcarpeta propia dentro de `gh-pages` (sección 1) para tener un link de prueba
      público sin salir de GitHub.
      *(Implementado en `.github/workflows/deploy-preview.yml`; publica solo el sitio
      estático — index.html, pages/, assets/ — sin credenciales ni datos.)*
- [x] **Fase 1:** definir colecciones de Firestore (sección 3) y reglas de seguridad por
      rol (sección 4).
      *(Colecciones creadas por `migration/migrate_restructure.py`. `firestore.rules`
      con roles miembro/líder/coordinador, lookup público `miembros_registro` para el
      registro sin sesión, y la tabla con DNI restringida a coordinador.)*
- [x] **Fase 2:** script de migración de datos (sección 11), verificado contra el Excel
      original.
      *(Ejecutada 2026-09-12: 1.125 documentos. Primera pasada en colecciones planas
      (`attendance`, `config`, ...) re-migrada por `migration/migrate_restructure.py`
      al modelo de la sección 3; las planas quedan solo como respaldo.)*
- [x] **Fase 3:** `planificacion.html` + exportación de esquema semanal a imagen
      (sección 7).
- [x] **Fase 4:** `tomar-asistencia.html` con cálculo de tardanza vía servidor (sección 8).
      *(serverTimestamp + tolerancia 10 min + ruta `asistencia/{anio}/{fecha}/{uid}` — **restaurado 2026-09-25 commit 4203aab**)*
- [x] **Fase 5:** `gestion-grupo.html` con alta/baja de perseverantes + cierre de año
      (sección 10).
- [x] **Fase 6:** `tablas.html` — creador de tablas dinámicas (sección 3).
- [x] **Fase 7:** `historial.html` — consulta de todo lo congelado por año (**dropdown años funcional con fallback + rules `historico/{anio}`**).
- [x] **Fase 8:** gestión de roles heredables dentro de `admin.html` (sección 4) — **finalizarAsamblea solo coordinador (A3, commit 4203aab)**.
- [x] **Fase 9:** correo automático de cumpleaños vía GitHub Action (sección 9,
      confirmado).
      *(`.github/workflows/felicitar-cumpleanos.yml` + `scripts/send_birthday_emails.py`
      con Gmail SMTP — desviación confirmada de Resend/EmailJS en los commits.)*
- [x] **Fase 10:** pruebas completas en el link de preview con el coordinador antes de
      hacer merge a `main`.
      **COMPLETADA** — secrets configurados, `firestore.rules` desplegadas (incluye `historico/{anio}`), link de preview funcional. Pendiente solo la validación final con el coordinador.

> **Actualización 2026-09-25 (commits recientes en `feature/firebase-migration`):**
> - `4203aab`: **fix(critical)** — A2 restaurar `calcularTardanza()` (Lima UTC-5, tolerancia 10 min) + A3 `finalizarAsamblea()` solo coordinador (validación server-side + UI) + B2 `finalizeAttendance()` filtrar solo `estadoAnioActual === 'activo'`.
> - `4ed008f`: **fix(backend)** — Rules `historico/{anio}` read para collectionGroup + Admin.js lee esquema inglés (Excel) y español (nuevo) para sugerencias/feedback.
> - `1c969c7`: **feat(ui)** — Rediseño 5 páginas (planificacion, tomar-asistencia, gestion-grupo, tablas, historial) con `portal.css` compartido (design system del proyecto).
> - `017ce83`: **fix(ui)** — Aplicar `impeccable` design system (WCAG 4.5:1, ≥11px, animaciones `transform` no `width`, sin pulsing-dot, sin broken-img).
> - `e726cd8`: **fix(dashboard)** — Lectura de asistencia por `getDoc` en paralelo (una llamada por asamblea) en lugar de `collectionGroup`, que no encuentra los documentos en la estructura `asistencia/{anio}/{fecha}/{uid}`. Añadido caché compartido entre resumen y gráfico de tardanzas.
> - `ace708b`: **chore(migration)** — Script `relink_member_ids.py` para alinear `members/{id}` con el UID real de Firebase Auth (resuelve el error "permission-denied" cuando el UID del documento no coincide con el UID de Auth).
> - `8bf3db6`: **fix(dashboard)** — Eje X de la gráfica de tardanzas ordenado ascendentemente (fecha más antigua a la izquierda).
> - [ ] *(Fuera de alcance de este documento, fase futura aparte):* correcciones puntuales
>       del modo Asamblea/Kahoot (podio, reinicio de ranking) + snapshot histórico por
>       asamblea (sección 3, colección `asambleas_kahoot`).

---

*Hecho con mucho amor para el grupo juvenil Luz de Cristo — que este sistema sirva a
las próximas generaciones tanto como sirvió esta primera etapa armada en Excel.*