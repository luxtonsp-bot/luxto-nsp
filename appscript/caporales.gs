/**
 * CAPORALES 2026 — Control de Asistencia
 * Ejecutar: crearHojaAsistencia()
 */

var FECHA_INICIO = new Date(2026, 5, 27); // 27 junio 2026
var FECHA_FIN    = new Date(2026, 8,  5); // 5 septiembre 2026
var NOMBRE_HOJA  = "Caporales 2026";
var FILAS_EXTRA  = 20;

var BAILARINES = [
  "Alicia Coz","Alvaro Salazar","Bryan Ballon","Claudia Arana","Diego Garcia",
  "Fernanda Valdivia","Franco Sirio","Kayrel Suasnabar","Kevin Camones","Kiara Llauce",
  "Mafer Chacez","Maje Roncal","Oswaldo Bohorquez","Paolo Alfaro","Piero Martinez",
  "Roy Cruz","Sebastian Caroy","Solieth Silva","Sumiko Aquiño","Tania RauRau",
  "Thamara Nonone","Valentina Nonone","Xiomara Leon"
];

function crearHojaAsistencia() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(NOMBRE_HOJA);
  if (hoja) ss.deleteSheet(hoja);
  hoja = ss.insertSheet(NOMBRE_HOJA);

  var fechas = [];
  var d = new Date(FECHA_INICIO);
  while (d <= FECHA_FIN) {
    fechas.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  var N = fechas.length;

  var colAsist = 2 + N;
  var colFalta = colAsist + 1;
  var colPct   = colFalta + 1;
  var colEst   = colPct + 1;
  var totalCol = colEst;

  var cIni = colLetra(2);
  var cFin = colLetra(1 + N);
  var cA   = colLetra(colAsist);
  var cF   = colLetra(colFalta);
  var cP   = colLetra(colPct);
  var cE   = colLetra(colEst);

  var totalFilas = BAILARINES.length + FILAS_EXTRA;
  var filaFin    = 2 + totalFilas;

  hoja.getRange(1, 1, 1, totalCol)
    .setValue("CAPORALES 2026 — Control de Asistencia de Ensayos")
    .setBackground("#1A3A5C").setFontColor("#FFFFFF")
    .setFontSize(14).setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  hoja.setRowHeight(1, 40);

  var headers = ["Nombre"];
  for (var i = 0; i < N; i++) {
    var fd = fechas[i];
    headers.push(("0"+fd.getDate()).slice(-2)+"/"+("0"+(fd.getMonth()+1)).slice(-2));
  }
  headers.push("Asistencias","Faltas","%","Estado");

  hoja.getRange(2, 1, 1, totalCol).setValues([headers])
    .setBackground("#2E6DA4").setFontColor("#FFFFFF").setFontWeight("bold")
    .setHorizontalAlignment("center").setVerticalAlignment("middle");
  hoja.setRowHeight(2, 30);

  var nombres = [];
  for (var k = 0; k < totalFilas; k++) {
    nombres.push([k < BAILARINES.length ? BAILARINES[k] : ""]);
  }
  hoja.getRange(3, 1, totalFilas, 1).setValues(nombres);

  var fAsist = [], fFalta = [], fPct = [], fEst = [];
  for (var r = 0; r < totalFilas; r++) {
    var row = r + 3;
    var rng = cIni+row+":"+cFin+row;
    fAsist.push(['=SI(A'+row+'="";"";CONTAR.SI('+rng+';1))']);
    fFalta.push(['=SI(A'+row+'="";"";CONTAR.SI('+rng+';0))']);
    fPct.push([
      '=SI(A'+row+'="";"";SI((CONTAR.SI('+rng+';1)+CONTAR.SI('+rng+';0))=0;"";'+
      cA+row+'/(CONTAR.SI('+rng+';1)+CONTAR.SI('+rng+';0))))'
    ]);
    fEst.push([
      '=SI('+cP+row+'="";"";SI('+cP+row+'>=0,9;"Excelente";SI('+cP+row+'>=0,7;"Regular";"Riesgo")))'
    ]);
  }

  hoja.getRange(3, colAsist, totalFilas, 1).setFormulas(fAsist);
  hoja.getRange(3, colFalta, totalFilas, 1).setFormulas(fFalta);
  hoja.getRange(3, colPct,   totalFilas, 1).setFormulas(fPct).setNumberFormat("0%");
  hoja.getRange(3, colEst,   totalFilas, 1).setFormulas(fEst);

  var rangoCeldas = hoja.getRange(3, 2, totalFilas, N);
  hoja.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(1).setBackground("#C6EFCE").setFontColor("#276221")
      .setRanges([rangoCeldas]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(0).setBackground("#FFC7CE").setFontColor("#9C0006")
      .setRanges([rangoCeldas]).build()
  ]);

  for (var r = 0; r < totalFilas; r++) {
    var fila = r + 3;
    hoja.getRange(fila, 1, 1, totalCol)
      .setBackground(r % 2 === 0 ? "#FFFFFF" : "#F2F4F7");
    hoja.setRowHeight(fila, 22);
  }
  hoja.getRange(3, 1, totalFilas, 1).setFontWeight("bold").setHorizontalAlignment("left");
  hoja.getRange(3, 2, totalFilas, totalCol-1).setHorizontalAlignment("center").setVerticalAlignment("middle");
  hoja.getRange(2, 1, totalFilas+1, totalCol)
    .setBorder(true,true,true,true,true,true,"#C8CDD5",SpreadsheetApp.BorderStyle.SOLID);

  hoja.setColumnWidth(1, 180);
  for (var c = 2; c <= 1+N; c++) hoja.setColumnWidth(c, 52);
  hoja.setColumnWidth(colAsist, 85);
  hoja.setColumnWidth(colFalta, 60);
  hoja.setColumnWidth(colPct,   55);
  hoja.setColumnWidth(colEst,  110);

  var mitad = Math.floor(totalCol / 2);

  function seccionTitulo(fila, texto) {
    hoja.getRange(fila, 1, 1, totalCol).merge()
      .setValue(texto).setBackground("#1A3A5C").setFontColor("#FFFFFF")
      .setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");
    hoja.setRowHeight(fila, 28);
  }

  function seccionFila(fila, etiqueta, formula, formato) {
    var fondo = "#EAF2FB";
    hoja.getRange(fila, 1, 1, mitad).merge()
      .setValue(etiqueta).setBackground(fondo)
      .setFontWeight("bold").setHorizontalAlignment("left").setVerticalAlignment("middle");
    var rv = hoja.getRange(fila, mitad+1, 1, totalCol-mitad).merge()
      .setFormula(formula).setBackground(fondo)
      .setFontColor("#1A3A5C").setFontWeight("bold")
      .setHorizontalAlignment("center").setVerticalAlignment("middle");
    if (formato) rv.setNumberFormat(formato);
    hoja.setRowHeight(fila, 22);
  }

  var filaR = filaFin + 2;
  seccionTitulo(filaR, "RESUMEN GENERAL");
  seccionFila(filaR+1, "Total integrantes",      '=CONTARA(A3:A'+filaFin+')',                                          null);
  seccionFila(filaR+2, "Ensayos realizados",      '='+N,                                                               null);
  seccionFila(filaR+3, "Promedio general",        '=SIERROR(PROMEDIO.SI('+cP+'3:'+cP+filaFin+';"<>");"")' ,           "0%");
  seccionFila(filaR+4, "Asistencia máxima",       '=SIERROR(MAX('+cP+'3:'+cP+filaFin+';"")' ,                        "0%");
  seccionFila(filaR+5, "Asistencia mínima",       '=SIERROR(MIN.SI.CONJUNTO('+cP+'3:'+cP+filaFin+';A3:A'+filaFin+';"<>");"")' , "0%");
  seccionFila(filaR+6, "Con asistencia perfecta", '=CONTAR.SI('+cP+'3:'+cP+filaFin+';1)',                             null);
  seccionFila(filaR+7, "Persona con más faltas",  '=SIERROR(INDICE(A3:A'+filaFin+';COINCIDIR(MIN('+cP+'3:'+cP+filaFin+';'+cP+'3:'+cP+filaFin+';0));"")', null);

  var filaT = filaR + 10;
  seccionTitulo(filaT, "TOP 3 — MEJORES PORCENTAJES");
  var medallas = ["1ro","2do","3ro"];
  var fondosTop = ["#FFF9C4","#F2F4F7","#FFE0CC"];
  for (var t = 0; t < 3; t++) {
    var pos  = t + 1;
    var fTop = filaT + 1 + t;
    hoja.getRange(fTop, 1).setValue(medallas[t])
      .setBackground(fondosTop[t]).setHorizontalAlignment("center").setFontWeight("bold");
    hoja.getRange(fTop, 2, 1, mitad-1).merge()
      .setFormula('=SIERROR(INDICE(A3:A'+filaFin+';COINCIDIR(K.ESIMO.MAYOR('+cP+'3:'+cP+filaFin+';'+pos+');'+cP+'3:'+cP+filaFin+';0));"—")')
      .setBackground(fondosTop[t]).setFontWeight("bold").setHorizontalAlignment("left");
    hoja.getRange(fTop, mitad+1, 1, totalCol-mitad).merge()
      .setFormula('=SIERROR(K.ESIMO.MAYOR('+cP+'3:'+cP+filaFin+';'+pos+');"")' )
      .setBackground(fondosTop[t]).setFontColor("#1A3A5C").setFontWeight("bold")
      .setHorizontalAlignment("center").setNumberFormat("0%");
    hoja.setRowHeight(fTop, 24);
  }

  var filaS = filaT + 6;
  seccionTitulo(filaS, "ESTADISTICAS GENERALES");
  seccionFila(filaS+1, "Promedio de asistencia", '=SIERROR(PROMEDIO.SI('+cP+'3:'+cP+filaFin+';"<>");"")' , "0%");
  seccionFila(filaS+2, "Numero de integrantes",  '=CONTARA(A3:A'+filaFin+')'                              , null);
  seccionFila(filaS+3, "Numero de ensayos",      '='+N                                                    , null);
  seccionFila(filaS+4, "Total de asistencias",   '=SIERROR(SUMA('+cA+'3:'+cA+filaFin+');"")' , null);
  seccionFila(filaS+5, "Total de faltas",        '=SIERROR(SUMA('+cF+'3:'+cF+filaFin+');"")' , null);

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert("Hoja creada: " + N + " ensayos.");
}

function colLetra(n) {
  var s = "";
  while (n > 0) { s = String.fromCharCode(64+(n-1)%26+1)+s; n=Math.floor((n-1)/26); }
  return s;
}
