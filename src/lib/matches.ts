// Calendario de partidos.
//
// La lista vive en la pestaña "Partidos" de la hoja de Google y se puede editar
// desde el panel privado de la app (`?admin=1`). El móvil guarda una copia en
// localStorage para arrancar al instante y para seguir funcionando si la hoja
// no responde.
//
// La lectura se hace con JSONP (un <script> con callback), no con fetch: Apps
// Script no manda cabeceras CORS y un fetch normal no podría leer la respuesta.
// La escritura usa el mismo POST `no-cors` que los tiempos del premio.

import {
  getDefaultFanSheetEndpoint,
  getFanSheetEndpoint,
  hasFanSheetOverride,
  postSheetPayload,
  resetFanSheetOverride,
} from "@/lib/fan-sheet";

export type Match = {
  id: string;
  rival: string;
  /** Hora de inicio en ISO 8601 (con zona), p. ej. 2026-11-15T16:30:00+01:00. */
  kickoffAt: string;
  /** Etiqueta visible. Si falta se genera a partir de `kickoffAt`. */
  date?: string;
  home: boolean;
  matchday?: number;
  played: boolean;
  gf?: number;
  ga?: number;
  /** Minutos que añade el árbitro en la primera parte (0 o vacío = ninguno). */
  addedFirst?: number;
  /** Minutos que añade el árbitro en la segunda parte. */
  addedSecond?: number;
};

export type MatchesState = { past: Match[]; next: Match[] };

export const MATCHES_CACHE_KEY = "anxo-carro:matches-v6";
/** Margen tras el kickoff para dar un partido por terminado si no se marcó. */
const AUTO_PAST_MS = 3 * 60 * 60 * 1000;

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/**
 * Calendario de reserva. Solo se usa si la hoja no responde y el móvil no
 * tiene nada guardado (primer arranque o hoja aún sin configurar).
 */
