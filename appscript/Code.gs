// ═══════════════════════════════════════════════════════════════
//  APPS SCRIPT COMPLETO — Portal Luz de Cristo
//
//  INSTRUCCIONES:
//  1. Abre Apps Script del Spreadsheet
//  2. Borra TODO el contenido de Código.gs
//  3. Pega este código completo
//  4. Borra los archivos Alertas cumpleaños.gs y Votaciones.gs
//     (ya están incluidos aquí)
//  5. Click Implementar → Administrar implementaciones
//     → Edita la implementación ACTIVA (no crear nueva)
//     → Nueva versión → Guardar
//  6. La URL /exec no cambia si editas la implementación existente
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = "1-aljndSY3ZKiCLMJk1DiKtTxjAz6bfuSswS0kpSn5fI";
const SHEET_MIEMBROS = "Lista de cumpleaños";
const SHEET_VOT      = "Votaciones_Aniversario";

// ───────────────────────────────────────────────────────────────
//  HELPER — respuesta JSON con CORS
// ───────────────────────────────────────────────────────────────
function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────────────────────────────────────────
//  ROUTER POST
// ───────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const accion = data.accion || "";

    if (accion === "validarMiembro")    return validarMiembro(data);
    if (accion === "guardarEmail")      return guardarEmail(data);
    if (accion === "getDashboard")      return getDashboard(data);
    if (accion === "guardarFotoUrl")    return guardarFotoUrl(data);
    if (accion === "registrarVotos")    return registrarVotos(data);
    if (accion === "guardarSugerencia") return guardarSugerencia(data);
    if (accion === "guardarFeedback")   return guardarFeedback(data);
    if (accion === "getHistorialAsistencia") return getHistorialAsistencia(data);

    return corsResponse({ ok: false, error: "Acción desconocida: " + accion });
  } catch(err) {
    return corsResponse({ ok: false, error: err.toString() });
  }
}

