import { createFileRoute } from "@tanstack/react-router";
import type * as React from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Calendar, User, ChevronRight, Mail, Phone, IdCard, Home, Plane, Bell } from "lucide-react";

import {
  FIRST_HALF_DURATION,
  SECOND_HALF_DURATION,
  awayActivePlayMs,
  awayProgressRanges,
  effectiveDisconnectionSeconds,
  isHalfTime,
  matchElapsedSeconds,
  matchProgressPct,
  matchTiming,
  restoreAwayRanges,
  type AwayRange,
  type MatchExtra,
  type ProgressRange,
} from "@/lib/match-clock";
import {
  buildFanSnapshot,
  flushFanSheetQueue,
  isFanSheetEnabled,
  makeSessionId,
  pendingFanSheetCount,
  sendFanSnapshot,
} from "@/lib/fan-sheet";
import { useNow } from "@/hooks/use-now";
import { AdminPanel } from "@/components/admin-panel";
import {
  DEFAULT_MATCHES,
  loadMatchesFromSheet,
  matchLabel,
  partitionMatches,
  readCachedMatches,
  type Match,
  type MatchesState,
} from "@/lib/matches";

// ==========================================
// CONFIGURACIÓN DE LA RUTA (TanStack Router)
// ==========================================
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Modo Anxo Carro · CD Lugo" },
      { name: "description", content: "Desconecta del móvil y vive el partido del CD Lugo en el Anxo Carro." },
      { property: "og:title", content: "Modo Anxo Carro · CD Lugo" },
      { property: "og:description", content: "Desconecta del móvil y vive el partido del CD Lugo en el Anxo Carro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

// ==========================================
// COMPONENTES VISUALES AUXILIARES
// ==========================================

// Las imágenes se sirven con una versión en la URL para que el móvil no se
// quede con la copia antigua en caché tras normalizar los escudos.
const crestSrc = (file: string) => `${file}?v=3`;

// En el servidor no hay layout: el prerenderizado usa useEffect y el navegador
// mide antes de pintar para que no se vea el salto de escala.
const useFitLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function CrestImage({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <img 
      src={crestSrc("/lugo.png")} 
      alt="Escudo CD Lugo" 
      className={`object-contain ${className}`}
      onError={(e) => {
        (e.currentTarget as HTMLElement).style.display = 'none';
      }}
    />
  );
}

const CRESTS: Record<string, string> = {
  "CD Lugo": "/lugo.png",
  "Lugo": "/lugo.png",
  "CP Cacereño": "/cacereno.png",
  "Cacereño": "/cacereno.png",
  "AD Mérida": "/merida.png",
  "Mérida": "/merida.png",
  "Mirandés": "/mirandes.png",
  "Pontevedra": "/pontevedra.png",
  "UD Ourense": "/ourense.png",
  "Unionistas CF": "/unionistas.png",
  "Ponferradina": "/ponferradina.png",
  "Zamora CF": "/zamora.png",
  "Racing Ferrol": "/ferrol.png",
  "Real Avilés": "/aviles.png",
  "UD Logroñés": "/logrones.png",
  "Depor Fabril": "/depor.png",
  "Arenas Club": "/arenas.png",
  "CyD Leonesa": "/leonesa.png",
  "Barakaldo CF": "/barakaldo.png",
  "Athletic B": "/athletic-b.png",
  "CD Extremadura": "/extremadura.png",
};

/** Quita acentos, mayúsculas y espacios para encontrar el escudo aunque el
 *  nombre venga de la hoja con otra forma (p. ej. "Aviles" o "Cacereno"). */
const normalizeCrestName = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const CRESTS_BY_KEY = new Map(Object.entries(CRESTS).map(([key, src]) => [normalizeCrestName(key), src]));

function TeamCrest({ name, className = "w-8 h-8" }: { name: string; className?: string }) {
  const imageSrc = CRESTS[name] ?? CRESTS_BY_KEY.get(normalizeCrestName(name));

  if (!imageSrc) {
    const initial = name.substring(0, 3).toUpperCase();
    return (
      <div className={`flex items-center justify-center rounded-lg bg-muted font-display text-sm font-bold ${className}`}>
        {initial}
      </div>
    );
  }

  return (
    <img 
      src={crestSrc(imageSrc)} 
      alt={`Escudo ${name}`} 
      className={`object-contain ${className}`}
      onError={(e) => {
        (e.currentTarget as HTMLElement).style.display = 'none';
      }}
    />
  );
}

function Ball({ className = "", color = "var(--primary)", clipId }: { className?: string; color?: string; clipId?: string }) {
  const generatedId = useId().replace(/:/g, "");
  const id = clipId ?? `balon-${generatedId}`;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <clipPath id={id}><circle cx="12" cy="12" r="10.5" /></clipPath>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="var(--card)" />
      <g clipPath={`url(#${id})`} stroke={color} strokeWidth=".65" strokeLinejoin="round">
        {/* Pentágono central y cinco paneles: el balón clásico de siempre. */}
        <path d="M12 7 L16.76 10.46 L14.94 16.05 H9.06 L7.24 10.46 Z" fill={color} />
        <path d="M9 0 H15 L15.5 3.4 L12 5 L8.5 3.4 Z M0 6 L3.2 5.8 L5.4 9 L3.5 12 L0 11 Z M24 6 L20.8 5.8 L18.6 9 L20.5 12 L24 11 Z M2 21 L4.5 16.8 L8 17.2 L9 20.8 L6 24 Z M22 21 L19.5 16.8 L16 17.2 L15 20.8 L18 24 Z" fill={color} />
        {/* Cada unión sale de un vértice y llega al panel vecino: ninguna línea
            atraviesa el balón ni queda suelta. */}
        <g fill="none">
          <path d="M12 7 V5 M16.76 10.46 L18.6 9 M14.94 16.05 L16 17.2 M9.06 16.05 L8 17.2 M7.24 10.46 L5.4 9" />
          <path d="M8.5 3.4 L3.2 5.8 M15.5 3.4 L20.8 5.8 M3.5 12 L4.5 16.8 M20.5 12 L19.5 16.8 M9 20.8 H15" />
        </g>
      </g>
      <circle cx="12" cy="12" r="10.5" fill="none" stroke={color} strokeWidth="1" />
    </svg>
  );
}

function Btn({ className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={`w-full rounded-2xl bg-primary py-4 font-display text-2xl tracking-wider text-primary-foreground shadow-glow transition active:scale-95 disabled:opacity-40 ${className}`} />;
}

// ==========================================
// TIPOS Y CONSTANTES
// ==========================================
type UserData = { name: string; email: string; phone: string; member: string; notif: boolean; consent: boolean };
type UserProps = { user: UserData; setUser: (u: UserData) => void };
type Step = "splash" | "register" | "app";

type PersistedState = {
  step: Step;
  user: UserData;
  joinedAt: number | null;
  joinedKickoffAt: number | null;
  joinedMatchTimer: number | null;
  awayRanges: AwayRange[];
  // La página se abandonó de verdad (pagehide: otra web, cerrar pestaña). Al
  // volver, el hueco abierto cuenta como ausencia.
  leftPageAt?: number | null;
  // La pantalla estaba bloqueada cuando murió la pestaña: el hueco NO cuenta.
  locked?: boolean;
  // Tiempo que la página siguió viva desde que empezó la ausencia. Distingue
  // salir a otra app (sigue latiendo) de apagar la pantalla (se congela).
  awayAliveMs?: number;
  // Identificador de la sesión de modo fan: es la clave con la que la hoja de
  // Google actualiza la fila del socio (una fila por sesión, no por envío).
  fanSessionId?: string | null;
};

// v2: invalida las sesiones guardadas durante las pruebas en directo.
const STORAGE_KEY = "anxo-carro:v2";

const DEFAULT_USER: UserData = { name: "", email: "", phone: "", member: "", notif: true, consent: false };

/**
 * Guarda las ausencias en el acto. En el móvil el navegador puede congelar la
 * pestaña en cuanto se apaga la pantalla, así que no podemos esperar al efecto
 * de React: si el sistema cierra la pestaña, lo último escrito es lo que vale.
 */
const persistAwayRanges = (ranges: AwayRange[]) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<PersistedState>) : {};
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, awayRanges: ranges }));
  } catch {
    // Sin localStorage seguimos funcionando en memoria.
  }
};

/**
 * Escribe marcas de sesión (página abandonada, pantalla bloqueada) sin tocar
 * el resto del estado guardado. Se hace de forma síncrona porque el navegador
 * puede congelar o descartar la pestaña justo después.
 */
const persistSessionMeta = (patch: { leftPageAt?: number | null; locked?: boolean; awayAliveMs?: number; fanSessionId?: string | null }) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<PersistedState>) : {};
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, ...patch }));
  } catch {
    // Sin localStorage no hay nada que recordar.
  }
};


const parseKickoff = (iso?: string): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

// ==========================================
// TÍTULO AL SALIR DE LA APP
// ==========================================
const APP_TITLE = "Modo Anxo Carro · CD Lugo";
const AWAY_TITLE = "¡Vuelve al Modo Anxo Carro!";

// Chromium consulta el bloqueo de pantalla en sondeos de ~15 s: un apagado muy
// corto puede pasar desapercibido. Los ratos fuera por debajo de este umbral se
// perdonan, para que encender y apagar la pantalla un instante no reste nada.
const SHORT_AWAY_MS = 20_000;
// Mientras está "fuera", la página late cada 2 s y guarda cuánto aguantó viva.
// Es lo que distingue apagar la pantalla desde la app (la pestaña se congela al
// instante y sigue contando) de salir de la web y luego apagar (la página vivió
// al menos un latido y ese hueco sí es ausencia).
const AWAY_ALIVE_THRESHOLD_MS = 2_000;
const AWAY_HEARTBEAT_MS = 2_000;
const AWAY_HEARTBEAT_PERSIST_MS = 5_000;
// Margen para cancelar la ausencia recién cerrada cuando la prueba de bloqueo
// llega tarde (la pestaña estaba congelada y el evento se entrega al volver).
const LOCK_CANCEL_WINDOW_MS = 8_000;
// Cada cuánto se manda el estado del socio a la hoja de Google mientras dura
// el modo fan. Con 30 s, como mucho se pierden los últimos 30 s si el móvil
// muere; al salir de la app se manda además un envío inmediato (sendBeacon).