export const DEFAULT_MATCHES: Match[] = [
  {
    id: "unionistas-2026-08-30",
    rival: "Unionistas CF",
    kickoffAt: "2026-08-30T19:15:00+01:00",
    date: "30 AGO · 19:15",
    home: false,
    matchday: 1,
    played: true,
    gf: 3,
    ga: 1,
  },
  {
    id: "ponferradina-2026-09-04",
    rival: "Ponferradina",
    kickoffAt: "2026-09-04T21:15:00+01:00",
    date: "04 SEP · 21:15",
    home: false,
    matchday: 2,
    played: true,
    gf: 0,
    ga: 0,
  },
  {
    id: "coria-2026-09-13",
    rival: "CD Coria",
    kickoffAt: "2026-09-13T18:15:00+01:00",
    date: "13 SEP · 18:15",
    home: true,
    matchday: 3,
    played: true,
    gf: 1,
    ga: 0,
  },
  {
    id: "zamora-2026-09-20",
    rival: "Zamora CF",
    kickoffAt: "2026-09-20T18:15:00+01:00",
    date: "20 SEP · 18:15",
    home: false,
    matchday: 4,
    played: true,
    gf: 2,
    ga: 1,
  },
  {
    id: "racing-ferrol-2026-09-26",
    rival: "Racing Ferrol",
    kickoffAt: "2026-09-26T16:30:00+01:00",
    date: "26 SEP · 16:30",
    home: true,
    matchday: 5,
    played: true,
    gf: 1,
    ga: 0,
  },
  {
    id: "aviles-2026-10-02",
    rival: "Real Avilés",
    kickoffAt: "2026-10-02T19:00:00+01:00",
    date: "02 OCT · 19:00",
    home: false,
    matchday: 6,
    played: true,
    gf: 2,
    ga: 1,
  },
  {
    id: "logrones-2026-10-12",
    rival: "UD Logroñés",
    kickoffAt: "2026-10-12T20:30:00+01:00",
    date: "12 OCT · 20:30",
    home: true,
    matchday: 7,
    played: true,
    gf: 3,
    ga: 1,
  },
  {
    id: "fabril-2026-10-17",
    rival: "Depor Fabril",
    kickoffAt: "2026-10-17T16:30:00+01:00",
    date: "17 OCT · 16:30",
    home: true,
    matchday: 8,
    played: true,
    gf: 3,
    ga: 0,
  },
  {
    id: "real-union-2026-10-23",
    rival: "Real Unión",
    kickoffAt: "2026-10-23T19:00:00+01:00",
    date: "23 OCT · 19:00",
    home: false,
    matchday: 9,
    played: true,
    gf: 1,
    ga: 4,
  },
  {
    id: "merida-2026-11-01",
    rival: "AD Mérida",
    kickoffAt: "2026-11-01T18:45:00+01:00",
    date: "01 NOV · 18:45",
    home: true,
    matchday: 10,
    played: true,
    gf: 2,
    ga: 1,
  },
  {
    id: "cacereno-2026-11-06",
    rival: "CP Cacereño",
    kickoffAt: "2026-11-06T19:00:00+01:00",
    date: "06 NOV · 19:00",
    home: false,
    matchday: 11,
    played: true,
    gf: 1,
    ga: 0,
  },
  {
    id: "mirandes-2026-11-15",
    rival: "Mirandés",
    kickoffAt: "2026-11-15T16:30:00+01:00",
    date: "15 NOV · 16:30",
    home: true,
    matchday: 12,
    played: true,
    gf: 1,
    ga: 3,
  },
  {
    id: "pontevedra-2026-11-21",
    rival: "Pontevedra",
    kickoffAt: "2026-11-21T18:45:00+01:00",
    date: "21 NOV · 18:45",
    home: false,
    matchday: 13,
    played: false,
    addedFirst: 2,
  },
  {
    id: "ourense-2026-11-28",
    rival: "UD Ourense",
    kickoffAt: "2026-11-28T18:45:00+01:00",
    date: "28 NOV · 18:45",
    home: true,
    matchday: 14,
    played: false,
  },
  {
    id: "arenas-2026-12-06",
    rival: "Arenas Club",
    kickoffAt: "2026-12-06T12:00:00+01:00",
    date: "06 DIC · 12:00",
    home: false,
    matchday: 15,
    played: false,
  },
  {
    id: "leonesa-2026-12-13",
    rival: "CyD Leonesa",
    kickoffAt: "2026-12-13T19:00:00+01:00",
    date: "13 DIC.",
    home: true,
    matchday: 16,
    played: false,
  },
  {
    id: "barakaldo-2026-12-20",
    rival: "Barakaldo CF",
    kickoffAt: "2026-12-20T19:00:00+01:00",
    date: "20 DIC.",
    home: true,
    matchday: 17,
    played: false,
  },
  {
    id: "athletic-b-2027-01-03",
    rival: "Athletic B",
    kickoffAt: "2027-01-03T19:00:00+01:00",
    date: "03 ENE.",
    home: false,
    matchday: 18,
    played: false,
  },
  {
    id: "extremadura-2027-01-10",
    rival: "CD Extremadura",
    kickoffAt: "2027-01-10T19:00:00+01:00",
    date: "10 ENE.",
    home: true,
    matchday: 19,
    played: false,
  },
  {
    id: "coria-2027-01-17",
    rival: "CD Coria",
    kickoffAt: "2027-01-17T19:00:00+01:00",
    date: "17 ENE.",
    home: false,
    matchday: 20,
    played: false,
  },
  {
    id: "aviles-2027-01-24",
    rival: "Real Avilés",
    kickoffAt: "2027-01-24T19:00:00+01:00",
    date: "24 ENE.",
    home: true,
    matchday: 21,
    played: false,
  },
  {
    id: "logrones-2027-01-31",
    rival: "UD Logroñés",
    kickoffAt: "2027-01-31T19:00:00+01:00",
    date: "31 ENE.",
    home: false,
    matchday: 22,
    played: false,
  },
  {
    id: "zamora-2027-02-06",
    rival: "Zamora CF",
    kickoffAt: "2027-02-06T19:00:00+01:00",
    date: "06 FEB.",
    home: true,
    matchday: 23,
    played: false,
  },
  {
    id: "ourense-2027-02-14",
    rival: "UD Ourense",
    kickoffAt: "2027-02-14T19:00:00+01:00",
    date: "14 FEB.",
    home: false,
    matchday: 24,
    played: false,
  },
  {
    id: "pontevedra-2027-02-21",
    rival: "Pontevedra",
    kickoffAt: "2027-02-21T19:00:00+01:00",
    date: "21 FEB.",
    home: true,
    matchday: 25,
    played: false,
  },
  {
    id: "fabril-2027-02-28",
    rival: "Depor Fabril",
    kickoffAt: "2027-02-28T19:00:00+01:00",
    date: "28 FEB.",
    home: false,
    matchday: 26,
    played: false,
  },
  {
    id: "unionistas-2027-03-07",
    rival: "Unionistas CF",
    kickoffAt: "2027-03-07T19:00:00+02:00",
    date: "07 MAR.",
    home: true,
    matchday: 27,
    played: false,
  },
  {
    id: "leonesa-2027-03-14",
    rival: "CyD Leonesa",
    kickoffAt: "2027-03-14T19:00:00+02:00",
    date: "14 MAR.",
    home: false,
    matchday: 28,
    played: false,
  },
  {
    id: "merida-2027-03-21",
    rival: "AD Mérida",
    kickoffAt: "2027-03-21T19:00:00+02:00",
    date: "21 MAR.",
    home: false,
    matchday: 29,
    played: false,
  },
  {
    id: "ponferradina-2027-03-28",
    rival: "Ponferradina",
    kickoffAt: "2027-03-28T19:00:00+02:00",
    date: "28 MAR.",
    home: true,
    matchday: 30,
    played: false,
  },
  {
    id: "racing-ferrol-2027-04-04",
    rival: "Racing Ferrol",
    kickoffAt: "2027-04-04T19:00:00+02:00",
    date: "04 ABR.",
    home: false,
    matchday: 31,
    played: false,
  },
  {
    id: "athletic-b-2027-04-11",
    rival: "Athletic B",
    kickoffAt: "2027-04-11T19:00:00+02:00",
    date: "11 ABR.",
    home: true,
    matchday: 32,
    played: false,
  },
  {
    id: "mirandes-2027-04-18",
    rival: "Mirandés",
    kickoffAt: "2027-04-18T19:00:00+02:00",
    date: "18 ABR.",
    home: false,
    matchday: 33,
    played: false,
  },
  {
    id: "cacereno-2027-04-25",
    rival: "CP Cacereño",
    kickoffAt: "2027-04-25T19:00:00+02:00",
    date: "25 ABR.",
    home: true,
    matchday: 34,
    played: false,
  },
  {
    id: "real-union-2027-05-02",
    rival: "Real Unión",
    kickoffAt: "2027-05-02T19:00:00+02:00",
    date: "02 MAY.",
    home: true,
    matchday: 35,
    played: false,
  },
  {
    id: "barakaldo-2027-05-09",
    rival: "Barakaldo CF",
    kickoffAt: "2027-05-09T19:00:00+02:00",
    date: "09 MAY.",
    home: false,
    matchday: 36,
    played: false,
  },
  {
    id: "arenas-2027-05-16",
    rival: "Arenas Club",
    kickoffAt: "2027-05-16T19:00:00+02:00",
    date: "16 MAY.",
    home: true,
    matchday: 37,
    played: false,
  },
  {
    id: "extremadura-2027-05-23",
    rival: "CD Extremadura",
    kickoffAt: "2027-05-23T19:00:00+02:00",
    date: "23 MAY.",
    home: false,
    matchday: 38,
    played: false,
  },
];

