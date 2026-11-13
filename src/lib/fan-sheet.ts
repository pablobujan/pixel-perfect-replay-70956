// Envío del resultado de cada socio a una hoja de Google (Apps Script).
//
// La app no puede escribir directamente en una hoja de cálculo, así que manda
// un JSON a la URL de una "aplicación web" de Apps Script. El script busca la
// fila de esa sesión y la crea o actualiza. No se espera respuesta: se usa
// `no-cors` para no necesitar CORS y `sendBeacon` cuando la página se oculta.
//
// Configuración:
// - `VITE_FAN_SHEET_URL` en `.env.local` (recomendado: queda compilado en la
//   app y vale para todos los móviles).
// - `?sheet=https://...` en la URL (útil para pruebas; se recuerda en el
//   navegador de ese dispositivo).
// Sin URL configurada todo esto queda desactivado y la app funciona igual.

export type FanSnapshot = {
  sessionId: string;
  name: string;
  member: string;
  phone: string;
  email: string;
  match: string;
  matchDate: string;
  kickoffAt: string;
  joinedAt: string;
  joinedMinute: number;
  fanSeconds: number;
  awaySeconds: number;
  awayCount: number;
  status: "active" | "finished";
  consent: boolean;
  device: string;
  sentAt: string;
  /** Sesión simulada con `?demo=`: se marca en la hoja y no entra en el ranking. */
  demo: boolean;
};

export type FanSnapshotInput = Omit<
  FanSnapshot,
  "sessionId" | "device" | "sentAt" | "status" | "consent" | "demo"
> & {
  status?: FanSnapshot["status"];
  consent?: boolean;
  device?: string;
  sentAt?: string;
  demo?: boolean;
};

const QUEUE_KEY = "anxo-carro:sheet-queue";
const ENDPOINT_STORAGE_KEY = "anxo-carro:sheet-url";
const MAX_QUEUE = 50;

type QueueItem = { payload: FanSnapshot };

const isValidEndpoint = (value: string): boolean => /^https?:\/\//i.test(value);

const envEndpoint = (): string => {
  const value = import.meta.env["VITE_FAN_SHEET_URL"];
  return typeof value === "string" ? value.trim() : "";
};

const readStoredEndpoint = (): string => {
  try {
    return window.localStorage.getItem(ENDPOINT_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
};

/**
 * URL del Apps Script. Prioridad: `?sheet=` (y se recuerda) → `.env.local`.
 * En el móvil lo normal es que venga compilada desde `.env.local`.
 */
export function getFanSheetEndpoint(): string {
  if (typeof window !== "undefined") {
    try {
      const fromQuery = new URLSearchParams(window.location.search).get("sheet");
      const url = fromQuery?.trim() ?? "";
      if (isValidEndpoint(url)) {
        try {
          window.localStorage.setItem(ENDPOINT_STORAGE_KEY, url);
        } catch {
          // Sin localStorage se usa solo en esta carga.
        }
        return url;
      }
    } catch {
      // URLSearchParams no disponible: seguimos con el resto.
    }
    const stored = readStoredEndpoint();
    if (isValidEndpoint(stored)) return stored;
  }
  const fromEnv = envEndpoint();
  return isValidEndpoint(fromEnv) ? fromEnv : "";
}

export function isFanSheetEnabled(): boolean {
  return getFanSheetEndpoint() !== "";
}

/** Identificador estable de la sesión de modo fan (una fila por sesión). */
export function makeSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // Sin crypto.randomUUID: se genera a mano.
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Describe el dispositivo de forma legible para la hoja (sin el UA completo). */
export function describeDevice(): string {
  if (typeof navigator === "undefined") return "desconocido";
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS X/i.test(ua)
          ? "macOS"
          : "otro";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "navegador";
  return `${os} · ${browser}`;
}

export function buildFanSnapshot(
  input: FanSnapshotInput,
  sessionId: string = makeSessionId(),
): FanSnapshot {
  return {
    sessionId,
    name: input.name.trim(),
    member: input.member.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    match: input.match,
    matchDate: input.matchDate,
    kickoffAt: input.kickoffAt,
    joinedAt: input.joinedAt,
    joinedMinute: Math.max(0, Math.floor(input.joinedMinute)),
    fanSeconds: Math.max(0, Math.floor(input.fanSeconds)),
    awaySeconds: Math.max(0, Math.floor(input.awaySeconds)),
    awayCount: Math.max(0, Math.floor(input.awayCount)),
    status: input.status ?? "active",
    consent: input.consent ?? false,
    device: input.device ?? describeDevice(),
    sentAt: input.sentAt ?? new Date().toISOString(),
    demo: input.demo ?? false,
  };
}

function readQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueueItem => {
      if (typeof item !== "object" || item === null) return false;
      const payload = (item as QueueItem).payload;
      return typeof payload === "object" && payload !== null && typeof payload.sessionId === "string";
    });
  } catch {
    return [];
  }
}