type NotificationState = "unknown" | "granted" | "denied" | "default" | "unsupported" | "insecure";

const getNotificationState = (): NotificationState => {
  if (typeof window === "undefined") return "unknown";
  // Las notificaciones y el service worker solo existen en HTTPS o localhost.
  if (!window.isSecureContext) return "insecure";
  if (!("Notification" in window)) return "unsupported";
  if (!("serviceWorker" in navigator)) return "unsupported";
  const permission = Notification.permission;
  return permission === "granted" || permission === "denied" ? permission : "default";
};

let notificationWorker: Promise<ServiceWorkerRegistration | null> | null = null;

const registerNotificationWorker = (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  notificationWorker ??= navigator.serviceWorker
    .register("/sw.js")
    .then(async (registration) => {
      // Fuerza a comprobar si hay una versión nueva del worker (por ejemplo,
      // tras cambiar cómo se programa el aviso).
      try {
        await registration.update();
      } catch {
        // Sin conexión o sin soporte: seguimos con el worker que haya.
      }
      return navigator.serviceWorker.ready;
    })
    .catch(() => null);
  return notificationWorker;
};

/** Pide permiso de notificaciones desde el clic de "Entrar al Modo Fan". */
const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  try {
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return false;
    await registerNotificationWorker();
    return true;
  } catch {
    return false;
  }
};

/** Manda un mensaje al service worker (el que muestra/cierra el aviso). */
const postToNotificationWorker = async (message: unknown): Promise<boolean> => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const registration = await registerNotificationWorker();
    const target =
      registration?.active ?? registration?.waiting ?? navigator.serviceWorker.controller;
    if (!target) return false;
    target.postMessage(message);
    return true;
  } catch {
    return false;
  }
};

/** Cancela el aviso programado y cierra el que ya estuviera visible. */
const clearAwayNotification = async () => {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  const messaged = await postToNotificationWorker({ type: "cancel-away-notification" });
  if (messaged) return;
  try {
    const registration = await registerNotificationWorker();
    const shown = await registration?.getNotifications({ tag: "anxo-carro-away" });
    shown?.forEach((notification) => notification.close());
  } catch {
    // Sin notificaciones disponibles: nada que cerrar.
  }
};

// ==========================================
// PANTALLA BLOQUEADA (Idle Detection, solo Chrome/Chromium)
// ==========================================
// Apagar o bloquear la pantalla con la app delante no debe contar como salir:
// el modo fan tiene que seguir sumando minutos en la grada. Chrome en Android
// es el único navegador que permite distinguirlo con la Idle Detection API; en
// el resto se usa el latido de la página (si se congela al instante, fue un
// apagado de pantalla).
type IdleScreenState = "locked" | "unlocked";

type IdleDetectorLike = {
  screenState: IdleScreenState | null;
  userState: "active" | "idle" | null;
  start(options?: { threshold?: number; signal?: AbortSignal }): Promise<void>;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};

type IdleDetectorConstructor = {
  new (): IdleDetectorLike;
  requestPermission(): Promise<"granted" | "denied">;
};

const getIdleDetector = (): IdleDetectorConstructor | null => {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { IdleDetector?: IdleDetectorConstructor }).IdleDetector;
  return typeof ctor === "function" ? ctor : null;
};

const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const shortName = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(" ") || "Socio";

