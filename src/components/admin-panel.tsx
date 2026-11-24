// Panel privado para editar el calendario sin tocar código.
//
// Se abre con `?admin=1`. Los partidos se guardan en la pestaña "Partidos" de
// la hoja de Google, así que el cambio llega a todos los móviles la próxima
// vez que abran la app (o al volver a ella).
//
// La clave (`token`) se configura en el Apps Script y solo se guarda en este
// móvil. No es seguridad de banca: es una barrera para que nadie que encuentre
// el enlace pueda cambiar el calendario por diversión.

import { useEffect, useState } from "react";
import { ArrowLeft, CloudOff, Eye, EyeOff, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

import {
  clearMatchesMemoryCache,
  DEFAULT_MATCHES,
  deleteMatch,
  fromLocalInput,
  loadMatchesFromSheet,
  MATCHES_CACHE_KEY,
  matchLabel,
  newMatchId,
  readCachedMatches,
  saveMatch,
  toLocalInput,
  type Match,
} from "@/lib/matches";
import {
  getFanSheetEndpoint,
  hasFanSheetOverride,
  resetFanSheetOverride,
} from "@/lib/fan-sheet";

const TOKEN_KEY = "anxo-carro:admin-token";

type Status = { kind: "idle" | "busy" | "ok" | "error"; text: string };

const inputClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function readToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Sin localStorage la clave dura solo esta sesión.
  }
}