function writeQueue(items: QueueItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {
    // Sin localStorage no hay cola: se pierde el envío más antiguo.
  }
}

/**
 * Encola un envío fallido. Solo queda el último estado de cada sesión: no
 * interesa mandar veinte fotos antiguas cuando vuelve la cobertura.
 */
function enqueue(payload: FanSnapshot): void {
  const items = readQueue().filter((item) => item.payload.sessionId !== payload.sessionId);
  items.push({ payload });
  writeQueue(items);
}

/** Un envío confirmado deja obsoleta cualquier copia de esa sesión. */
function dropQueuedSession(sessionId: string): void {
  const items = readQueue();
  if (items.length === 0) return;
  const next = items.filter((item) => item.payload.sessionId !== sessionId);
  if (next.length !== items.length) writeQueue(next);
}

function postBeacon(endpoint: string, payload: FanSnapshot): boolean {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
  try {
    const blob = new Blob([JSON.stringify(payload)], { type: "text/plain;charset=UTF-8" });
    return navigator.sendBeacon(endpoint, blob);
  } catch {
    return false;
  }
}

/**
 * POST “ciego” a la web app de Apps Script. Con `no-cors` la respuesta es
 * opaca: llegar aquí solo significa que el navegador lo envió.
 */
export async function postSheetPayload(endpoint: string, payload: unknown): Promise<boolean> {
  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

async function postFetch(endpoint: string, payload: FanSnapshot): Promise<boolean> {
  const ok = await postSheetPayload(endpoint, payload);
  if (ok) dropQueuedSession(payload.sessionId);
  return ok;
}

/**
 * Manda una foto del estado del socio.
 * - `beacon: true` usa `sendBeacon`, que sobrevive a que la pestaña se cierre
 *   (se llama al ocultar la página o al abandonarla). Como el navegador no
 *   informa de si el envío llegó, se guarda una copia en cola: el siguiente
 *   envío confirmado la borra y, si nunca llega, se reintenta al abrir la app.
 * - Si el envío falla, queda en cola para el siguiente intento.
 */
export function sendFanSnapshot(payload: FanSnapshot, opts: { beacon?: boolean } = {}): void {
  const endpoint = getFanSheetEndpoint();
  if (!endpoint) return;

  if (opts.beacon === true) {
    enqueue(payload);
    if (postBeacon(endpoint, payload)) return;
  }
  void postFetch(endpoint, payload).then((ok) => {
    if (!ok) enqueue(payload);
  });
}

/** Envíos pendientes (para el panel de depuración). */
export function pendingFanSheetCount(): number {
  return readQueue().length;
}

/** Reintenta los envíos que quedaron pendientes (al abrir o al volver la red). */
export function flushFanSheetQueue(): void {
  const endpoint = getFanSheetEndpoint();
  if (!endpoint || typeof window === "undefined") return;
  const items = readQueue();
  if (items.length === 0) return;
  writeQueue([]);
  for (const item of items) {
    void postFetch(endpoint, item.payload).then((ok) => {
      if (!ok) enqueue(item.payload);
    });
  }
}