// ==========================================
// COMPONENTE PRINCIPAL (INDEX)
// ==========================================
export default function Index() {
  const now = useNow();

  const [step, setStep] = useState<Step>("splash");
  const [user, setUser] = useState<UserData>(DEFAULT_USER);
  const [hydrated, setHydrated] = useState(false);
  const hydratedOnceRef = useRef(false);

  // Sesión de desconexión. joinedAt/joinedKickoffAt son marcas de tiempo reales:
  // así el cronómetro no se reinicia ni se ralentiza al cambiar de pestaña.
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [joinedKickoffAt, setJoinedKickoffAt] = useState<number | null>(null);
  const [joinedMatchTimer, setJoinedMatchTimer] = useState<number | null>(null);
  // Identificador de esta sesión de modo fan. La hoja de Google hace upsert por
  // este id, así que sobrevive a recargas y no duplica filas.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Ratos fuera de la app. El cronómetro se congela mientras `isAway` es true
  // y se reactiva (vuelve el rojo) en cuanto el socio regresa.
  const [awayRanges, setAwayRanges] = useState<AwayRange[]>([]);
  const [isAway, setIsAway] = useState(false);
  const [resumeNotice, setResumeNotice] = useState(false);
  const awayRef = useRef(false);
  const awayStartedAtRef = useRef(0);
  const presenceGraceRef = useRef(0);
  // Si la pestaña murió mientras estaba fuera, este marcador de pagehide dice
  // que el hueco cuenta como ausencia. Al volver se consume, pero el aviso de
  // bloqueo puede llegar un poco después: durante esa ventana se recuerda que
  // hubo pagehide para no confundir esa ausencia real con un apagado de
  // pantalla.
  const leftPageAtRef = useRef<number | null>(null);
  const leftPageRecentUntilRef = useRef(0);
  const lockedPersistRef = useRef(false);
  // Latido mientras se está fuera: mide si la página siguió viva (pantalla
  // encendida) o se congeló (pantalla apagada).
  const awayAliveMsRef = useRef(0);
  const lastAwayAliveMsRef = useRef(0);
  const awayHeartbeatRef = useRef(0);
  // Última ausencia cerrada al volver, con el latido que tenía cuando se
  // cerró. Un aviso de bloqueo tardío solo puede borrar ESA ausencia (y solo
  // si la página se congeló), nunca un gris legítimo anterior.
  const lastClosedAwayRef = useRef<{ end: number; aliveMs: number } | null>(null);
  // Espejo de `awayRanges` para poder persistir en el acto desde un callback.
  const awayRangesRef = useRef<AwayRange[]>([]);
  // Detección de pantalla bloqueada (solo Chrome). Se usa para distinguir un
  // apagado de pantalla desde la app (sigue contando) de una salida real.
  const screenLockedRef = useRef(false);
  const lockEventsRef = useRef(0);
  // Último estado conocido del detector. Si llega un `change` y ni el usuario
  // ni la pantalla han cambiado respecto a lo guardado, es que hubo un ciclo
  // bloqueo/desbloqueo mientras la pestaña estaba congelada: también cuenta
  // como prueba de pantalla apagada.
  const lastScreenStateRef = useRef<IdleScreenState | null>(null);
  const lastUserStateRef = useRef<"active" | "idle" | null>(null);
  const idleDetectorRef = useRef<IdleDetectorLike | null>(null);
  const idleDetectorAbortRef = useRef<AbortController | null>(null);
  const idleDetectorRunningRef = useRef(false);
  const idleDetectorStartingRef = useRef(false);
  const [notificationState, setNotificationState] = useState<NotificationState>("unknown");
  // "on" = el móvil puede detectar la pantalla bloqueada con Idle Detection;
  // "off" = sin permiso o sin soporte. En ambos casos apagar la pantalla cuenta
  // como ausencia; el detector solo ayuda a enterarse antes.
  const [lockGuard, setLockGuard] = useState<"unknown" | "on" | "off">("unknown");
  const lockGuardSupported = useRef(false);
  const [debugVisible, setDebugVisible] = useState(false);

  // ?demo=10 simula que han pasado 10 minutos de partido (útil para probar
  // descanso, 2ª parte y final sin esperar a la hora real del kickoff).
  const [demoKickoffAt, setDemoKickoffAt] = useState<number | null>(null);
  // ?prueba=1 marca los envíos como "Prueba" sin tocar el reloj: así se puede
  // ensayar un partido entero sin que esos minutos entren en el ranking.
  const [testSession, setTestSession] = useState(false);
  // ?admin=1 abre el panel privado del calendario.
  const [adminVisible, setAdminVisible] = useState(false);

  // Calendario: copia local al instante y, en segundo plano, la versión de la
  // hoja (que es la buena si el panel se ha usado desde otro móvil).
  const [matchList, setMatchList] = useState<Match[]>(() => readCachedMatches() ?? DEFAULT_MATCHES);
  const matches = useMemo(() => partitionMatches(matchList), [matchList]);

  const currentMatch = matches.next[0];
  const currentMatchRival = currentMatch?.rival ?? "";
  const currentMatchDate = currentMatch?.date ?? "";
  const scheduledKickoffAt = parseKickoff(currentMatch?.kickoffAt);

  // Descuento del árbitro del partido en juego. Si la sesión empezó con otro
  // partido, se toma el descuento de ese partido para no mezclarlos.
  const extraMatch =
    joinedKickoffAt !== null
      ? matchList.find((item) => parseKickoff(item.kickoffAt) === joinedKickoffAt) ?? currentMatch
      : currentMatch;
  const extraFirstMinutes = extraMatch?.addedFirst ?? 0;
  const extraSecondMinutes = extraMatch?.addedSecond ?? 0;
  const matchExtra: MatchExtra = {
    firstHalfSeconds: extraFirstMinutes * 60,
    secondHalfSeconds: extraSecondMinutes * 60,
  };

  const kickoffAt = demoKickoffAt ?? scheduledKickoffAt;
  const matchTimer = kickoffAt === null ? -1 : matchElapsedSeconds(kickoffAt, now, matchExtra);

  const joinedFanMode = joinedAt !== null;
  const discSeconds =
    joinedAt !== null && joinedKickoffAt !== null
      ? effectiveDisconnectionSeconds(joinedAt, now, joinedKickoffAt, awayRanges, matchExtra)
      : 0;

  // Tramos del círculo que van en gris por haber estado fuera de la app.
  const awaySegments: ProgressRange[] =
    joinedAt !== null && joinedKickoffAt !== null
      ? awayProgressRanges(awayRanges, now, joinedKickoffAt, joinedAt, matchExtra)
      : [];

  // Progreso del partido al entrar al modo fan, calculado con la línea
  // temporal actual. No usamos el valor guardado, que puede venir de otra
  // simulación (?demo) y taparía el rojo con gris.
  const preFanProgress =
    joinedAt !== null && kickoffAt !== null
      ? matchProgressPct(matchElapsedSeconds(kickoffAt, joinedAt, matchExtra), matchExtra)
      : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setTestSession(params.has("prueba"));
    setAdminVisible(params.has("admin"));
    const raw = params.get("demo");
    if (raw === null) return;
    const minutes = Number(raw);
    if (!Number.isFinite(minutes)) return;
    setDemoKickoffAt(Date.now() - minutes * 60_000);
  }, []);

  // Estado real del permiso de notificaciones (HTTPS, permiso bloqueado...).
  useEffect(() => {
    const state = getNotificationState();
    setNotificationState(state);
    if (state === "granted") void registerNotificationWorker();
  }, []);

  // Al salir del panel hay que tomar ya la copia que acaba de escribir el
  // guardado. Si se espera al ritmo de sincronización habitual, el reloj sigue
  // usando la lista antigua (sin descuento) y marca el descanso en 45'.
  const refreshMatchesAfterAdmin = useCallback(() => {
    const cached = readCachedMatches();
    if (cached && cached.length > 0) setMatchList(cached);
    void loadMatchesFromSheet(true).then((list) => {
      if (list && list.length > 0) setMatchList(list);
    });
  }, []);

  // Calendario remoto: se baja al abrir y se renueva cada 5-8 minutos con un
  // intervalo aleatorio, para que 2000 móviles no pidan datos a la vez. La
  // propia carga ya usa una caché de 5 min, así que las visitas rápidas no
  // consumen ejecuciones del script. Si la hoja no responde, queda la copia local.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let timer = 0;

    const sync = async () => {
      const list = await loadMatchesFromSheet();
      if (!cancelled && list && list.length > 0) setMatchList(list);
    };

    const schedule = () => {
      const delay = 5 * 60_000 + Math.random() * 3 * 60_000;
      timer = window.setTimeout(() => {
        void sync().finally(() => {
          if (!cancelled) schedule();
        });
      }, delay);
    };

    void sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timer);
    };
  }, []);

  // ?debug=1 muestra el estado interno del escudo de pantalla apagada.
  useEffect(() => {
    try {
      setDebugVisible(new URLSearchParams(window.location.search).has("debug"));
    } catch {
      // Sin URLSearchParams no hay panel; da igual.
    }
  }, []);

  // Recupera la sesión guardada. Se hace en un efecto (no en el inicializador)
  // para que el primer render coincida entre servidor y cliente. Solo una vez:
  // el calendario remoto puede llegar después y no debe repetir la restauración.
  useEffect(() => {
    if (hydratedOnceRef.current) return;
    hydratedOnceRef.current = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedState>;
        if (saved.user) setUser({ ...DEFAULT_USER, ...saved.user });
        if (saved.step === "register" || saved.step === "app") setStep(saved.step);

        // No revivas una sesión de modo fan de otro partido (por ejemplo la
        // prueba en directo). En ?demo= tampoco: cada carga es una simulación
        // nueva, así que una sesión anterior no debe arrastrar minutos ni
        // ausencias que taparían el rojo del círculo.
        const isDemo = new URLSearchParams(window.location.search).has("demo");
        const belongsToThisMatch =
          typeof saved.joinedKickoffAt === "number" && saved.joinedKickoffAt === scheduledKickoffAt;

        if (typeof saved.joinedAt === "number" && !isDemo && belongsToThisMatch) {
          setJoinedAt(saved.joinedAt);
          setJoinedKickoffAt(typeof saved.joinedKickoffAt === "number" ? saved.joinedKickoffAt : null);
          setJoinedMatchTimer(typeof saved.joinedMatchTimer === "number" ? saved.joinedMatchTimer : 0);

          // La sesión de la hoja se recupera con el socio. Si viene de una
          // versión anterior sin id, se genera uno y se guarda ya mismo.
          const savedSessionId =
            typeof saved.fanSessionId === "string" ? saved.fanSessionId.trim() : "";
          const restoredSessionId = savedSessionId || makeSessionId();
          sessionIdRef.current = restoredSessionId;
          setSessionId(restoredSessionId);
          if (!savedSessionId) persistSessionMeta({ fanSessionId: restoredSessionId });

          // Si la pestaña murió estando fuera, el último intervalo queda
          // abierto y hay que decidir qué hacer al volver:
          // - Si se abandonó la página (pagehide: otra web, cerrar pestaña),
          //   todo el hueco cuenta como ausencia: se cierra al volver.
          // - Si la pestaña murió con la pantalla bloqueada desde la app, se
          //   descarta entero: apagar el móvil con la app delante sigue
          //   sumando minutos de grada.
          const leftPageAt = typeof saved.leftPageAt === "number" ? saved.leftPageAt : null;
          const wasLocked = saved.locked === true;
          const aliveMs = typeof saved.awayAliveMs === "number" ? saved.awayAliveMs : 0;
          leftPageAtRef.current = leftPageAt;
          lockedPersistRef.current = wasLocked;
          const savedRanges = Array.isArray(saved.awayRanges) ? saved.awayRanges : [];
          const restored = restoreAwayRanges(savedRanges, Date.now(), {
            leftPage: leftPageAt !== null,
            aliveMs,
            aliveThresholdMs: AWAY_ALIVE_THRESHOLD_MS,
            shortAwayMs: SHORT_AWAY_MS,
          });
          // Los marcadores se consumen al persistir (efecto de estado), no aquí:
          // así la hidratación es idempotente si React la ejecuta dos veces.
          leftPageAtRef.current = null;
          awayAliveMsRef.current = 0;
          lastAwayAliveMsRef.current = 0;
          awayRangesRef.current = restored;
          setAwayRanges(restored);
        } else {
          awayRangesRef.current = [];
          setAwayRanges([]);
          sessionIdRef.current = null;
          setSessionId(null);
        }
      }
    } catch {
      // localStorage no disponible (modo privado, cuota...): seguimos sin persistir.
    }
    setHydrated(true);
  }, [scheduledKickoffAt]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const state: PersistedState = {
        step,
        user,
        joinedAt,
        joinedKickoffAt,
        joinedMatchTimer,
        awayRanges,
        leftPageAt: leftPageAtRef.current,
        locked: lockedPersistRef.current,
        awayAliveMs: awayAliveMsRef.current,
        fanSessionId: sessionIdRef.current,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignoramos fallos al escribir.
    }
  }, [hydrated, step, user, joinedAt, joinedKickoffAt, joinedMatchTimer, awayRanges]);

  // Actualiza los tramos de ausencia en memoria y en localStorage al mismo
  // tiempo (el móvil puede congelar la pestaña justo después).
  const applyAwayRanges = useCallback((updater: (prev: AwayRange[]) => AwayRange[]) => {
    const next = updater(awayRangesRef.current);
    awayRangesRef.current = next;
    setAwayRanges(next);
    persistAwayRanges(next);
  }, []);

  // Latido de la página mientras está fuera. Sirve para saber, al volver, si
  // la pantalla estaba encendida (la página siguió ejecutándose) o apagada (se
  // congeló). También se guarda, para el caso de que la pestaña muera.
  const stopAwayHeartbeat = useCallback(() => {
    if (awayHeartbeatRef.current) {
      window.clearInterval(awayHeartbeatRef.current);
      awayHeartbeatRef.current = 0;
    }
  }, []);

  const startAwayHeartbeat = useCallback(() => {
    stopAwayHeartbeat();
    awayAliveMsRef.current = 0;
    const startedAt = Date.now();
    let lastPersist = startedAt;
    persistSessionMeta({ awayAliveMs: 0 });
    awayHeartbeatRef.current = window.setInterval(() => {
      const nowMs = Date.now();
      awayAliveMsRef.current = nowMs - startedAt;
      if (nowMs - lastPersist >= AWAY_HEARTBEAT_PERSIST_MS) {
        lastPersist = nowMs;
        persistSessionMeta({ awayAliveMs: awayAliveMsRef.current });
      }
    }, AWAY_HEARTBEAT_MS);
  }, [stopAwayHeartbeat]);

  // Al desmontar no dejamos el latido corriendo.
  useEffect(() => () => stopAwayHeartbeat(), [stopAwayHeartbeat]);


  // Al salir de la web (otra app, otra pestaña, minimizar...) el cronómetro se
  // congela. Al volver se cierra el intervalo de ausencia y el modo fan se
  // reactiva (el círculo vuelve a rojo).
  const markAway = useCallback(() => {
    if (awayRef.current) return;
    // Ojo: no se comprueba `screenLockedRef` aquí. Ese flag puede quedarse
    // "pegado" si el evento de bloqueo llega tarde (pestaña congelada) y
    // entonces se ignorarían todas las salidas. El apagado de pantalla se
    // neutraliza después con la evidencia de bloqueo y el latido de la página.
    // Margen tras entrar: los diálogos de permiso pueden quitar el foco un
    // instante y no queremos que eso cuente como salida.
    if (Date.now() < presenceGraceRef.current) return;
    const startedAt = Date.now();
    awayRef.current = true;
    awayStartedAtRef.current = startedAt;
    setIsAway(true);
    applyAwayRanges((prev) =>
      prev.some((r) => r.end === null) ? prev : [...prev, { start: startedAt, end: null }],
    );
    startAwayHeartbeat();
    // Solo cambiamos el título de la pestaña. No se manda notificación: al
    // apagar la pantalla dentro del Modo Fan la salida se cancela en cuanto se
    // confirma el bloqueo, y el aviso del service worker podía llegar tarde o
    // vibrar en el bolsillo aunque el socio no hubiera salido.
    if (typeof document !== "undefined") document.title = AWAY_TITLE;
  }, [applyAwayRanges, startAwayHeartbeat]);

  const markBack = useCallback(() => {
    // Defensivo: aunque `awayRef` se hubiera quedado desincronizado, si hay un
    // tramo abierto lo cerramos para que el cronómetro no se quede congelado.
    const hasOpenRange =
      awayRef.current || awayRangesRef.current.some((r) => r.end === null);
    if (!hasOpenRange) {
      stopAwayHeartbeat();
      return;
    }
    stopAwayHeartbeat();
    const aliveBeforeClose = awayAliveMsRef.current;
    lastAwayAliveMsRef.current = aliveBeforeClose;
    awayAliveMsRef.current = 0;
    persistSessionMeta({ awayAliveMs: 0 });
    // Cerramos cualquier aviso que quedara de una versión anterior.
    void clearAwayNotification();
    awayRef.current = false;
    const startedAt = awayStartedAtRef.current;
    awayStartedAtRef.current = 0;
    setIsAway(false);
    const end = Date.now();
    // Ausencias muy cortas: Chrome puede no llegar a ver el bloqueo (consulta
    // el estado cada ~15 s). No penalizamos esos segundos.
    const tooShort = startedAt > 0 && end - startedAt < SHORT_AWAY_MS;
    lastClosedAwayRef.current = tooShort ? null : { end, aliveMs: aliveBeforeClose };
    applyAwayRanges((prev) => {
      if (tooShort) {
        const next = prev.filter((r) => r.end !== null);
        return next.length === prev.length ? prev : next;
      }
      if (!prev.some((r) => r.end === null)) return prev;
      return prev.map((r) => (r.end === null ? { ...r, end } : r));
    });
    if (typeof document !== "undefined") document.title = APP_TITLE;
    setResumeNotice(!tooShort);
  }, [applyAwayRanges, stopAwayHeartbeat]);

  // La pantalla se apagó desde la app: la ausencia que se acaba de abrir o
  // cerrar era falsa, así que la deshacemos (sin hueco gris y sin aviso). Solo
  // se toca el último tramo: un gris legítimo anterior no se borra.
  const cancelAway = useCallback(
    (windowMs = 8000) => {
      const nowMs = Date.now();
      stopAwayHeartbeat();
      lastAwayAliveMsRef.current = 0;
      awayAliveMsRef.current = 0;
      persistSessionMeta({ awayAliveMs: 0 });
      if (awayRef.current) {
        awayRef.current = false;
        awayStartedAtRef.current = 0;
        setIsAway(false);
      }
      applyAwayRanges((prev) => {
        const last = prev[prev.length - 1];
        if (!last) return prev;
        // Ausencia aún abierta: era la pantalla apagándose, se borra.
        if (last.end === null) return prev.slice(0, -1);
        // Ausencia ya cerrada: solo si es la última que se cerró al volver y
        // la página se congeló (pantalla apagada). Un gris legítimo anterior
        // —aunque se cerrara hace un momento— no se toca.
        const closed = lastClosedAwayRef.current;
        if (!closed || closed.end !== last.end) return prev;
        if (nowMs - closed.end > windowMs) return prev;
        if (closed.aliveMs >= AWAY_ALIVE_THRESHOLD_MS) return prev;
        return prev.slice(0, -1);
      });
      lastClosedAwayRef.current = null;
      if (typeof document !== "undefined") document.title = APP_TITLE;
      setResumeNotice(false);
      void clearAwayNotification();
    },
    [applyAwayRanges, stopAwayHeartbeat],
  );

  const handleScreenStateChange = useCallback(() => {
    const detector = idleDetectorRef.current;
    if (!detector) return;
    const screenState = detector.screenState;
    const userState = detector.userState ?? null;
    const prevScreen = lastScreenStateRef.current;
    const prevUser = lastUserStateRef.current;
    lastScreenStateRef.current = screenState;
    lastUserStateRef.current = userState;

    const locked = screenState === "locked";
    // Si llega un `change` pero ni la pantalla ni la actividad han cambiado
    // respecto a lo último que vimos, es un ciclo bloqueo→desbloqueo que se
    // entregó tarde: la pestaña estaba congelada y, al descongelarse, el
    // detector ya estaba otra vez en "unlocked". Cuenta como pantalla apagada.
    const missedLockCycle =
      prevScreen !== null && prevUser !== null && prevScreen === screenState && prevUser === userState;

    // Con la app visible la pantalla no puede estar bloqueada: si el evento
    // llega tarde (pestaña congelada y descongelada), no dejamos el escudo
    // "pegado", porque entonces se ignorarían todas las salidas siguientes.
    const visible = typeof document !== "undefined" && document.visibilityState === "visible";
    const lockedNow = locked && !visible;
    screenLockedRef.current = lockedNow;
    if (lockedPersistRef.current !== lockedNow) {
      lockedPersistRef.current = lockedNow;
      // Se guarda al momento: si el móvil congela la pestaña con la pantalla
      // apagada desde la app y luego la descarta, al reabrir ese hueco NO debe
      // contar como ausencia (si antes se salió de la web, manda pagehide).
      persistSessionMeta({ locked: lockedNow });
    }

    // Un pagehide es salir de la web de verdad (otra página, cerrar pestaña).
    // Ese hueco no se borra aunque la pantalla se apague después: es justo el
    // caso "salgo de la web y luego apago", que debe quedar en pausa.
    const leftPage =
      leftPageAtRef.current !== null || Date.now() < leftPageRecentUntilRef.current;

    if (lockedNow) {
      lockEventsRef.current += 1;
      // Si la pantalla se apagó con la app delante, el latido se cortó al
      // instante: la ausencia era falsa y se deshace (el modo fan sigue).
      const openAway = awayRef.current;
      const closed = lastClosedAwayRef.current;
      const justClosed = closed !== null && Date.now() - closed.end <= LOCK_CANCEL_WINDOW_MS;
      const aliveMs = openAway ? awayAliveMsRef.current : closed?.aliveMs ?? 0;
      const frozenByLock = aliveMs < AWAY_ALIVE_THRESHOLD_MS;
      if (frozenByLock && !leftPage && (openAway || justClosed)) cancelAway(LOCK_CANCEL_WINDOW_MS);
      return;
    }

    if (locked || missedLockCycle) {
      // El bloqueo puede avisarse tarde: cuando el móvil se queda en el
      // bolsillo, Chrome congela la pestaña y el evento "locked" no llega
      // hasta que se enciende la pantalla. Si ya estamos delante, la ausencia
      // terminó aquí. También se deshace si fue apagar la pantalla desde la app.
      lockEventsRef.current += 1;
      const closed = lastClosedAwayRef.current;
      const justClosed = closed !== null && Date.now() - closed.end <= LOCK_CANCEL_WINDOW_MS;
      const frozenByLock = (closed?.aliveMs ?? 0) < AWAY_ALIVE_THRESHOLD_MS;
      if (frozenByLock && !leftPage && justClosed) cancelAway(LOCK_CANCEL_WINDOW_MS);
      if (visible) markBack();
      return;
    }

    // Pantalla encendida con la app delante: reactivamos el modo fan.
    if (visible) markBack();
  }, [cancelAway, markBack]);

  // Pide permiso y arranca el detector. `fromGesture` es el clic de "Entrar al
  // Modo Fan": el permiso exige un gesto, así que se pide sin más esperas.
  const startScreenLockDetection = useCallback(
    async (fromGesture = false): Promise<boolean> => {
      const IdleDetectorCtor = getIdleDetector();
      lockGuardSupported.current = IdleDetectorCtor !== null;
      if (!IdleDetectorCtor) {
        setLockGuard("off");
        return false;
      }
      if (idleDetectorStartingRef.current || idleDetectorRunningRef.current) {
        return idleDetectorRunningRef.current;
      }
      idleDetectorStartingRef.current = true;

      try {
        if (!idleDetectorRef.current) {
          const granted = fromGesture
            ? (await IdleDetectorCtor.requestPermission()) === "granted"
            : (await navigator.permissions.query({
                name: "idle-detection",
              } as unknown as PermissionDescriptor)).state === "granted";
          if (!granted) {
            setLockGuard("off");
            return false;
          }

          const detector = new IdleDetectorCtor();
          detector.addEventListener("change", handleScreenStateChange);
          idleDetectorRef.current = detector;
        }

        const detector = idleDetectorRef.current;
        if (!detector) {
          setLockGuard("off");
          return false;
        }
        const controller = new AbortController();
        idleDetectorAbortRef.current = controller;
        await detector.start({ threshold: 60000, signal: controller.signal });
        idleDetectorRunningRef.current = true;
        screenLockedRef.current = detector.screenState === "locked";
        // Foto inicial: a partir de aquí, un `change` sin diferencias es señal
        // de un ciclo de bloqueo que llegó tarde.
        lastScreenStateRef.current = detector.screenState;
        lastUserStateRef.current = detector.userState ?? null;
        setLockGuard("on");
        return true;
      } catch {
        // Sin soporte real, permiso denegado o detector ya arrancado: el modo
        // fan funciona igual; el latido de la página distingue un apagado de
        // pantalla de una salida real.
        const detector = idleDetectorRef.current;
        idleDetectorRef.current = null;
        idleDetectorRunningRef.current = false;
        lastScreenStateRef.current = null;
        lastUserStateRef.current = null;
        idleDetectorAbortRef.current?.abort();
        idleDetectorAbortRef.current = null;
        detector?.removeEventListener("change", handleScreenStateChange);
        setLockGuard("off");
        return false;
      } finally {
        idleDetectorStartingRef.current = false;
      }
    },
    [handleScreenStateChange],
  );

  const stopScreenLockDetection = useCallback(() => {
    const detector = idleDetectorRef.current;
    idleDetectorRef.current = null;
    idleDetectorRunningRef.current = false;
    screenLockedRef.current = false;
    lastScreenStateRef.current = null;
    lastUserStateRef.current = null;
    idleDetectorAbortRef.current?.abort();
    idleDetectorAbortRef.current = null;
    detector?.removeEventListener("change", handleScreenStateChange);
  }, [handleScreenStateChange]);

  useEffect(() => () => stopScreenLockDetection(), [stopScreenLockDetection]);

  // Si la sesión se recupera de localStorage (ya se concedió el permiso en su
  // día), reanudamos el detector sin volver a pedir nada.
  useEffect(() => {
    if (!joinedFanMode) return;
    void startScreenLockDetection();
  }, [joinedFanMode, startScreenLockDetection]);

  useEffect(() => {
    if (!joinedFanMode || typeof window === "undefined") return;

    // Regreso a la página. Solo se reanuda si de verdad está a la vista: si el
    // foco llega con la pestaña todavía oculta (pasa en Android al encender la
    // pantalla), esperamos al `visibilitychange` para no cerrar la ausencia
    // antes de tiempo.
    const handleReturn = () => {
      if (document.visibilityState !== "visible") return;
      // Si la pestaña vuelve a estar delante, la pantalla está encendida:
      // cualquier "locked" recordado es viejo y no debe bloquear las salidas
      // futuras.
      screenLockedRef.current = false;
      if (lockedPersistRef.current) {
        lockedPersistRef.current = false;
        persistSessionMeta({ locked: false });
      }
      // El marcador de pagehide se consume al volver (bfcache incluido), pero
      // se recuerda durante la ventana de cancelación: un aviso de bloqueo
      // tardío no debe borrar la ausencia real de "salgo y luego apago".
      if (leftPageAtRef.current !== null) {
        leftPageAtRef.current = null;
        leftPageRecentUntilRef.current = Date.now() + LOCK_CANCEL_WINDOW_MS;
        persistSessionMeta({ leftPageAt: null });
      }
      markBack();
      // Si el detector se hubiera caído (permiso, monitor del navegador...),
      // se vuelve a intentar al regresar; si ya está activo no hace nada.
      void startScreenLockDetection();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") markAway();
      else handleReturn();
    };

    // Pérdida de foco con la página aún visible: cambiar a otra ventana/app,
    // abrir otra pestaña, Minimizar... Cuenta como salida.
    const handleBlur = () => {
      if (document.visibilityState !== "visible") return;
      markAway();
    };

    // Salir de la página de verdad (otra web, cerrar pestaña). El tramo queda
    // abierto y se cierra a la hora de regreso: si la pestaña se recarga o se
    // destruye mientras estás fuera, el hueco no cuenta como Modo Fan activo.
    const handlePageHide = () => {
      leftPageAtRef.current = Date.now();
      persistSessionMeta({ leftPageAt: leftPageAtRef.current });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleReturn);
    window.addEventListener("pageshow", handleReturn);
    window.addEventListener("pagehide", handlePageHide);

    // Si la app se abre ya en segundo plano, cuenta como ausencia.
    if (document.visibilityState === "hidden") markAway();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleReturn);
      window.removeEventListener("pageshow", handleReturn);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [joinedFanMode, markAway, markBack, startScreenLockDetection]);

  // Aviso breve al volver, para que se vea que el modo fan se ha reactivado.
  useEffect(() => {
    if (!resumeNotice) return;
    const timer = window.setTimeout(() => setResumeNotice(false), 3500);
    return () => window.clearTimeout(timer);
  }, [resumeNotice]);

  // La detección de pantalla bloqueada se arranca al entrar al modo fan y se
  // reanuda al volver a la app (ver el efecto de presencia).

  const enableNotifications = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setNotificationState(getNotificationState());
    return granted;
  }, []);

  // Reintenta activar el escudo de pantalla apagada (hace falta un toque para
  // que Chrome pueda volver a pedir el permiso).
  const enableLockGuard = useCallback(() => {
    void startScreenLockDetection(true);
  }, [startScreenLockDetection]);

  const handleJoinFanMode = () => {
    if (joinedAt !== null) return;
    setJoinedAt(Date.now());
    setJoinedKickoffAt(kickoffAt);
    setJoinedMatchTimer(matchTimer >= 0 ? matchTimer : 0);
    // Cada entrada al modo fan abre una sesión nueva para la hoja.
    const newSessionId = makeSessionId();
    sessionIdRef.current = newSessionId;
    setSessionId(newSessionId);
    persistSessionMeta({ fanSessionId: newSessionId });
    awayRangesRef.current = [];
    setAwayRanges([]);
    persistAwayRanges([]);
    awayRef.current = false;
    leftPageAtRef.current = null;
    leftPageRecentUntilRef.current = 0;
    lockedPersistRef.current = false;
    stopAwayHeartbeat();
    awayAliveMsRef.current = 0;
    lastAwayAliveMsRef.current = 0;
    lastClosedAwayRef.current = null;
    persistSessionMeta({ leftPageAt: null, locked: false, awayAliveMs: 0 });
    presenceGraceRef.current = Date.now() + 2500;
    setIsAway(false);
    setResumeNotice(false);
    // Los permisos se piden de uno en uno: si se lanzan dos diálogos a la vez,
    // Chrome puede descartar el de la pantalla bloqueada y entonces apagar el
    // móvil tardaría más en detectarse. Primero el escudo, y después el aviso.
    void startScreenLockDetection(true).then(() => enableNotifications());
  };

  // Reintenta los envíos que quedaron sin red al abrir la app o al recuperar
  // conexión. No toca el modo fan: solo vacía la cola de la hoja.
  useEffect(() => {
    if (typeof window === "undefined") return;
    flushFanSheetQueue();
    window.addEventListener("online", flushFanSheetQueue);
    return () => window.removeEventListener("online", flushFanSheetQueue);
  }, [sessionId]);

  // Envío del estado del socio a la hoja de Google (una fila por sesión).
  // Solo si ha marcado el consentimiento del premio. Las sesiones simuladas
  // con `?demo=` también se mandan (marcadas como "Prueba" en la hoja) para
  // poder ensayar los minutos antes del partido. Se lee siempre el estado
  // actual de los refs: los minutos son los mismos que se ven en el cronómetro.
  useEffect(() => {
    if (!joinedFanMode || !sessionId || !user.consent) return;
    if (!isFanSheetEnabled()) return;

    const push = (beacon: boolean) => {
      const id = sessionIdRef.current;
      if (!id || joinedAt === null || joinedKickoffAt === null) return;
      const nowMs = Date.now();
      const extra: MatchExtra = {
        firstHalfSeconds: extraFirstMinutes * 60,
        secondHalfSeconds: extraSecondMinutes * 60,
      };
      const ranges = awayRangesRef.current;
      const awayMs = awayActivePlayMs(ranges, nowMs, joinedKickoffAt, extra);
      const elapsed = matchElapsedSeconds(joinedKickoffAt, nowMs, extra);
      sendFanSnapshot(
        buildFanSnapshot(
          {
            name: user.name,
            member: user.member,
            phone: user.phone,
            email: user.email,
            match: currentMatchRival ? `CD Lugo vs ${currentMatchRival}` : "CD Lugo",
            matchDate: currentMatchDate,
            kickoffAt: new Date(joinedKickoffAt).toISOString(),
            joinedAt: new Date(joinedAt).toISOString(),
            joinedMinute: Math.max(
              0,
              Math.floor(matchElapsedSeconds(joinedKickoffAt, joinedAt, extra) / 60),
            ),
            fanSeconds: effectiveDisconnectionSeconds(joinedAt, nowMs, joinedKickoffAt, ranges, extra),
            awaySeconds: Math.floor(awayMs / 1000),
            awayCount: ranges.length,
            status: elapsed >= matchTiming(extra).total ? "finished" : "active",
            consent: true,
            demo: demoKickoffAt !== null || testSession,
          },
          id,
        ),
        { beacon },
      );
    };

    // Un solo envío al entrar, otro al terminar el partido y otro al cerrar.
    // El latido de 30 s se quitó: con 2000 socios eran 360.000 escrituras por
    // partido y Apps Script las rechazaba. Los minutos se calculan en el móvil
    // con marcas de tiempo, así que no hace falta enviarlos cada medio minuto.
    push(false);
    const restante = (matchTiming(matchExtra).total - matchTimer) * 1000;
    const finishTimer =
      restante > 0 && restante < 2_147_483_647
        ? window.setTimeout(() => push(true), restante)
        : null;

    // sendBeacon sobrevive a que la pestaña se cierre. No enviamos al ocultar
    // la pantalla: eso sumaría un envío cada vez que el socio enciende el móvil.
    const handlePageHide = () => push(true);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      if (finishTimer !== null) window.clearTimeout(finishTimer);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [
    joinedFanMode,
    sessionId,
    user.consent,
    user.name,
    user.member,
    user.phone,
    user.email,
    joinedAt,
    joinedKickoffAt,
    currentMatchRival,
    currentMatchDate,
    extraFirstMinutes,
    extraSecondMinutes,
    demoKickoffAt,
    testSession,
  ]);

  const exitAdmin = () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("admin");
      window.history.replaceState({}, "", url.toString());
    } catch {
      // Sin history seguimos: el panel se oculta igual.
    }
    setAdminVisible(false);
    refreshMatchesAfterAdmin();
  };

  if (adminVisible) return <AdminPanel onExit={exitAdmin} />;

  return (
    <div className="flex h-[100dvh] justify-center overflow-hidden bg-muted">
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-background">
        <div key={step} className={`animate-screen-in flex min-h-0 flex-1 flex-col ${step === "app" ? "" : "overflow-y-auto"}`}>
          {step === "splash" && <Splash onNext={() => setStep("register")} />}
          {step === "register" && <Register user={user} setUser={setUser} onNext={() => setStep("app")} />}
          {step === "app" && (
            <AppShell 
              user={user} 
              setUser={setUser} 
              matchesState={matches} 
              matchTimer={matchTimer} 
              joinedFanMode={joinedFanMode}
              onJoinFanMode={handleJoinFanMode}
              disconnectionSeconds={discSeconds}
              isAway={isAway}
              resumeNotice={resumeNotice}
              notificationState={notificationState}
              onEnableNotifications={enableNotifications}
              lockGuard={lockGuard}
              onEnableLockGuard={enableLockGuard}
              awaySegments={awaySegments}
              preFanProgress={preFanProgress}
              matchExtra={matchExtra}
              extraSecondMinutes={extraSecondMinutes}
            />
          )}
        </div>
        {debugVisible && (
          <pre className="pointer-events-none fixed inset-x-0 bottom-0 z-50 max-h-52 overflow-auto whitespace-pre-wrap break-words bg-black/85 p-2 text-[10px] leading-tight text-white">
            {[
              `idleDetector: ${getIdleDetector() ? "sí" : "no"}`,
              `escudo: ${lockGuard}`,
              `joined: ${joinedAt !== null} / away: ${isAway}`,
              `vis: ${typeof document === "undefined" ? "?" : document.visibilityState}`,
              `screenLockedRef: ${screenLockedRef.current} (eventos locked: ${lockEventsRef.current})`,
              `sesión: leftPageAt=${leftPageAtRef.current ?? "—"} / locked=${lockedPersistRef.current} / alive=${Math.round((awayRef.current ? awayAliveMsRef.current : lastAwayAliveMsRef.current) / 1000)}s`,
              `detector: ${lastScreenStateRef.current ?? "?"} / ${lastUserStateRef.current ?? "?"}`,
              `ranges: ${awayRanges.map((r) => `${Math.round((r.start - (joinedAt ?? 0)) / 1000)}s→${r.end === null ? "abierto" : `${Math.round((r.end - (joinedAt ?? 0)) / 1000)}s`}`).join(", ") || "—"}`,
              `now: ${new Date().toLocaleTimeString()}`,
              `hoja: ${isFanSheetEnabled() ? "on" : "off"} / consent: ${user.consent === true} / cola: ${pendingFanSheetCount()}`,
              `sesión hoja: ${sessionIdRef.current ?? "—"}`,
              `ua: ${typeof navigator === "undefined" ? "?" : navigator.userAgent}`,
            ].join("\n")}
          </pre>
        )}
      </div>
    </div>
  );
}

