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

import { getFanSheetEndpoint, postSheetPayload } from "@/lib/fan-sheet";

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
};

export type MatchesState = { past: Match[]; next: Match[] };

const CACHE_KEY = "anxo-carro:matches-v1";
/** Margen tras el kickoff para dar un partido por terminado si no se marcó. */
const AUTO_PAST_MS = 3 * 60 * 60 * 1000;

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/**
 * Calendario de reserva. Solo se usa si la hoja no responde y el móvil no
 * tiene nada guardado (primer arranque o hoja aún sin configurar).
 */
export const DEFAULT_MATCHES: Match[] = [
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

  return match;
}

function readCacheRaw(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
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
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(matches));
  } catch {
    // Sin localStorage seguimos con lo que haya en memoria.
  }
}

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

function matchesUrl(): string {
  const base = getFanSheetEndpoint();
  if (!base) return "";
  try {
    const url = new URL(base);
    url.searchParams.set("action", "partidos");
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Descarga el calendario de la hoja. Devuelve `[]` si la hoja dice que no hay
 * partidos, y `null` si no se pudo leer (sin URL, sin red o script antiguo).
 */
export async function loadMatchesFromSheet(): Promise<Match[] | null> {
  const url = matchesUrl();
  if (!url) return null;

  try {
    const data = await jsonp(url);
    if (data["ok"] !== true) return null;
    const raw = data["partidos"];
    if (!Array.isArray(raw)) return null;

    const matches = raw.map(normalizeMatch).filter((match): match is Match => match !== null);
    writeCachedMatches(matches);
    return matches;
  } catch {
    return null;
  }
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
  ].join("|");
};

async function confirmMatch(match: Match): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await wait(attempt === 0 ? 700 : 1200);
    const list = await loadMatchesFromSheet();
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
    const list = await loadMatchesFromSheet();
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