export function AdminPanel({ onExit }: { onExit: () => void }) {
  const [token, setToken] = useState(readToken);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [source, setSource] = useState<"sheet" | "local">("local");
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState<Match | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheetOverride, setSheetOverride] = useState(hasFanSheetOverride);
  const [showToken, setShowToken] = useState(false);

  const sheetConfigured = getFanSheetEndpoint() !== "";

  const reload = async (announce = false) => {
    setStatus({ kind: "busy", text: "Leyendo la hoja…" });
    const remote = await loadMatchesFromSheet(true);
    if (remote && remote.length > 0) {
      setMatches(remote);
      setSource("sheet");
      if (sheetOverride && !hasFanSheetOverride()) setSheetOverride(false);
      setStatus(announce ? { kind: "ok", text: `Calendario actualizado (${remote.length} partidos).` } : { kind: "idle", text: "" });
    } else {
      const cached = readCachedMatches() ?? DEFAULT_MATCHES;
      setMatches(cached);
      setSource("local");
      setStatus(
        remote
          ? { kind: "ok", text: "La hoja no tiene partidos: se muestra la lista local." }
          : {
              kind: "error",
              text: sheetConfigured
                ? "No se pudo leer la hoja ahora. Se muestra la copia local; pulsa «Recargar» para intentarlo de nuevo."
                : "Falta la URL de la hoja (VITE_FAN_SHEET_URL o ?sheet=).",
            },
      );
    }
    setReloadKey((value) => value + 1);
  };

  useEffect(() => {
    void reload();
    // Solo al abrir el panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== MATCHES_CACHE_KEY || !event.newValue) return;
      // Otra pestaña ha guardado: tomamos su copia sin volver a escribirla
      // (si no, dos paneles se estarían avisando sin parar).
      clearMatchesMemoryCache();
      const cached = readCachedMatches();
      if (!cached || cached.length === 0) return;
      setMatches(cached);
      setSource("sheet");
      setReloadKey((value) => value + 1);
      setStatus({ kind: "ok", text: "Calendario actualizado desde otra pestaña." });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleSave = async (match: Match): Promise<boolean> => {
    if (!token.trim()) {
      setStatus({ kind: "error", text: "Escribe primero la clave del panel." });
      return false;
    }
    setBusyId(match.id);
    setStatus({ kind: "busy", text: "Guardando…" });
    const ok = await saveMatch(match, token);
    setBusyId(null);
    if (ok) {
      writeToken(token.trim());
      // Primero se relee la hoja (deja el estado en blanco) y después se anuncia
      // el resultado, para que el mensaje no desaparezca al instante.
      await reload();
      setStatus({ kind: "ok", text: `Guardado: ${match.rival}.` });
      return true;
    }
    setStatus({
      kind: "error",
      text: "No se pudo confirmar el guardado. Pulsa «Mostrar», comprueba la clave del panel y vuelve a guardar.",
    });
    return false;
  };

  const handleDelete = async (match: Match) => {
    if (!token.trim()) {
      setStatus({ kind: "error", text: "Escribe primero la clave del panel." });
      return;
    }
    if (typeof window !== "undefined" && !window.confirm(`¿Borrar ${match.rival} del calendario?`)) return;
    setBusyId(match.id);
    setStatus({ kind: "busy", text: "Borrando…" });
    const ok = await deleteMatch(match.id, token);
    setBusyId(null);
    if (ok) {
      await reload();
      setStatus({ kind: "ok", text: `Borrado: ${match.rival}.` });
    } else {
      setStatus({ kind: "error", text: "No se pudo confirmar el borrado. Pulsa «Mostrar» y comprueba la clave del panel." });
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col bg-background px-4 py-6 text-foreground">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-wide">Panel de partidos</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {source === "sheet" ? "Conectado a la hoja" : "Vista local (sin conexión con la hoja)"}
          </p>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Salir
        </button>
      </header>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground" htmlFor="admin-token">
            Clave del panel
          </label>
          <button
            type="button"
            onClick={() => setShowToken((value) => !value)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-label={showToken ? "Ocultar clave" : "Mostrar clave"}
          >
            {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showToken ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <input
          id="admin-token"
          type={showToken ? "text" : "password"}
          value={token}
          onChange={(event) => setToken(event.target.value)}
          onBlur={() => writeToken(token.trim())}
          placeholder="La clave que pusiste en el Apps Script"
          className={`mt-2 ${inputClass}`}
          autoComplete="current-password"
        />
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          Se guarda solo en este móvil. Si el guardado falla, pulsa «Mostrar» y comprueba la clave antes de volver a intentarlo.
        </p>
      </section>

      {status.text && (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${
            status.kind === "error"
              ? "bg-destructive/10 text-destructive"
              : status.kind === "ok"
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {status.kind === "error" ? <CloudOff className="mr-2 inline h-4 w-4" /> : null}
          {status.text}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void reload(true)}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" /> Recargar
        </button>
        {sheetOverride && (
          <button
            type="button"
            onClick={() => {
              resetFanSheetOverride();
              setSheetOverride(false);
              void reload(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm text-primary"
          >
            Usar hoja oficial
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            setDraft({
              id: newMatchId(),
              rival: "",
              kickoffAt: new Date().toISOString(),
              home: true,
              played: false,
            })
          }
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="h-4 w-4" /> Añadir partido
        </button>
      </div>

      {draft && (
        <MatchEditor
          key={draft.id}
          initial={draft}
          title="Nuevo partido"
          busy={busyId === draft.id}
          onSave={async (match) => {
            const ok = await handleSave(match);
            if (ok) setDraft(null);
          }}
          onCancel={() => setDraft(null)}
        />
      )}

      <div className="mt-4 flex flex-col gap-4">
        {matches === null ? (
          <p className="text-sm text-muted-foreground">Cargando calendario…</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay partidos. Añade el primero.</p>
        ) : (
          matches.map((match) => (
            <MatchEditor
              key={`${match.id}-${reloadKey}`}
              initial={match}
              title={match.played ? "Resultado" : "Próximo / programado"}
              busy={busyId === match.id}
              onSave={handleSave}
              onDelete={() => void handleDelete(match)}
            />
          ))
        )}
      </div>

      <p className="mt-8 text-center text-[11px] leading-snug text-muted-foreground">
        Al guardar, las pestañas abiertas se actualizan al instante. En otros móviles el cambio aparece al abrir la
        app o en unos minutos. No hace falta tocar código ni volver a publicar.
      </p>
    </div>
  );
}

function MatchEditor({
  initial,
  title,
  busy,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: Match;
  title: string;
  busy: boolean;
  onSave: (match: Match) => Promise<unknown> | void;
  onDelete?: () => void;
  onCancel?: () => void;
}) {
  const [rival, setRival] = useState(initial.rival);
  const [kickoff, setKickoff] = useState(toLocalInput(initial.kickoffAt));
  const [date, setDate] = useState(initial.date ?? "");
  const [home, setHome] = useState(initial.home);
  const [matchday, setMatchday] = useState(initial.matchday ? String(initial.matchday) : "");
  const [played, setPlayed] = useState(initial.played);
  const [gf, setGf] = useState(initial.gf === undefined ? "" : String(initial.gf));
  const [ga, setGa] = useState(initial.ga === undefined ? "" : String(initial.ga));
  const [addedFirst, setAddedFirst] = useState(
    initial.addedFirst ? String(initial.addedFirst) : "",
  );
  const [addedSecond, setAddedSecond] = useState(
    initial.addedSecond ? String(initial.addedSecond) : "",
  );
  const [error, setError] = useState("");

  const submit = () => {
    const name = rival.trim();
    const kickoffAt = fromLocalInput(kickoff);
    if (!name) {
      setError("El rival no puede estar vacío.");
      return;
    }
    if (!kickoffAt) {
      setError("Pon la fecha y la hora del partido.");
      return;
    }
    setError("");

    const match: Match = { id: initial.id, rival: name, kickoffAt, home, played };

    const manualDate = date.trim();
    if (manualDate) match.date = manualDate;

    if (matchday.trim() !== "") {
      const value = Number(matchday);
      if (Number.isFinite(value) && value > 0) match.matchday = Math.trunc(value);
    }

    if (gf.trim() !== "") {
      const value = Number(gf);
      if (Number.isFinite(value)) match.gf = Math.trunc(value);
    }

    if (ga.trim() !== "") {
      const value = Number(ga);
      if (Number.isFinite(value)) match.ga = Math.trunc(value);
    }

    // Descuento del árbitro: 0 o vacío significa que no se añade nada.
    const extra1 = Math.trunc(Number(addedFirst));
    if (Number.isFinite(extra1) && extra1 > 0) match.addedFirst = Math.min(extra1, 30);
    const extra2 = Math.trunc(Number(addedSecond));
    if (Number.isFinite(extra2) && extra2 > 0) match.addedSecond = Math.min(extra2, 30);

    void onSave(match);
  };

  const label = matchLabel(fromLocalInput(kickoff) || initial.kickoffAt, date);
  const extraParts: string[] = [];
  if (Number(addedFirst) > 0) extraParts.push(`+${Math.trunc(Number(addedFirst))}'`);
  if (Number(addedSecond) > 0) extraParts.push(`+${Math.trunc(Number(addedSecond))}'`);
  const extraLabel = extraParts.length > 0 ? ` · descuento ${extraParts.join(" / ")}` : "";

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
          <h2 className="truncate font-display text-2xl tracking-wide">{rival.trim() || "Sin nombre"}</h2>
          <p className="text-xs text-muted-foreground">{label || "Sin fecha"}{extraLabel}</p>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-lg border border-destructive/40 p-2 text-destructive disabled:opacity-40"
            aria-label="Borrar partido"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <label className="text-xs text-muted-foreground">
          Rival
          <input value={rival} onChange={(event) => setRival(event.target.value)} className={`mt-1 ${inputClass}`} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Fecha y hora
            <input
              type="datetime-local"
              value={kickoff}
              onChange={(event) => setKickoff(event.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Jornada
            <input
              type="number"
              min={1}
              value={matchday}
              onChange={(event) => setMatchday(event.target.value)}
              placeholder="12"
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Descuento 1ª parte (min)
            <input
              type="number"
              min={0}
              max={30}
              value={addedFirst}
              onChange={(event) => setAddedFirst(event.target.value)}
              placeholder="0"
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Descuento 2ª parte (min)
            <input
              type="number"
              min={0}
              max={30}
              value={addedSecond}
              onChange={(event) => setAddedSecond(event.target.value)}
              placeholder="0"
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
        <p className="-mt-1 text-[11px] leading-snug text-muted-foreground">
          Minutos que añade el árbitro. El reloj y los minutos del premio llegan hasta el 90 + descuento.
        </p>

        <label className="text-xs text-muted-foreground">
          Etiqueta visible (opcional)
          <input
            value={date}
            onChange={(event) => setDate(event.target.value)}
            placeholder="Se genera sola: 15 NOV · 16:30"
            className={`mt-1 ${inputClass}`}
          />
        </label>

        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={home} onChange={(event) => setHome(event.target.checked)} className="h-4 w-4" />
            En casa (Anxo Carro)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={played} onChange={(event) => setPlayed(event.target.checked)} className="h-4 w-4" />
            Ya jugado
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Goles CD Lugo
            <input
              type="number"
              min={0}
              value={gf}
              onChange={(event) => setGf(event.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Goles rival
            <input
              type="number"
              min={0}
              value={ga}
              onChange={(event) => setGa(event.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Save className="h-4 w-4" /> {busy ? "Guardando…" : "Guardar"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2.5 text-sm disabled:opacity-40"
          >
            Cancelar
          </button>
        )}
      </div>
    </section>
  );
}