function Splash({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-between px-8 py-16 text-center">
      <div />
      <div className="flex flex-col items-center gap-8">
        <CrestImage className="w-32 h-32" />
        <div>
          <h1 className="font-display text-6xl leading-none tracking-wide">Vive el partido</h1>
          <p className="mt-2 font-display text-3xl tracking-wide text-primary">en el Anxo Carro</p>
          <p className="mt-6 text-muted-foreground">Guarda el móvil. Cada minuto en la grada cuenta. Aquí se anima con el corazón, no con la pantalla.</p>
        </div>
      </div>
      <Btn onClick={onNext}>Comenzar</Btn>
    </div>
  );
}

function Field({ icon: Icon, ...p }: { icon: typeof Mail } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-input px-4 py-3.5 focus-within:border-primary">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <input {...p} required className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
    </label>
  );
}

function Register({ onNext, user, setUser }: { onNext: () => void } & UserProps) {
  const bind = (k: "name" | "email" | "phone" | "member") => ({ value: user[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setUser({ ...user, [k]: e.target.value }) });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onNext(); }} className="flex flex-1 flex-col px-6 py-10">
      <div className="flex items-center gap-3"><CrestImage className="w-10 h-10" /><span className="font-display text-2xl tracking-wide">CD Lugo</span></div>
      <div className="mt-6 rounded-3xl bg-card p-5 text-left">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">Cómo jugar en 1 minuto</p>
        <ol className="mt-3 space-y-2 text-sm leading-snug text-muted-foreground">
          <li><span className="font-bold text-foreground">1.</span> Rellena tus datos y marca «Quiero participar en el premio».</li>
          <li><span className="font-bold text-foreground">2.</span> Acepta los permisos del móvil cuando te los pida.</li>
          <li><span className="font-bold text-foreground">3.</span> Pulsa «Entrar al Anxo Carro» y luego «Entrar al Modo Fan».</li>
          <li><span className="font-bold text-foreground">4.</span> Desde esa misma ventana, apaga la pantalla y guarda el móvil. Sigue contando aunque no lo veas.</li>
        </ol>
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">El premio</p>
          <p className="mt-2 text-sm leading-snug text-muted-foreground">
            Todos los que estén todo el partido sin usar el móvil entran en el concurso. Si sales de la web, el cronómetro se para y esos minutos no cuentan: menos tiempo sin móvil, menos opciones de premio.
          </p>
          <p className="mt-3 rounded-2xl bg-primary/10 px-4 py-3 text-sm font-semibold leading-snug text-primary">
            «Prohibido mirar el móvil… aunque marque el Lugo. Sobre todo aunque marque el Lugo.»
          </p>
        </div>
      </div>

      <h2 className="mt-8 font-display text-5xl tracking-wide">Identifícate</h2>
      <p className="mb-8 text-muted-foreground">Acceso rápido para socios.</p>
      <div className="flex flex-col gap-4">
        <Field icon={User} placeholder="Nombre completo" {...bind("name")} />
        <Field icon={Mail} type="email" placeholder="Correo electrónico" {...bind("email")} />
        <Field icon={Phone} type="tel" placeholder="Teléfono móvil" {...bind("phone")} />
        <Field icon={IdCard} inputMode="numeric" placeholder="Número de socio" {...bind("member")} />
      </div>
      <label className="mt-6 flex items-start gap-3 text-left text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={user.consent === true}
          onChange={(e) => setUser({ ...user, consent: e.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
        />
        <span>
          Quiero participar en el premio del partido. Autorizo que se envíen mi nombre, teléfono y
          email al CD Lugo solo para gestionar el premio.
        </span>
      </label>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">
        Si no lo marcas, la app funciona igual, pero tus minutos no entran en el premio.
      </p>
      <div className="mt-auto pt-8"><Btn type="submit">Entrar al Anxo Carro</Btn></div>
    </form>
  );
}

type Tab = "cal" | "mode" | "profile";
function AppShell({ user, setUser, matchesState, matchTimer, joinedFanMode, onJoinFanMode, disconnectionSeconds, isAway, resumeNotice, notificationState, onEnableNotifications, lockGuard, onEnableLockGuard, awaySegments, preFanProgress, matchExtra, extraSecondMinutes }: UserProps & { matchesState: MatchesState; matchTimer: number; joinedFanMode: boolean; onJoinFanMode: () => void; disconnectionSeconds: number; isAway: boolean; resumeNotice: boolean; notificationState: NotificationState; onEnableNotifications: () => Promise<boolean>; lockGuard: "unknown" | "on" | "off"; onEnableLockGuard: () => void; awaySegments: ProgressRange[]; preFanProgress: number | null; matchExtra: MatchExtra; extraSecondMinutes: number }) {
  const [tab, setTab] = useState<Tab>("mode");
  const items: { id: Tab; label: string }[] = [{ id: "cal", label: "Calendario" }, { id: "mode", label: "Anxo Carro" }, { id: "profile", label: "Perfil" }];
  
  return (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <CrestImage className="w-8 h-8" /><span className="font-display text-xl tracking-wide">CD Lugo</span>
      </header>
      <main key={tab} className="animate-tab-in min-h-0 flex-1 overflow-y-auto">
        {tab === "cal" && <CalendarView matchesState={matchesState} />}
        {tab === "mode" && (
          <ModeView 
            matchesState={matchesState} 
            matchTimer={matchTimer} 
            joinedFanMode={joinedFanMode} 
            onJoinFanMode={onJoinFanMode} 
            disconnectionSeconds={disconnectionSeconds} 
            isAway={isAway}
            resumeNotice={resumeNotice}
            notificationState={notificationState}
            onEnableNotifications={onEnableNotifications}
            lockGuard={lockGuard}
            onEnableLockGuard={onEnableLockGuard}
            awaySegments={awaySegments}
            preFanProgress={preFanProgress}
            matchExtra={matchExtra}
            extraSecondMinutes={extraSecondMinutes}
          />
        )}
        {tab === "profile" && (
          <ProfileView
            user={user}
            setUser={setUser}
            notificationState={notificationState}
            onEnableNotifications={onEnableNotifications}
          />
        )}

      </main>
      <nav className="shrink-0 w-full border-t border-border bg-card px-6 pb-4 pt-2">
        <div className="flex items-end justify-between">
          {items.map((it) => {
            const active = tab === it.id;
            if (it.id === "mode")
              return (
                <button key={it.id} onClick={() => setTab("mode")} className="relative z-10 -mt-8 flex flex-col items-center gap-1">
                  <span className={`flex h-16 w-16 items-center justify-center rounded-full ${active ? "bg-primary shadow-glow" : "bg-muted"}`}><Ball className="h-9 w-9" clipId="balon-nav" color={active ? "var(--primary-foreground)" : "var(--primary)"} /></span>
                  <span className={`text-xs ${active ? "text-primary" : "text-muted-foreground"}`}>{it.label}</span>
                </button>
              );
            const Icon = it.id === "cal" ? Calendar : User;
            return (
              <button key={it.id} onClick={() => setTab(it.id)} className={`flex w-20 flex-col items-center gap-1 py-2 ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-6 w-6" /><span className="text-xs">{it.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function CalendarView({ matchesState }: { matchesState: MatchesState }) {
  const [showAllPast, setShowAllPast] = useState(false);
  const [showAllNext, setShowAllNext] = useState(false);
  const currentNext = matchesState.next[0];
  const followingNext = matchesState.next.slice(1);
  const visibleFollowing = showAllNext ? followingNext : followingNext.slice(0, 5);
  const visiblePast = showAllPast ? matchesState.past : matchesState.past.slice(0, 5);

  return (
    <div className="px-5 py-6">
      <h2 className="font-display text-4xl tracking-wide">Calendario</h2>

      {currentNext ? (
        <div className="mt-4 rounded-3xl border border-primary/60 bg-card p-5 shadow-glow">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Próximo partido{currentNext.matchday ? ` · Jornada ${currentNext.matchday}` : ""}</p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex flex-col items-center gap-2">
              <TeamCrest name={currentNext.home ? "CD Lugo" : currentNext.rival} className="h-[68px] w-[68px]" />
              <span className="text-sm font-semibold">{currentNext.home ? "CD Lugo" : currentNext.rival}</span>
            </div>
            <div className="text-center">
              <p className="font-display text-4xl">VS</p>
              <p className="text-xs text-muted-foreground">{currentNext.date}</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <TeamCrest name={!currentNext.home ? "CD Lugo" : currentNext.rival} className="h-[68px] w-[68px]" />
              <span className="text-sm font-semibold">{!currentNext.home ? "CD Lugo" : currentNext.rival}</span>
            </div>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1 text-sm text-muted-foreground">
            {currentNext.home ? <Home className="h-4 w-4" /> : <Plane className="h-4 w-4" />}
            {currentNext.home ? "Estadio Anxo Carro" : "Fuera de casa"}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-border bg-card p-5 text-center text-muted-foreground">
          No hay más partidos próximos programados.
        </div>
      )}

      <h3 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Últimos resultados</h3>
      <ul className="flex flex-col gap-2">
        {visiblePast.map((m, i) => {
          const gf = m.gf ?? 0;
          const ga = m.ga ?? 0;
          const w = gf > ga ? "V" : gf === ga ? "E" : "D";
          const badge = w === "V" ? "bg-win text-primary-foreground" : w === "E" ? "bg-muted text-silver" : "bg-primary text-primary-foreground";
          const [l, v] = m.home ? ["CD Lugo", m.rival] : [m.rival, "CD Lugo"];
          const [gl, gv] = m.home ? [gf, ga] : [ga, gf];
          const Where = m.home ? Home : Plane;
          return (
            <li key={m.id + i} className="animate-screen-in flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${badge}`}>{w}</span>
              <TeamCrest name={m.rival} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${m.home ? "font-bold" : ""}`}>{l}</p>
                <p className={`truncate text-sm ${!m.home ? "font-bold" : ""}`}>{v}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Where className="h-3 w-3" />{m.home ? "En casa" : "Visitante"} · {matchLabel(m.kickoffAt, m.date)}</p>
              </div>
              <div className="flex flex-col items-end font-display text-2xl leading-tight"><span>{gl}</span><span>{gv}</span></div>
            </li>
          );
        })}
      </ul>

      {matchesState.past.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAllPast((value) => !value)}
          className="mt-3 w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-primary transition active:scale-95"
        >
          {showAllPast ? "Mostrar menos" : "Mostrar más"}
        </button>
      )}

      {visibleFollowing.length > 0 && (
        <>
          <h3 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Siguientes jornadas</h3>
          <ul className="flex flex-col gap-2">
            {visibleFollowing.map((m) => {
              const Where = m.home ? Home : Plane;
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-2xl bg-card px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamCrest name={m.rival} className="h-12 w-12 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{m.rival}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Where className="h-3 w-3 shrink-0" />
                        {m.home ? "En casa (Anxo Carro)" : "Visitante"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">{m.date}</span>
                </li>
              );
            })}
          </ul>

          {followingNext.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllNext((value) => !value)}
              className="mt-3 w-full rounded-2xl border border-border bg-card py-3 text-sm font-semibold text-primary transition active:scale-95"
            >
              {showAllNext ? "Mostrar menos" : "Mostrar más"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ModeView({ matchesState, matchTimer, joinedFanMode, onJoinFanMode, disconnectionSeconds, isAway, resumeNotice, notificationState, onEnableNotifications, lockGuard, onEnableLockGuard, awaySegments, preFanProgress, matchExtra, extraSecondMinutes }: { matchesState: MatchesState; matchTimer: number; joinedFanMode: boolean; onJoinFanMode: () => void; disconnectionSeconds: number; isAway: boolean; resumeNotice: boolean; notificationState: NotificationState; onEnableNotifications: () => Promise<boolean>; lockGuard: "unknown" | "on" | "off"; onEnableLockGuard: () => void; awaySegments: ProgressRange[]; preFanProgress: number | null; matchExtra: MatchExtra; extraSecondMinutes: number }) {
  const currentMatch = matchesState.next[0];

  // La pantalla mantiene el diseño original: mismo cronómetro, mismo aro y
  // misma barra inferior. Solo se escala de forma uniforme para que quepa entera
  // en el móvil sin tener que deslizar.
  const fitRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useFitLayoutEffect(() => {
    const fit = fitRef.current;
    const content = contentRef.current;
    if (!fit || !content) return;
    const apply = () => {
      // Medimos a tamaño natural y, si no cabe, escalamos el bloque completo
      // con transform: scale. Así se conservan las proporciones originales y
      // el aro absoluto no se descoloca en Safari móvil (zoom sí lo hacía).
      content.style.transform = "none";
      fit.style.height = "";
      const natural = content.offsetHeight;
      const available = (fit.parentElement as HTMLElement).clientHeight;
      const scale = natural > available && natural > 0 ? available / natural : 1;
      if (scale < 1) {
        content.style.transformOrigin = "top center";
        content.style.transform = `scale(${scale})`;
        fit.style.height = `${natural * scale}px`;
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  });

  // Hora del partido para la cabecera: la que viene en `date` ("21 NOV · 18:45")
  // o, si no la hay, la que se deduce del kickoff.
  const kickoffTimeLabel = (() => {
    if (!currentMatch) return "";
    const timePart = matchLabel(currentMatch.kickoffAt, currentMatch.date).split("·")[1]?.trim();
    if (timePart) return timePart;
    const kickoff = parseKickoff(currentMatch.kickoffAt);
    if (kickoff === null) return "";
    const d = new Date(kickoff);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();

  const fixtureLabel = currentMatch ? `CD Lugo · ${currentMatch.rival}` : "Jornada completada";

  // Antes del kickoff: se muestra el partido y su hora, y el círculo marca 0'.
  let phaseText = kickoffTimeLabel ? `${fixtureLabel} · ${kickoffTimeLabel}` : fixtureLabel;
  let displayMatchClock = "0'";

  // ¿Descanso? El HT manda: el cronómetro ya está pausado por el partido.
  const timing = matchTiming(matchExtra);
  const isDuringHalfTime = isHalfTime(matchTimer, matchExtra);

  if (matchTimer >= 0 && matchTimer <= timing.firstHalf) {
    const mins = Math.floor(matchTimer / 60);
    phaseText = "● 1ª PARTE EN JUEGO";
    displayMatchClock =
      matchTimer > FIRST_HALF_DURATION
        ? `45+${Math.ceil((matchTimer - FIRST_HALF_DURATION) / 60)}'`
        : `${mins}'`;
  } else if (isDuringHalfTime) {
    phaseText = "⏸ DESCANSO";
    displayMatchClock = "HT";
  } else if (matchTimer > timing.htEnd && matchTimer < timing.total) {
    const secondHalfTimer = matchTimer - timing.htEnd;
    const mins = 45 + Math.floor(secondHalfTimer / 60);
    phaseText = "● 2ª PARTE EN JUEGO";
    displayMatchClock =
      matchTimer > timing.htEnd + SECOND_HALF_DURATION
        ? `90+${Math.ceil((matchTimer - timing.htEnd - SECOND_HALF_DURATION) / 60)}'`
        : `${mins}'`;
  } else if (matchTimer >= timing.total) {
    phaseText = "🏁 PARTIDO FINALIZADO";
    displayMatchClock = extraSecondMinutes > 0 ? `90+${extraSecondMinutes}'` : "90'";
  }

  // Si el socio sale de la web, el modo fan queda en pausa hasta que vuelve.
  // Durante el descanso no se pisa el cartel de DESCANSO.
  if (joinedFanMode && isAway && !isDuringHalfTime) {
    phaseText = "⏸ MODO FAN EN PAUSA";
  }

  // El cronómetro se pinta "activo" (rojo) salvo que la pausa sea por salir de
  // la web; en el descanso el parón es del partido, no una penalización.
  const fanLooksActive = joinedFanMode && (!isAway || isDuringHalfTime);

  const progressPct = matchProgressPct(matchTimer, matchExtra);

  // Gris = partido jugado fuera del modo fan. Rojo = partido jugado en modo fan.
  // Si no hay datos de entrada, todo el tramo jugado se pinta en gris.
  // Si el dato de entrada es incoherente (sesión antigua de otra simulación),
  // se ignora y el tramo jugado se pinta en rojo: mejor eso que un aro gris.
  const preFanPct = !joinedFanMode
    ? progressPct
    : preFanProgress !== null && preFanProgress <= progressPct
      ? Math.max(0, preFanProgress)
      : 0;

  const discMins = Math.floor(disconnectionSeconds / 60);
  const discSecs = disconnectionSeconds % 60;
  const formattedDisconnectionTime = `${discMins.toString().padStart(2, '0')}:${discSecs.toString().padStart(2, '0')}`;

  const R = 120, C = 2 * Math.PI * R;
  // El aro se pinta en dos tramos contiguos: gris antes de entrar al Modo Fan
  // y rojo desde ahí hasta ahora. Así el gris nunca tapa al rojo.
  const preFanArc = C * preFanPct;
  const fanArc = C * Math.max(0, progressPct - preFanPct);

  const timerLabel = !joinedFanMode
    ? "Cronómetro de desconexión"
    : isDuringHalfTime
      ? "⏸️ Descanso (Cronómetro pausado)"
      : isAway
        ? "⏸️ Fuera de la app · Cronómetro en pausa"
        : matchTimer < 0
          ? "⏳ En espera del próximo partido"
          : "⏱️ Tiempo de desconexión (sin móvil)";

  return (
    <div ref={fitRef} className="h-full min-h-0 w-full">
      <div ref={contentRef} className="mx-auto flex w-full flex-col items-center px-5 py-6 text-center">
        <p className={`text-xs font-bold uppercase tracking-widest mb-1 px-2 ${fanLooksActive ? (isAway && !isDuringHalfTime ? "text-stone-500" : "text-primary animate-pulse") : "text-stone-500"}`}>
          {phaseText}
        </p>

        {resumeNotice && joinedFanMode && !isAway && (
          <p className="animate-screen-in mb-1 rounded-full bg-primary px-4 py-1 text-xs font-bold uppercase tracking-widest text-primary-foreground">
            ▶ Modo Fan reactivado
          </p>
        )}

        <h2 className="font-display text-4xl tracking-wide">Modo Anxo Carro</h2>

        <div className="relative mt-6 h-[280px] w-[280px]">
          <svg viewBox="0 0 280 280" className="absolute inset-0 -rotate-90">
            <circle cx="140" cy="140" r={R} stroke="var(--muted)" strokeWidth="14" fill="none" />

            {/* Minutos jugados antes de entrar: gris, desde el inicio. */}
            {preFanArc > 0 && (
              <circle
                cx="140" cy="140" r={R}
                stroke="#4b5563"
                strokeWidth="14"
                fill="none"
                strokeLinecap="butt"
                strokeDasharray={`${preFanArc} ${C}`}
                strokeDashoffset="0"
                className="transition-all duration-1000 motion-reduce:transition-none"
              />
            )}

            {/* Minutos dentro del Modo Fan: rojo, justo después del gris. */}
            {joinedFanMode && matchTimer >= 0 && fanArc > 0 && (
              <circle
                cx="140" cy="140" r={R}
                stroke="var(--primary)"
                strokeWidth="14"
                fill="none"
                strokeLinecap="butt"
                strokeDasharray={`${fanArc} ${C}`}
                strokeDashoffset={-preFanArc}
                className="transition-all duration-1000 motion-reduce:transition-none"
              />
            )}

            {/* Ratos fuera de la app: cortan el rojo con un tramo gris. */}
            {joinedFanMode &&
              awaySegments.map((segment, index) => (
                <circle
                  key={`away-${index}`}
                  cx="140" cy="140" r={R}
                  stroke="#4b5563"
                  strokeWidth="14"
                  fill="none"
                  strokeLinecap="butt"
                  strokeDasharray={`${C * (segment.end - segment.start)} ${C}`}
                  strokeDashoffset={-C * segment.start}
                  className="transition-all duration-1000 motion-reduce:transition-none"
                />
              ))}

          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-card" role="img" aria-label="Balón de fútbol clásico">
              <Ball className="h-24 w-24" />
            </div>
            <p className={`mt-2 font-display text-3xl ${fanLooksActive ? "text-primary" : "text-stone-600 dark:text-stone-400"}`}>
              {displayMatchClock}
            </p>
          </div>
        </div>

        <div className="mt-6 w-full rounded-3xl bg-card p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {timerLabel}
            </p>
            <p className={`font-display text-5xl tracking-wider ${fanLooksActive ? "text-primary" : "text-stone-600 dark:text-stone-400"}`} role="timer" aria-label="Cronómetro de desconexión">
              {joinedFanMode ? formattedDisconnectionTime : "00:00"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {currentMatch ? `CD Lugo vs ${currentMatch.rival}` : "Jornada completada"}
            </p>

            {joinedFanMode && lockGuard === "off" && (
              <button
                type="button"
                onClick={onEnableLockGuard}
                className="mt-3 w-full rounded-xl border border-primary/50 px-3 py-2 text-xs font-semibold text-primary"
              >
                📴 Mejorar la detección al apagar la pantalla
              </button>
            )}

            {joinedFanMode && notificationState !== "granted" && notificationState !== "unknown" && (
              notificationState === "default" ? (
                <button
                  type="button"
                  onClick={onEnableNotifications}
                  className="mt-3 w-full rounded-xl border border-primary/50 px-3 py-2 text-xs font-semibold text-primary"
                >
                  🔔 Activar aviso al salir de la app
                </button>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {notificationState === "insecure"
                    ? "🔒 Abre la app por HTTPS para recibir avisos en el móvil"
                    : notificationState === "denied"
                      ? "🔕 Notificaciones bloqueadas en el navegador"
                      : "🔕 Este navegador no admite avisos"}
                </p>
              )
            )}
          </div>

          <Btn
            onClick={onJoinFanMode}
            disabled={joinedFanMode}
          >
            {joinedFanMode
              ? isAway
                ? "⏸️ Modo Fan en pausa"
                : matchTimer < 0
                  ? "Próximamente 🏟️"
                  : isDuringHalfTime
                    ? "⏸️ En Descanso"
                    : "¡Modo Fan Activo! 🏟️"
              : "Entrar al Modo Fan"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ user, setUser, notificationState, onEnableNotifications }: UserProps & { notificationState: NotificationState; onEnableNotifications: () => Promise<boolean> }) {
  const [edit, setEdit] = useState<null | "name" | "email" | "phone" | "member">(null);
  const [busy, setBusy] = useState(false);
  const rows: { k: "name" | "email" | "phone" | "member"; l: string; icon: typeof Mail }[] = [
    { k: "name", l: "Nombre completo", icon: User },
    { k: "email", l: "Correo electrónico", icon: Mail },
    { k: "phone", l: "Teléfono móvil", icon: Phone },
    { k: "member", l: "Número de socio", icon: IdCard },
  ];

  // El interruptor refleja el permiso real del navegador, no solo una
  // preferencia: si está denegado, se ve apagado y el texto explica qué hacer.
  const notificationsOn = user.notif !== false && notificationState === "granted";

  const toggleNotifications = async () => {
    if (busy) return;
    if (notificationsOn) {
      setUser({ ...user, notif: false });
      return;
    }
    setBusy(true);
    try {
      const granted = await onEnableNotifications();
      setUser({ ...user, notif: granted });
    } finally {
      setBusy(false);
    }
  };

  const notifHelp =
    notificationState === "granted"
      ? user.notif !== false
        ? "Activadas: te avisaremos si sales de la app."
        : "Desactivadas: no te avisaremos si sales de la app."
      : notificationState === "denied"
        ? "Bloqueadas por el navegador. Ábrelas en el candado de la barra de direcciones (Permisos → Notificaciones) y vuelve a activarlas aquí."
        : notificationState === "insecure"
          ? "Los avisos necesitan abrir la app por HTTPS."
          : notificationState === "unsupported"
            ? "Este navegador no permite avisos."
            : "Toca el interruptor para permitir los avisos.";
  return (
    <div className="px-5 py-6">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary font-display text-3xl text-primary-foreground">{initials(user.name)}</div>
        <div><h2 className="font-display text-3xl tracking-wide">{shortName(user.name)}</h2><p className="text-sm text-muted-foreground">Socio nº {user.member || "—"}</p></div>
      </div>
      <div className="mt-6 rounded-3xl border border-primary/60 bg-card p-5">
        <div className="flex items-center justify-between"><p className="text-xs uppercase tracking-widest text-muted-foreground">Estado de socio</p><span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">ACTIVO</span></div>
        <p className="mt-2 font-display text-2xl">Temporada 2026/27</p>
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-3xl bg-card">
        {rows.map(({ k, l, icon: Icon }) => (
          <li key={k} className="px-5 py-4">
            <button onClick={() => setEdit(edit === k ? null : k)} className="flex w-full items-center gap-3 text-left">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{l}</p><p className="truncate">{user[k] || "—"}</p></div>
              <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${edit === k ? "rotate-90" : ""}`} />
            </button>
            <div className={`grid transition-all duration-300 ease-out ${edit === k ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
              <div className="overflow-hidden">
                <input value={user[k]} onChange={(e) => setUser({ ...user, [k]: e.target.value })} placeholder={l} className="w-full rounded-xl border border-input bg-transparent px-4 py-3 outline-none focus:border-primary" />
              </div>
            </div>
          </li>
        ))}
        <li className="px-5 py-4">
          <div className="flex items-center gap-3">
            <Bell className={`h-5 w-5 ${notificationsOn ? "text-primary" : "text-muted-foreground"}`} />
            <span className="flex-1">Notificaciones</span>
            <button
              role="switch"
              aria-checked={notificationsOn}
              aria-label="Notificaciones"
              disabled={busy}
              onClick={() => void toggleNotifications()}
              className={`relative h-8 w-14 rounded-full transition-colors duration-300 disabled:opacity-60 ${notificationsOn ? "bg-win" : "bg-muted"}`}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-foreground shadow transition-all duration-300 ${notificationsOn ? "left-7" : "left-1"}`} />
            </button>
          </div>
          <p className={`mt-2 text-xs ${notificationState === "denied" ? "text-destructive" : "text-muted-foreground"}`}>
            {notifHelp}
          </p>
          <p className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-xs leading-snug text-muted-foreground">
            El aviso sale cuando abandonas la web con el Modo Fan activo, para recordarte que el
            cronómetro está en pausa. Si solo apagas la pantalla no se avisa: sigues sumando en la
            grada.
          </p>
        </li>
      </ul>
      <div className="mt-6 rounded-3xl bg-card p-5">
        <label className="flex items-start gap-3 text-left text-sm">
          <input
            type="checkbox"
            aria-label="Participar en el premio del partido"
            checked={user.consent === true}
            onChange={(e) => setUser({ ...user, consent: e.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
          />
          <span>
            Participar en el premio del partido
            <span className="mt-1 block text-xs leading-snug text-muted-foreground">
              Se envían tu nombre, teléfono, email y minutos al CD Lugo solo para el premio. Si lo
              desmarcas, la app sigue funcionando pero no apareces en la lista.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}