// ───────────────────────────────────────────────────────────────
//  ROUTER GET
// ───────────────────────────────────────────────────────────────
function doGet(e) {
  const accion = (e.parameter && e.parameter.accion) ? e.parameter.accion : "";
  if (accion === "modoAsamblea") return getModoAsamblea(e);
  if (accion === "getPreguntas") return getPreguntas(e);
  return corsResponse({ ok: true, status: "activo" });
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO 1 — REGISTRO Y LOGIN
// ═══════════════════════════════════════════════════════════════

function validarMiembro(data) {
  const normalizar = s => (s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const nombreIngresado    = normalizar(data.nombre);
  const palabrasIngresadas = nombreIngresado.split(/\s+/).filter(p => p.length > 2);

  if (palabrasIngresadas.length < 2) {
    return corsResponse({ ok: false, error: "Ingresa al menos tu nombre y apellido." });
  }

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hoja  = ss.getSheetByName(SHEET_MIEMBROS);
  const filas = hoja.getDataRange().getValues();

  // Primero recolectar TODOS los candidatos con al menos 1 palabra en común
  let candidatos = [];
  for (let i = 1; i < filas.length; i++) {
    const nombreSheet    = normalizar(filas[i][0]);
    const palabrasSheet  = nombreSheet.split(/\s+/).filter(p => p.length > 2);
    const coincidencias  = palabrasIngresadas.filter(p => palabrasSheet.includes(p)).length;
    if (coincidencias >= 1) {
      candidatos.push({ i, coincidencias, palabrasSheet, filas: filas[i] });
    }
  }

  if (candidatos.length === 0) {
    return corsResponse({ ok: false, error: "Tu nombre no está en el registro del grupo. Contacta al coordinador." });
  }

  // Si hay más de 1 candidato (hermanos con mismo apellido),
  // exigir al menos 2 coincidencias para diferenciarlos
  const minimo = candidatos.length > 1 ? 2 : 1;
  const buenos = candidatos.filter(c => c.coincidencias >= minimo);

  if (buenos.length === 0) {
    return corsResponse({ ok: false, error: "Encontramos varios miembros con ese apellido. Ingresa también tu nombre de pila para identificarte mejor." });
  }

  // Tomar el de mayor coincidencia
  buenos.sort((a, b) => b.coincidencias - a.coincidencias);
  const mejor = buenos[0];

  const emailExistente = mejor.filas[2] || "";
  if (emailExistente) {
    return corsResponse({ ok: false, error: "Este miembro ya tiene una cuenta registrada." });
  }

  return corsResponse({ ok: true, fila: mejor.i + 1, nombreReal: mejor.filas[0] });
}

function guardarEmail(data) {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hoja = ss.getSheetByName(SHEET_MIEMBROS);
  hoja.getRange(data.fila, 3).setValue(data.email); // col C = email
  hoja.getRange(data.fila, 5).setValue(data.uid);   // col E = Firebase UID
  return corsResponse({ ok: true });
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO 2 — DASHBOARD PRIVADO
// ═══════════════════════════════════════════════════════════════

function getDashboard(data) {
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hojaMiemb = ss.getSheetByName(SHEET_MIEMBROS);
  const hojaEstad = ss.getSheetByName("Estadistica");
  const hojaConf  = ss.getSheetByName("Configuracion");

  const email    = (data.email || "").trim().toLowerCase();
  const miembros = hojaMiemb.getDataRange().getValues();

  let miembro = null;
  let nombre  = "";
  for (let i = 1; i < miembros.length; i++) {
    if ((miembros[i][2] || "").toString().trim().toLowerCase() === email) {
      miembro = miembros[i];
      nombre  = miembros[i][0];
      break;
    }
  }
  if (!miembro) return corsResponse({ ok: false, error: "Miembro no encontrado." });

  // Cumpleaños
  const fechaNac = miembro[1];
  let esCumple   = false;
  let msgCumple  = "";
  if (fechaNac instanceof Date && !isNaN(fechaNac)) {
    const hoy = new Date();
    if (fechaNac.getDate() === hoy.getDate() && fechaNac.getMonth() === hoy.getMonth()) {
      esCumple  = true;
      msgCumple = "🎂 ¡Hoy es tu cumpleaños! El grupo Luz de Cristo te desea un día lleno de luz y bendiciones. ¡Feliz cumpleaños, " + nombre.split(" ")[0] + "!";
    }
  }

  // Estadísticas
  let estadisticas = null;
  if (hojaEstad) {
    const estadData = hojaEstad.getDataRange().getValues();
    for (let i = 1; i < estadData.length; i++) {
      if ((estadData[i][0] || "").toString().trim().toLowerCase() === nombre.trim().toLowerCase()) {
        const ultimaRaw = estadData[i][5];
        let ultimaFmt = "—";
        if (ultimaRaw && ultimaRaw !== "Sin registros") {
          try {
            const d = (ultimaRaw instanceof Date) ? ultimaRaw : new Date(ultimaRaw);
            if (!isNaN(d.getTime()) && d.getFullYear() > 1970) {
              ultimaFmt = Utilities.formatDate(d, "America/Lima", "dd/MM/yyyy");
            } else {
              ultimaFmt = ultimaRaw.toString();
            }
          } catch(ex) { ultimaFmt = ultimaRaw.toString(); }
        }

        let totalAsambleas = 0;
        if (hojaConf) {
          const confData = hojaConf.getDataRange().getValues();
          const hoy = new Date();
          for (let j = 1; j < confData.length; j++) {
            try {
              const fechaConf = new Date(confData[j][0]);
              if (confData[j][1] == 1 && fechaConf <= hoy) totalAsambleas++;
            } catch(ex) {}
          }
        }

        estadisticas = {
          asistencias:      estadData[i][1] || 0,
          porcentaje:       estadData[i][2] || 0,
          promedioRetraso:  estadData[i][3] || 0,
          tardanzas:        estadData[i][4] || 0,
          ultimaAsistencia: ultimaFmt,
          notaRendimiento:  estadData[i][6] || null,
          estado:           estadData[i][7] || "—",
          totalAsambleas:   totalAsambleas,
          faltas:           Math.max(0, totalAsambleas - (estadData[i][1] || 0))
        };
        break;
      }
    }
  }

  const fotoUrl   = miembro[3] || "";
  const filaMiemb = miembros.findIndex(
    (m, idx) => idx > 0 && (m[2] || "").toString().trim().toLowerCase() === email
  ) + 1;

  return corsResponse({ ok: true, nombre, esCumple, msgCumple, fotoUrl, estadisticas, fila: filaMiemb });
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO 2.5 — HISTORIAL DE ASISTENCIA POR SESIÓN (NUEVO)
// ═══════════════════════════════════════════════════════════════
function getHistorialAsistencia(data) {
  const ss        = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hojaMiemb = ss.getSheetByName(SHEET_MIEMBROS);
  const hojaLog   = ss.getSheetByName("Log_Asistencia");
  const hojaAsist = ss.getSheetByName("Asistencia");

  const email    = (data.email || "").trim().toLowerCase();
  const miembros = hojaMiemb.getDataRange().getValues();

  let nombre = "";
  for (let i = 1; i < miembros.length; i++) {
    if ((miembros[i][2] || "").toString().trim().toLowerCase() === email) {
      nombre = miembros[i][0];
      break;
    }
  }
  if (!nombre) return corsResponse({ ok: false, error: "Miembro no encontrado." });

  const fechasHeader = hojaAsist.getRange(1, 1, 1, hojaAsist.getLastColumn()).getValues()[0];
  const logData = hojaLog.getDataRange().getValues();
  const historial = [];

  for (let i = 1; i < logData.length; i++) {
    const fila = logData[i];
    if ((fila[1] || "").toString().trim() !== nombre.toString().trim()) continue;

    const celda = (fila[3] || "").toString();
    const match = celda.match(/^([A-Z]+)(\d+)$/);
    if (!match) continue;

    const colIndex = match[1].split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
    let fechaRaw = fechasHeader[colIndex - 1];
    let fechaFmt = (fechaRaw instanceof Date && !isNaN(fechaRaw))
      ? Utilities.formatDate(fechaRaw, "America/Lima", "dd/MM")
      : (fechaRaw || "").toString();

    historial.push({
      fecha:    fechaFmt,
      tardanza: fila[5] || 0,
      ts:       fila[0] instanceof Date ? fila[0].getTime() : 0
    });
  }

  historial.sort((a, b) => a.ts - b.ts);

  return corsResponse({ ok: true, nombre, historial });
}

// ═══════════════════════════════════════════════════════════════
//  GUARDAR FOTO — FIX PRINCIPAL
// ═══════════════════════════════════════════════════════════════
function guardarFotoUrl(data) {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hoja = ss.getSheetByName(SHEET_MIEMBROS);

  const emailUsuario = (data.email || "").trim().toLowerCase();
  const datos = hoja.getDataRange().getValues();
  let filaReal = -1;

  for (let i = 1; i < datos.length; i++) {
    if ((datos[i][2] || "").toString().trim().toLowerCase() === emailUsuario) {
      filaReal = i + 1;
      break;
    }
  }

  if (filaReal === -1) {
    return corsResponse({ ok: false, error: "Usuario no encontrado para guardar foto." });
  }

  if (!data.base64 || !data.base64.includes(",")) {
    return corsResponse({ ok: false, error: "No se recibió imagen válida." });
  }

  try {
    const partes    = data.base64.split(",");
    const mimeType  = partes[0].match(/:(.*?);/)[1];
    const bytes     = Utilities.base64Decode(partes[1]);
    const nombreArchivo = "foto_usuario_" + filaReal + ".jpg";
    const blob      = Utilities.newBlob(bytes, mimeType, nombreArchivo);

    let carpeta;
    const carpetas = DriveApp.getFoldersByName("Fotos_Miembros_LuzdeCristo");
    if (carpetas.hasNext()) {
      carpeta = carpetas.next();
    } else {
      carpeta = DriveApp.createFolder("Fotos_Miembros_LuzdeCristo");
    }

    const archivosAnteriores = carpeta.getFilesByName(nombreArchivo);
    while (archivosAnteriores.hasNext()) {
      archivosAnteriores.next().setTrashed(true);
    }

    const archivo = carpeta.createFile(blob);

    try {
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      Logger.log("setSharing OK para fila " + filaReal);
    } catch(sharingErr) {
      Logger.log("setSharing falló (no crítico): " + sharingErr.toString());
      try {
        archivo.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
        Logger.log("setSharing ANYONE OK como fallback");
      } catch(sharingErr2) {
        Logger.log("Ambos setSharing fallaron. La foto estará en Drive pero puede no ser pública.");
      }
    }

    const url = "https://drive.google.com/uc?export=view&id=" + archivo.getId();
    hoja.getRange(filaReal, 4).setValue(url);
    Logger.log("URL guardada en fila " + filaReal + ": " + url);

    return corsResponse({ ok: true, fotoUrl: url });

  } catch(err) {
    Logger.log("Error crítico en guardarFotoUrl: " + err.toString());
    return corsResponse({ ok: false, error: "Error al procesar imagen: " + err.toString() });
  }
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO 3 — VOZ DEL MIEMBRO
// ═══════════════════════════════════════════════════════════════
function guardarSugerencia(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName("Sugerencias");
  if (!hoja) {
    hoja = ss.insertSheet("Sugerencias");
    hoja.getRange(1, 1, 1, 5).setValues([["Fecha_Envio", "Nombre", "Email", "Sugerencia", "Semana"]]);
    hoja.getRange(1, 1, 1, 5).setBackground("#F5C518").setFontWeight("bold");
    hoja.setColumnWidth(1, 160);
    hoja.setColumnWidth(2, 160);
    hoja.setColumnWidth(3, 200);
    hoja.setColumnWidth(4, 400);
    hoja.setColumnWidth(5, 120);
  }
  const hoy    = new Date();
  const semana = Utilities.formatDate(hoy, "America/Lima", "dd/MM/yyyy");
  hoja.appendRow([
    Utilities.formatDate(hoy, "America/Lima", "dd/MM/yyyy HH:mm"),
    data.nombre,
    data.email,
    data.sugerencia,
    semana
  ]);
  return corsResponse({ ok: true });
}

function guardarFeedback(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let hoja = ss.getSheetByName("Feedback_Asambleas");
  if (!hoja) {
    hoja = ss.insertSheet("Feedback_Asambleas");
    hoja.getRange(1, 1, 1, 6).setValues([["Fecha_Envio", "Nombre", "Email", "Calificacion_Estrellas", "Comentario", "Fecha_Asamblea"]]);
    hoja.getRange(1, 1, 1, 6).setBackground("#C4703A").setFontColor("white").setFontWeight("bold");
    hoja.setColumnWidth(1, 160);
    hoja.setColumnWidth(2, 160);
    hoja.setColumnWidth(3, 200);
    hoja.setColumnWidth(4, 80);
    hoja.setColumnWidth(5, 400);
    hoja.setColumnWidth(6, 120);
  }

  let fechaAsamblea = "—";
  try {
    const hojaConf = ss.getSheetByName("Configuracion");
    const confData = hojaConf.getDataRange().getValues();
    const hoyMs    = new Date().getTime();
    let ultimaFecha = null;
    for (let i = 1; i < confData.length; i++) {
      if (confData[i][1] == 1) {
        const f = new Date(confData[i][0]);
        if (!isNaN(f) && f.getTime() <= hoyMs) ultimaFecha = f;
      }
    }
    if (ultimaFecha) fechaAsamblea = Utilities.formatDate(ultimaFecha, "America/Lima", "dd/MM/yyyy");
  } catch(e) {}

  const hoy = new Date();
  hoja.appendRow([
    Utilities.formatDate(hoy, "America/Lima", "dd/MM/yyyy HH:mm"),
    data.nombre,
    data.email,
    data.calificacion + " ⭐",
    data.comentario || "(sin comentario)",
    fechaAsamblea
  ]);
  return corsResponse({ ok: true });
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO 4 — VOTACIONES
// ═══════════════════════════════════════════════════════════════
function registrarVotos(data) {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hoja = ss.getSheetByName(SHEET_VOT);

  if (!data.votos || data.votos.length === 0) {
    return corsResponse({ ok: false, error: "No se recibieron votos." });
  }

  const ts    = new Date().toLocaleString("es-PE");
  const filas = data.votos.map(function(v) {
    return [ts, data.votante, v.categoria, v.votado, data.id_sesion];
  });

  const ultimaFila = hoja.getLastRow();
  hoja.getRange(ultimaFila + 1, 1, filas.length, 5).setValues(filas);

  return corsResponse({ ok: true, registrados: filas.length });
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO 5 — MODO ASAMBLEA
// ═══════════════════════════════════════════════════════════════
function getModoAsamblea(e) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hoja  = ss.getSheetByName("Configuracion");
  const datos = hoja.getDataRange().getValues();
  const hoy   = Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM-dd");

  for (let i = 1; i < datos.length; i++) {
    let fecha = "";
    try {
      fecha = datos[i][0]
        ? Utilities.formatDate(new Date(datos[i][0]), "America/Lima", "yyyy-MM-dd")
        : "";
    } catch(err) { continue; }

    if (fecha === hoy) {
      return corsResponse({
        ok:     true,
        activo: datos[i][4] == 1,
        fecha:  fecha
      });
    }
  }
  return corsResponse({ ok: true, activo: false });
}

function getPreguntas(e) {
  return corsResponse({ ok: true, preguntas: [] });
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO 6 — ASISTENCIA (sin cambios)
// ═══════════════════════════════════════════════════════════════
function onEdit(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();
  const ss    = e.source;

  if (sheet.getName() !== "Asistencia") return;

  const row = range.getRow();
  const col = range.getColumn();
  if (col < 2 || row < 3) return;

  const logSheet    = ss.getSheetByName("Log_Asistencia");
  const configSheet = ss.getSheetByName("Configuracion");
  if (!logSheet || !configSheet) return;

  let nombre                 = sheet.getRange(row, 1).getDisplayValue().trim();
  const fechaAsistenciaTexto = sheet.getRange(1, col).getDisplayValue().trim();
  const trimestre            = sheet.getRange(2, col).getDisplayValue().trim();
  const valorActual          = range.getValue();
  const celdaA1              = range.getA1Notation();

  if (!nombre || !fechaAsistenciaTexto) return;

  if (valorActual !== "" && valorActual !== 0 && valorActual !== "0") {
    const ahora = new Date();
    let tardanzaMin = 0;

    const configData     = configSheet.getRange("A2:C" + configSheet.getLastRow()).getDisplayValues();
    let configMatch      = null;
    let diaMesAsistencia = fechaAsistenciaTexto.split("/")[0] + "/" + fechaAsistenciaTexto.split("/")[1];

    for (let i = 0; i < configData.length; i++) {
      let fConfRaw = configData[i][0].replace(/'/g, "").trim();
      let diaConf  = "";
      let mesConf  = "";
      if (fConfRaw.includes("-")) {
        let partes = fConfRaw.split("-");
        diaConf    = partes[2];
        mesConf    = partes[1];
      }
      if ((diaConf + "/" + mesConf) === diaMesAsistencia) {
        configMatch = {
          hay:  configData[i][1].trim(),
          hora: configData[i][2].replace(/'/g, "").trim()
        };
        break;
      }
    }

    if (configMatch && configMatch.hay === "1") {
      try {
        let partesHora    = configMatch.hora.split(":");
        let momentoInicio = new Date(
          ahora.getFullYear(), ahora.getMonth(), ahora.getDate(),
          parseInt(partesHora[0], 10), parseInt(partesHora[1], 10), 0
        );
        if (ahora.getTime() > momentoInicio.getTime()) {
          tardanzaMin = Math.floor((ahora.getTime() - momentoInicio.getTime()) / 60000);
        }
      } catch(err) { tardanzaMin = 0; }
    }

    let bValues   = logSheet.getRange("B:B").getValues();
    let filaLibre = 1;
    while (bValues[filaLibre] && bValues[filaLibre][0] !== "") filaLibre++;
    filaLibre++;

    logSheet.getRange(filaLibre, 1, 1, 6).setValues([[
      Utilities.formatDate(ahora, "America/Lima", "yyyy-MM-dd HH:mm:ss"),
      nombre, trimestre, celdaA1, valorActual, tardanzaMin
    ]]);

  } else {
    const dataLog = logSheet.getDataRange().getValues();
    for (let i = dataLog.length - 1; i >= 1; i--) {
      if (dataLog[i][1].toString().trim() === nombre &&
          dataLog[i][3].toString()         === celdaA1) {
        logSheet.deleteRow(i + 1);
        break;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  MÓDULO 7 — CUMPLEAÑOS
// ═══════════════════════════════════════════════════════════════
function enviarAlertasGmail() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hoja  = ss.getSheetByName(SHEET_MIEMBROS);
  const datos = hoja.getDataRange().getValues();

  const correosDestinatarios = "paolosotil97@gmail.com,gianfracamones@gmail.com,jorgediego.123.2002@gmail.com,ricardo_Mantillo@gmail.com,Kiarallauce11@gmail.com,sebatias12345@gmail.com,fernandavaldivia0600@gmail.com";

  const asuntoEmail   = "🎂 ¡Recordatorio de Cumpleaños!";
  const hoy           = new Date();
  const fechaHoyTexto = Utilities.formatDate(hoy, "America/Lima", "dd/MM/yyyy");
  const mensajeBase   = "¡Hola! Este es el aviso de cumpleaños para hoy " + fechaHoyTexto + ":";
  const despedida     = "\n\nPor favor, saluden a los cumpleañeros en el grupo. ¡Bendiciones!\n\nEquipo de servidores Luz De Cristo 🧂 y 💡";

  const diaMesHoy = Utilities.formatDate(hoy, "America/Lima", "dd/MM");
  let cumpleaneros = [];

  for (let i = 1; i < datos.length; i++) {
    const nombre     = datos[i][0];
    const fechaCelda = datos[i][1];
    if (fechaCelda instanceof Date && !isNaN(fechaCelda)) {
      const diaMesCelda = Utilities.formatDate(fechaCelda, "America/Lima", "dd/MM");
      if (diaMesCelda === diaMesHoy) {
        cumpleaneros.push(nombre);
      }
    }
  }

  if (cumpleaneros.length > 0) {
    const listaNombres = "\n⭐ " + cumpleaneros.join("\n⭐ ");
    const cuerpoFinal  = mensajeBase + "\n" + listaNombres + despedida;
    MailApp.sendEmail(correosDestinatarios, asuntoEmail, cuerpoFinal);
    Logger.log("Correo enviado: " + cumpleaneros.join(", "));
  } else {
    Logger.log("Hoy no hay cumpleaños registrados.");
  }
}

// ═══════════════════════════════════════════════════════════════
//  UTILITARIO — Formatear hojas (ejecutar una sola vez)
// ═══════════════════════════════════════════════════════════════
function formatearHojas() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const hSug = ss.getSheetByName("Sugerencias");
  if (hSug) {
    hSug.getRange(1,1,1,5).setValues([["Fecha_Envio","Nombre","Email","Sugerencia","Semana"]]);
    hSug.getRange(1,1,1,5).setBackground("#F5C518").setFontColor("#1c1814").setFontWeight("bold").setFontSize(11);
    hSug.setColumnWidth(1,170); hSug.setColumnWidth(2,160);
    hSug.setColumnWidth(3,220); hSug.setColumnWidth(4,420); hSug.setColumnWidth(5,110);
    hSug.setFrozenRows(1);
    const nSug = hSug.getLastRow();
    for (let i = 2; i <= nSug; i++) {
      hSug.getRange(i,1,1,5).setBackground(i % 2 === 0 ? "#FFFDE7" : "#FFFFFF");
      if (!hSug.getRange(i,5).getValue()) {
        const f = hSug.getRange(i,1).getValue();
        hSug.getRange(i,5).setValue(f ? f.toString().substring(0,10) : "—");
      }
    }
    Logger.log("✅ Sugerencias formateada");
  }

  const hFB = ss.getSheetByName("Feedback_Asambleas");
  if (hFB) {
    hFB.getRange(1,1,1,6).setValues([["Fecha_Envio","Nombre","Email","⭐ Calificacion","Comentario","Fecha_Asamblea"]]);
    hFB.getRange(1,1,1,6).setBackground("#C4703A").setFontColor("white").setFontWeight("bold").setFontSize(11);
    hFB.setColumnWidth(1,170); hFB.setColumnWidth(2,160);
    hFB.setColumnWidth(3,220); hFB.setColumnWidth(4,110);
    hFB.setColumnWidth(5,420); hFB.setColumnWidth(6,120);
    hFB.setFrozenRows(1);
    const nFB = hFB.getLastRow();
    for (let i = 2; i <= nFB; i++) {
      hFB.getRange(i,1,1,6).setBackground(i % 2 === 0 ? "#FBE9E7" : "#FFFFFF");
      if (!hFB.getRange(i,6).getValue()) hFB.getRange(i,6).setValue("09/05/2026");
    }
    Logger.log("✅ Feedback_Asambleas formateada");
  }

  Logger.log("🎉 Hojas formateadas correctamente");
}
