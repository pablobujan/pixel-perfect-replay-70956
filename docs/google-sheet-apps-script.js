/**
 * Modo Anxo Carro · recepción de tiempos para el premio
 *
 * Este script vive DENTRO de la hoja de Google (Extensiones → Apps Script) y
 * hace de recepcionista: recibe los datos que manda la app de cada socio y
 * escribe o actualiza su fila en la pestaña "Participantes".
 *
 * Instalación y despliegue: ver docs/google-sheet.md
 *
 * No hay que tocar nada de aquí abajo salvo, si hace falta, TIMEZONE.
 */

var TIMEZONE = "Europe/Madrid";
var SHEET_NAME = "Participantes";
var RANKING_NAME = "Ranking";

var HEADERS = [
  "Sesión",              // A
  "Nombre",              // B
  "Socio",               // C
  "Teléfono",            // D
  "Email",               // E
  "Partido",             // F
  "Fecha partido",       // G
  "Kickoff (ISO)",       // H
  "Entrada",             // I
  "Minuto entrada",      // J
  "Min. fan",            // K
  "Min. fuera",          // L
  "Salidas",             // M
  "Estado",              // N
  "Consentimiento",      // O
  "Dispositivo",         // P
  "Enviado",             // Q
  "Última actualización", // R
  "Prueba",              // S
];

// ---------------------------------------------------------------------------
// Entrada de datos
// ---------------------------------------------------------------------------

function doGet() {
  var sheet = getSheet_();
  return json_({
    ok: true,
    hoja: sheet.getName(),
    filas: Math.max(0, sheet.getLastRow() - 1),
    hora: nowLabel_(),
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, error: "ocupado" });
  }

  try {
    var data = readPayload_(e);
    if (!data) return json_({ ok: false, error: "json" });

    var sessionId = String(data.sessionId || "").trim();
    if (!sessionId) return json_({ ok: false, error: "sessionId" });

    var sheet = getSheet_();
    var row = buildRow_(data, sessionId);
    var rowIndex = findRow_(sheet, sessionId);

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      rowIndex = sheet.getLastRow();
    }

    ensureRanking_();
    return json_({ ok: true, sessionId: sessionId, fila: rowIndex });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** La app manda JSON en el cuerpo; se aceptan también parámetros de formulario. */
function readPayload_(e) {
  var raw = "";
  if (e && e.postData && e.postData.contents) raw = e.postData.contents;
  else if (e && e.parameter && e.parameter.datos) raw = e.parameter.datos;
  if (!raw) return null;

  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hoja
// ---------------------------------------------------------------------------

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Abre el script desde la hoja (Extensiones → Apps Script)");

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#f3f4f6");
    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(6, 180);
  }
  return sheet;
}

/** Fila de la sesión o 0 si aún no existe. */
function findRow_(sheet, sessionId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === sessionId) return i + 2;
  }
  return 0;
}

function buildRow_(data, sessionId) {
  var joinedAt = safeDate_(data.joinedAt);
  var status = String(data.status || "active");
  return [
    sessionId,
    String(data.name || "").trim(),
    String(data.member || "").trim(),
    String(data.phone || "").trim(),
    String(data.email || "").trim(),
    String(data.match || "").trim(),
    String(data.matchDate || "").trim(),
    String(data.kickoffAt || "").trim(),
    joinedAt ? format_(joinedAt, "HH:mm:ss") : "",
    toNumber_(data.joinedMinute),
    minutes_(data.fanSeconds),
    minutes_(data.awaySeconds),
    toNumber_(data.awayCount),
    status === "finished" ? "Finalizado" : "En directo",
    data.consent === true ? "Sí" : "No",
    String(data.device || "").trim(),
    format_(safeDate_(data.sentAt) || new Date(), "dd/MM/yyyy HH:mm:ss"),
    nowLabel_(),
    data.demo === true ? "Sí" : "No",
  ];
}

/** Pestaña viva con el ranking por minutos de Modo Fan. */
function ensureRanking_() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    var sheet = ss.getSheetByName(RANKING_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(RANKING_NAME);
    }
    var range = "'" + SHEET_NAME + "'!A2:S";
    var condName = "'" + SHEET_NAME + "'!B2:B" + '<>""';
    // Las sesiones de prueba (?demo=) no compiten por el premio.
    var condReal = "'" + SHEET_NAME + "'!S2:S" + '<>"Sí"';
    var formula =
      "=IFERROR(SORT(FILTER(" +
      range +
      "," +
      condName +
      "," +
      condReal +
      '),11,FALSE),"Todavía no hay participantes")';
    sheet.getRange("A1").setFormula(formula);
  } catch (err) {
    // El ranking es un extra: si falla, los datos siguen guardándose.
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function minutes_(seconds) {
  var value = Number(seconds);
  if (!isFinite(value) || value <= 0) return 0;
  return Math.round((value / 60) * 10) / 10;
}

function toNumber_(value) {
  var n = Number(value);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function safeDate_(value) {
  if (!value) return null;
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function format_(date, pattern) {
  return Utilities.formatDate(date, TIMEZONE, pattern);
}

function nowLabel_() {
  return format_(new Date(), "dd/MM/yyyy HH:mm:ss");
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