/** Etiqueta del partido: la manual si existe; si no, "15 NOV · 16:30". */
export function matchLabel(kickoffAt: string, date?: string): string {
  const manual = (date ?? "").trim();
  if (manual) return manual;
  const parsed = new Date(kickoffAt);
  if (Number.isNaN(parsed.getTime())) return "";
  const day = String(parsed.getDate()).padStart(2, "0");
  const month = MONTHS[parsed.getMonth()] ?? "";
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${day} ${month} · ${hours}:${minutes}`;
}

/** Reparte la lista en jugados (más reciente primero) y próximos (por fecha). */
export function partitionMatches(matches: Match[], now: number = Date.now()): MatchesState {
  const sorted = [...matches].sort((a, b) => Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
  const past: Match[] = [];
  const next: Match[] = [];

  for (const match of sorted) {
    const kickoff = Date.parse(match.kickoffAt);
    const autoPast = Number.isFinite(kickoff) && kickoff + AUTO_PAST_MS < now;
    if (match.played || autoPast) past.push(match);
    else next.push(match);
  }

  past.reverse();
  return { past, next };
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const bool = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "sí" || normalized === "si" || normalized === "yes" || normalized === "true" || normalized === "1";
};

/** Acepta la fila tal y como la devuelve la hoja (booleanos o "Sí"/"No"). */
export function normalizeMatch(input: unknown): Match | null {
  if (!input || typeof input !== "object") return null;
  const row = input as Record<string, unknown>;

  const id = text(row["id"]);
  const rival = text(row["rival"]);
  const kickoffAt = text(row["kickoffAt"]);
  if (!id || !rival || !kickoffAt) return null;
  if (Number.isNaN(Date.parse(kickoffAt))) return null;

  const match: Match = {
    id,
    rival,
    kickoffAt,
    home: bool(row["home"]),
    played: bool(row["played"]),
  };

  const date = text(row["date"]);
  if (date) match.date = date;

  const matchday = num(row["matchday"]);
  if (matchday !== null && matchday > 0) match.matchday = matchday;

  const gf = num(row["gf"]);
  if (gf !== null) match.gf = gf;

  const ga = num(row["ga"]);
  if (ga !== null) match.ga = ga;

  const addedFirst = num(row["addedFirst"]);
  if (addedFirst !== null && addedFirst > 0) match.addedFirst = addedFirst;

  const addedSecond = num(row["addedSecond"]);
  if (addedSecond !== null && addedSecond > 0) match.addedSecond = addedSecond;

  return match;
}

function readCacheRaw(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MATCHES_CACHE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Copia local del calendario (síncrona: sirve para el primer render). */
export function readCachedMatches(): Match[] | null {
  const raw = readCacheRaw();
  if (!Array.isArray(raw)) return null;
  const matches = raw.map(normalizeMatch).filter((match): match is Match => match !== null);
  return matches.length > 0 ? matches : null;
}

export function writeCachedMatches(matches: Match[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MATCHES_CACHE_KEY, JSON.stringify(matches));
  } catch {
    // Sin localStorage seguimos con lo que haya en memoria.
  }
}

/**
 * Otra pestaña ha escrito una copia nueva en localStorage: descartamos la
 * copia en memoria de esta pestaña para que la próxima lectura no devuelva
 * datos antiguos durante los 5 minutos de caché.
 */
export function clearMatchesMemoryCache(): void {
  matchesCache = null;
}

/**
 * El calendario cambia muy poco (cuando el panel guarda un resultado), así que
 * no hace falta bajarlo en cada visita ni en cada cambio de pestaña. Con 2000
 * móviles, una lectura por usuario y minuto agotaría las ejecuciones de Apps
 * Script. La copia en memoria se comparte durante esta sesión de la página;
 * el panel usa `force: true` para ver siempre el dato recién escrito.
 */
const MATCHES_TTL_MS = 5 * 60_000;
let matchesCache: { at: number; matches: Match[] } | null = null;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type JsonObject = Record<string, unknown>;

let jsonpSeq = 0;

/**
 * Lee un JSON de Apps Script con JSONP. El script responde
 * `callback({...})` y el navegador lo ejecuta como si fuera un script normal,
 * esquivando el problema de CORS.
 */
function jsonp(url: string, timeoutMs = 15000): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      reject(new Error("sin navegador"));
      return;
    }

    jsonpSeq += 1;
    const name = `__anxoMatches${Date.now().toString(36)}${jsonpSeq}`;
    const globals = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      delete globals[name];
      script.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("timeout"));
    }, timeoutMs);

    globals[name] = (data: unknown) => {
      cleanup();
      if (data && typeof data === "object") resolve(data as JsonObject);
      else reject(new Error("respuesta"));
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("red"));
    };

    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${encodeURIComponent(name)}`;
    document.head.appendChild(script);
  });
}

