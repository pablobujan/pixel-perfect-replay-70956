/**
 * Modo Anxo Carro · recepción de tiempos para el premio y calendario
 *
 * Este script vive DENTRO de la hoja de Google (Extensiones → Apps Script) y
 * hace dos cosas:
 *
 * 1. Recepcionista de los tiempos del premio: recibe lo que manda la app de
 *    cada socio y escribe o actualiza su fila en la pestaña "Participantes".
 * 2. Calendario editable: la pestaña "Partidos" guarda los partidos y el panel
 *    privado de la app (`?admin=1`) la lee y la modifica.
 *
 * Instalación y despliegue: ver docs/google-sheet.md
 *
 * IMPORTANTE: cambia ADMIN_TOKEN por una clave larga y difícil de adivinar.
 * Sin cambiarla, el panel rechazará todos los cambios (a propósito).
 */

var TIMEZONE = "Europe/Madrid";
var SHEET_NAME = "Participantes";
var RANKING_NAME = "Ranking";
var MATCHES_NAME = "Partidos";

// Clave del panel privado de partidos. Cámbiala por algo largo, por ejemplo:
// "lugo-2026-calendario-8f3k2p"
var ADMIN_TOKEN = "CAMBIAME";

var HEADERS = [
  "Sesión", // A
  "Nombre", // B
  "Socio", // C
  "Teléfono", // D
  "Email", // E
  "Partido", // F
  "Fecha partido", // G
  "Kickoff (ISO)", // H
  "Entrada", // I
  "Minuto entrada", // J
  "Min. fan", // K
  "Min. fuera", // L
  "Salidas", // M
  "Estado", // N
  "Consentimiento", // O
  "Dispositivo", // P
  "Enviado", // Q
  "Última actualización", // R
  "Prueba", // S
];

var MATCH_HEADERS = [
  "ID", // A
  "Rival", // B
  "Kickoff (ISO)", // C
  "Etiqueta", // D
  "Casa", // E
  "Jornada", // F
  "Jugado", // G
  "GF", // H
  "GA", // I
  "Actualizado", // J
  "Desc. 1ª", // K (minutos añadidos por el árbitro)
  "Desc. 2ª", // L
];

// Calendario inicial: solo se escribe si la pestaña "Partidos" está vacía.
var SEED_MATCHES = [
  {
    id: "cacereno-2026-11-06",
    rival: "CP Cacereño",
    kickoffAt: "2026-11-06T19:00:00+01:00",
    date: "06 NOV · 19:00",
    home: false,
    played: true,
    gf: 1,
    ga: 0,
  },
  {
    id: "merida-2026-11-01",
    rival: "AD Mérida",
    kickoffAt: "2026-11-01T17:00:00+01:00",
    date: "01 NOV",
    home: true,
    played: true,
    gf: 2,
    ga: 1,
  },
  {
    id: "mirandes-2026-11-15",
    rival: "Mirandés",
    kickoffAt: "2026-11-15T16:30:00+01:00",
    date: "15 NOV · 16:30",
    home: true,
    matchday: 12,
    played: false,
  },
  {
    id: "pontevedra-2026-11-21",
    rival: "Pontevedra",
    kickoffAt: "2026-11-21T18:45:00+01:00",
    date: "21 NOV · 18:45",
    home: false,
    played: false,
  },
  {
    id: "ourense-2026-11-29",
    rival: "UD Ourense",
    kickoffAt: "2026-11-29T19:00:00+01:00",
    date: "29 NOV · 19:00",
    home: true,
    played: false,
  },
];

// ---------------------------------------------------------------------------
// Entrada de datos
// ---------------------------------------------------------------------------

/**
 * GET: estado de la hoja y calendario.
 * - `?action=partidos` devuelve solo el calendario (lo usa la app).
 * - `?callback=nombre` responde en JSONP, necesario para leer desde el navegador
 *   sin cabeceras CORS.
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var callback = params.callback;

  try {
    if (params.action === "partidos") {
      return respond_({ ok: true, partidos: readMatches_() }, callback);
    }

    var sheet = getSheet_();
    return respond_(
      {
        ok: true,
        hoja: sheet.getName(),
        filas: Math.max(0, sheet.getLastRow() - 1),
        partidos: readMatches_().length,
        hora: nowLabel_(),
      },
      callback,
    );
  } catch (err) {
    return respond_({ ok: false, error: String(err) }, callback);
  }
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

    var type = String(data.type || "fan");

    // --- Calendario (panel privado) ---
    if (type === "partido" || type === "partido-borrar") {
      if (!isAdmin_(data.token)) return json_({ ok: false, error: "token" });
      if (type === "partido") return json_(upsertMatch_(data));
      return json_(removeMatch_(data.id));
    }

    // --- Tiempos del premio ---
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

/** ¿La clave enviada por el panel coincide con la del script? */
function isAdmin_(token) {
  if (!ADMIN_TOKEN || ADMIN_TOKEN === "CAMBIAME") return false;
  return String(token || "").trim() === ADMIN_TOKEN;
}

// ---------------------------------------------------------------------------
// Hoja de participantes
// ---------------------------------------------------------------------------

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Abre el script desde la hoja (Extensiones → Apps Script)");

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#f3f4f6");
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
    // Las sesiones de prueba (?demo= / ?prueba=) no compiten por el premio.
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
// Hoja de partidos (calendario)
// ---------------------------------------------------------------------------

function getMatchesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Abre el script desde la hoja (Extensiones → Apps Script)");

  var sheet = ss.getSheetByName(MATCHES_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MATCHES_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, MATCH_HEADERS.length).setValues([MATCH_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, MATCH_HEADERS.length).setFontWeight("bold").setBackground("#f3f4f6");
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 200);
  } else {
    // Hojas creadas antes del descuento: añade las columnas K y L sin tocar los
    // partidos que ya hubiera.
    var header = sheet.getRange(1, 1, 1, MATCH_HEADERS.length).getValues()[0];
    for (var i = 0; i < MATCH_HEADERS.length; i++) {
      if (!String(header[i] || "").trim()) {
        sheet.getRange(1, 1, 1, MATCH_HEADERS.length).setValues([MATCH_HEADERS]);
        sheet.setFrozenRows(1);
        break;
      }
    }
  }

  // El kickoff se guarda como texto para que Sheets no lo convierta a su antojo.
  sheet.getRange("C2:C").setNumberFormat("@");
  // Descuento en minutos: número entero (vacío = sin descuento).
  sheet.getRange("K2:L").setNumberFormat("0");
  return sheet;
}

function seedMatches_(sheet) {
  if (sheet.getLastRow() >= 2) return;

  var rows = SEED_MATCHES.map(function (match) {
    return buildMatchRow_(match);
  });
  if (rows.length === 0) return;

  sheet.getRange(2, 3, rows.length, 1).setNumberFormat("@");
  sheet.getRange(2, 1, rows.length, MATCH_HEADERS.length).setValues(rows);
}

/** Calendario en el mismo formato que espera la app. */
function readMatches_() {
  var sheet = getMatchesSheet_();
  if (sheet.getLastRow() < 2) seedMatches_(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, MATCH_HEADERS.length).getValues();
  var out = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || "").trim();
    if (!id) continue;

    out.push({
      id: id,
      rival: String(row[1] || "").trim(),
      kickoffAt: iso_(row[2]),
      date: String(row[3] || "").trim(),
      home: bool_(row[4]),
      matchday: Number(row[5]) || 0,
      played: bool_(row[6]),
      gf: numberOrNull_(row[7]),
      ga: numberOrNull_(row[8]),
      addedFirst: numberOrNull_(row[10]),
      addedSecond: numberOrNull_(row[11]),
    });
  }

  return out;
}

function findMatchRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) return i + 2;
  }
  return 0;
}

function buildMatchRow_(match) {
  return [
    String(match.id || "").trim(),
    String(match.rival || "").trim(),
    iso_(match.kickoffAt),
    String(match.date || "").trim(),
    match.home ? "Sí" : "No",
    match.matchday ? Number(match.matchday) : "",
    match.played ? "Sí" : "No",
    numberOrBlank_(match.gf),
    numberOrBlank_(match.ga),
    nowLabel_(),
    extraMinutes_(match.addedFirst),
    extraMinutes_(match.addedSecond),
  ];
}

function upsertMatch_(data) {
  var match = data.partido || {};
  var id = String(match.id || "").trim();
  if (!id) return { ok: false, error: "id" };
  if (!String(match.rival || "").trim()) return { ok: false, error: "rival" };
  if (!iso_(match.kickoffAt)) return { ok: false, error: "kickoff" };

  var sheet = getMatchesSheet_();
  if (sheet.getLastRow() < 2) seedMatches_(sheet);

  var row = buildMatchRow_(match);
  var index = findMatchRow_(sheet, id);

  if (index > 0) {
    sheet.getRange(index, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return { ok: true, id: id };
}

function removeMatch_(id) {
  var clean = String(id || "").trim();
  if (!clean) return { ok: false, error: "id" };

  var sheet = getMatchesSheet_();
  var index = findMatchRow_(sheet, clean);
  if (index > 0) sheet.deleteRow(index);

  return { ok: true, id: clean, borrado: index > 0 };
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

function numberOrNull_(value) {
  if (value === "" || value === null || value === undefined) return null;
  var n = Number(value);
  return isFinite(n) ? Math.floor(n) : null;
}

function numberOrBlank_(value) {
  var n = numberOrNull_(value);
  return n === null ? "" : n;
}

/** Descuento del árbitro: entero entre 1 y 30, o vacío si no hay. */
function extraMinutes_(value) {
  var n = numberOrNull_(value);
  if (n === null || n <= 0) return "";
  return Math.min(n, 30);
}

function bool_(value) {
  if (value === true) return true;
  var text = String(value || "")
    .trim()
    .toLowerCase();
  return text === "sí" || text === "si" || text === "true" || text === "1" || text === "yes";
}

function iso_(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || "").trim();
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

/** Respuesta JSON o JSONP, según venga `callback`. */
function respond_(obj, callback) {
  var body = JSON.stringify(obj);
  if (callback) {
    var safe = String(callback).replace(/[^A-Za-z0-9_.$]/g, "");
    if (safe) {
      return ContentService.createTextOutput(safe + "(" + body + ")").setMimeType(
        ContentService.MimeType.JAVASCRIPT,
      );
    }
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}