function matchesUrlFrom(base: string): string {
  if (!base) return "";
  try {
    const url = new URL(base);
    url.searchParams.set("action", "partidos");
    return url.toString();
  } catch {
    return "";
  }
}

async function fetchMatchesFrom(url: string): Promise<Match[] | null> {
  try {
    const data = await jsonp(url, 25000);
    if (data["ok"] !== true) return null;
    const raw = data["partidos"];
    if (!Array.isArray(raw)) return null;
    return raw.map(normalizeMatch).filter((match): match is Match => match !== null);
  } catch {
    return null;
  }
}

/**
 * Descarga el calendario de la hoja. Devuelve `[]` si la hoja dice que no hay
 * partidos, y `null` si no se pudo leer (sin URL, sin red o script antiguo).
 * Si queda una URL de prueba guardada y falla, vuelve automáticamente a la
 * hoja oficial: es lo que pasaba al dejar una prueba con `?sheet=...`.
 */
export async function loadMatchesFromSheet(force = false): Promise<Match[] | null> {
  const url = matchesUrlFrom(getFanSheetEndpoint());
  // Se mira antes de cualquier espera: la otra carga de la página puede limpiar
  // la URL de prueba mientras esta todavía está intentando leer la hoja.
  const hadOverride = hasFanSheetOverride();
  if (!url) return null;

  if (!force && matchesCache && Date.now() - matchesCache.at < MATCHES_TTL_MS) {
    return matchesCache.matches;
  }

  let matches = await fetchMatchesFrom(url);

  if (!matches && hadOverride) {
    resetFanSheetOverride();
    const official = matchesUrlFrom(getDefaultFanSheetEndpoint());
    if (official && official !== url) matches = await fetchMatchesFrom(official);
  }

  if (!matches) return null;

  writeCachedMatches(matches);
  matchesCache = { at: Date.now(), matches };
  return matches;
}

const matchKey = (match: Match): string => {
  const kickoff = Date.parse(match.kickoffAt);
  const when = Number.isNaN(kickoff) ? match.kickoffAt : String(kickoff);
  return [
    match.rival,
    when,
    match.home ? "1" : "0",
    match.played ? "1" : "0",
    match.matchday ?? 0,
    match.gf ?? "",
    match.ga ?? "",
    match.addedFirst ?? 0,
    match.addedSecond ?? 0,
  ].join("|");
};

async function confirmMatch(match: Match): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await wait(attempt === 0 ? 700 : 1200);
    const list = await loadMatchesFromSheet(true);
    if (list === null) continue;
    const found = list.find((item) => item.id === match.id);
    if (found && matchKey(found) === matchKey(match)) return true;
  }
  return false;
}

/**
 * Crea o actualiza un partido. Como el POST es ciego, se comprueba releyendo
 * la hoja: si el cambio no aparece, la clave del panel es incorrecta o el
 * script desplegado es el antiguo.
 */
export async function saveMatch(match: Match, token: string): Promise<boolean> {
  const endpoint = getFanSheetEndpoint();
  if (!endpoint || !token.trim()) return false;

  const sent = await postSheetPayload(endpoint, {
    type: "partido",
    token: token.trim(),
    partido: match,
  });
  if (!sent) return false;

  return confirmMatch(match);
}

export async function deleteMatch(id: string, token: string): Promise<boolean> {
  const endpoint = getFanSheetEndpoint();
  if (!endpoint || !token.trim() || !id) return false;

  const sent = await postSheetPayload(endpoint, {
    type: "partido-borrar",
    token: token.trim(),
    id,
  });
  if (!sent) return false;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await wait(attempt === 0 ? 700 : 1200);
    const list = await loadMatchesFromSheet(true);
    if (list === null) continue;
    if (!list.some((item) => item.id === id)) return true;
  }
  return false;
}

export function newMatchId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Valor para un <input type="datetime-local"> a partir del ISO guardado. */
export function toLocalInput(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

/** Vuelve a ISO (con zona local) desde el valor del <input type="datetime-local">. */
export function fromLocalInput(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}
