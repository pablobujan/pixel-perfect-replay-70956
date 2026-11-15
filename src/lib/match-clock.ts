// Reloj del partido. Todo se calcula con marcas de tiempo (wall clock) para que
// los timers del navegador suspendidos o ralentizados en segundo plano no
// alteren el resultado.

export const FIRST_HALF_DURATION = 45 * 60; // 45 minutos (en segundos)
export const HT_DURATION = 18 * 60; // 18 minutos de descanso (en segundos)
export const SECOND_HALF_DURATION = 45 * 60; // 45 minutos de la 2ª parte (en segundos)

export const HT_START = FIRST_HALF_DURATION;
export const HT_END = FIRST_HALF_DURATION + HT_DURATION;
export const TOTAL_MATCH_DURATION = FIRST_HALF_DURATION + HT_DURATION + SECOND_HALF_DURATION;

/**
 * Minutos que el árbitro añade en cada parte. Se guardan por partido en el
 * panel (`?admin=1`) y alargan el reloj: si hay +3 en la segunda parte, el
 * partido no termina hasta el 90+3.
 */
export type MatchExtra = { firstHalfSeconds: number; secondHalfSeconds: number };

export const NO_MATCH_EXTRA: MatchExtra = { firstHalfSeconds: 0, secondHalfSeconds: 0 };

export type MatchTiming = {
  firstHalf: number;
  htStart: number;
  htEnd: number;
  secondHalf: number;
  total: number;
};

const clampExtra = (seconds: number): number =>
  Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;

/** Límites del partido teniendo en cuenta el descuento de cada parte. */
export function matchTiming(extra: MatchExtra = NO_MATCH_EXTRA): MatchTiming {
  const firstHalf = FIRST_HALF_DURATION + clampExtra(extra.firstHalfSeconds);
  const secondHalf = SECOND_HALF_DURATION + clampExtra(extra.secondHalfSeconds);
  const htStart = firstHalf;
  const htEnd = firstHalf + HT_DURATION;
  return {
    firstHalf,
    htStart,
    htEnd,
    secondHalf,
    total: firstHalf + HT_DURATION + secondHalf,
  };
}

/**
 * Segundos de partido transcurridos desde el kickoff.
 * -1 = el partido aún no ha empezado.
 * Se limita al final del partido (90' + descuentos) para que el reloj no siga.
 */
export function matchElapsedSeconds(
  kickoffAt: number,
  now: number,
  extra: MatchExtra = NO_MATCH_EXTRA,
): number {
  const elapsed = Math.floor((now - kickoffAt) / 1000);
  if (elapsed < 0) return -1;
  return Math.min(elapsed, matchTiming(extra).total);
}

/**
 * Progreso del círculo: 0 en el kickoff, 0.5 a los 45' y 1 a los 90'.
 *
 * El descuento del árbitro no estira el círculo: a los 45' el aro se queda a la
 * mitad mientras el reloj sigue en 45+1, 45+2…; en la 2ª parte se llena a los
 * 90' y se queda lleno hasta el final del descuento.
 */
export function matchProgressPct(timer: number, extra: MatchExtra = NO_MATCH_EXTRA): number {
  if (timer < 0) return 0;
  const timing = matchTiming(extra);
  if (timer <= FIRST_HALF_DURATION) {
    return (timer / FIRST_HALF_DURATION) * 0.5;
  }
  if (timer <= timing.htEnd) {
    return 0.5;
  }
  const secondHalfTimer = timer - timing.htEnd;
  if (secondHalfTimer < SECOND_HALF_DURATION) {
    return 0.5 + (secondHalfTimer / SECOND_HALF_DURATION) * 0.5;
  }
  return 1;
}

/**
 * ¿El reloj está en el descanso? Durante el HT el cronómetro ya está pausado
 * por el propio partido: una salida de la web no debe cambiar el mensaje ni
 * sumar una pausa extra. El descuento de la primera parte cuenta como juego.
 */
export function isHalfTime(timer: number, extra: MatchExtra = NO_MATCH_EXTRA): boolean {
  const timing = matchTiming(extra);
  return timer > timing.firstHalf && timer <= timing.htEnd;
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Milisegundos de juego real entre dos instantes. Excluye el descanso y todo lo
 * anterior al kickoff, así el cronómetro de desconexión se pausa solo en el HT.
 */
export function activePlayMsBetween(
  start: number,
  end: number,
  kickoffAt: number,
  extra: MatchExtra = NO_MATCH_EXTRA,
): number {
  const timing = matchTiming(extra);
  const firstHalfStart = kickoffAt;
  const firstHalfEnd = kickoffAt + timing.firstHalf * 1000;
  const secondHalfStart = kickoffAt + timing.htEnd * 1000;
  const secondHalfEnd = kickoffAt + timing.total * 1000;

  return (
    overlapMs(start, end, firstHalfStart, firstHalfEnd) +
    overlapMs(start, end, secondHalfStart, secondHalfEnd)
  );
}

/** Segundos de desconexión acumulados desde que el socio entró al modo fan. */
export function disconnectionSeconds(
  joinedAt: number,
  now: number,
  kickoffAt: number,
  extra: MatchExtra = NO_MATCH_EXTRA,
): number {
  return Math.floor(activePlayMsBetween(joinedAt, now, kickoffAt, extra) / 1000);
}

/** Intervalo en el que el socio estuvo fuera de la app. `end: null` = sigue fuera. */
export type AwayRange = { start: number; end: number | null };

/**
 * Milisegundos de juego real que el socio pasó fuera de la app.
 * Si un intervalo sigue abierto (`end: null`) se mide hasta `now`, por lo que
 * restarlo del total deja el cronómetro congelado mientras está fuera.
 */
export function awayActivePlayMs(
  ranges: AwayRange[],
  now: number,
  kickoffAt: number,
  extra: MatchExtra = NO_MATCH_EXTRA,
): number {
  return ranges.reduce((total, range) => {
    const end = Math.min(range.end ?? now, now);
    if (end <= range.start) return total;
    return total + activePlayMsBetween(range.start, end, kickoffAt, extra);
  }, 0);
}

/**
 * Segundos que de verdad ha estado el socio en modo fan: tiempo desde que entró
 * menos los ratos en los que salió de la app (fuera del descanso, que ya se
 * descuenta aparte).
 */
export function effectiveDisconnectionSeconds(
  joinedAt: number,
  now: number,
  kickoffAt: number,
  awayRanges: AwayRange[],
  extra: MatchExtra = NO_MATCH_EXTRA,
): number {
  const total = activePlayMsBetween(joinedAt, now, kickoffAt, extra);
  const away = awayActivePlayMs(awayRanges, now, kickoffAt, extra);
  return Math.max(0, Math.floor(Math.max(0, total - away) / 1000));
}

/**
 * Reconstruye los tramos de ausencia guardados al recargar/abrir la app.
 *
 * Un tramo abierto significa que la pestaña murió (o se congeló) estando
 * fuera. Al volver hay que decidir si ese hueco cuenta como ausencia:
 * - `leftPage`: la página se abandonó de verdad (`pagehide`: otra web, cerrar
 *   pestaña). El hueco completo es ausencia, así que se cierra al volver.
 * - `aliveMs`: cuánto tiempo siguió viva la página desde que empezó la
 *   ausencia. Si aguantó viva (pantalla encendida, otra app delante), la
 *   salida es real. Si el latido se cortó de inmediato, fue apagado de
 *   pantalla desde la app y el tramo se descarta: apagar el móvil con la app
 *   delante sigue contando como modo fan.
 * - Ausencias muy cortas se perdonan (evita grises por rozar el móvil).
 */
export function restoreAwayRanges(
  ranges: AwayRange[],
  now: number,
  opts: { leftPage: boolean; aliveMs: number; aliveThresholdMs: number; shortAwayMs: number },
): AwayRange[] {
  const closed: AwayRange[] = [];
  const open: AwayRange[] = [];
  for (const range of ranges) {
    if (!range || typeof range.start !== "number") continue;
    if (typeof range.end === "number") closed.push({ start: range.start, end: range.end });
    else open.push({ start: range.start, end: null });
  }
  if (open.length === 0) return closed;

  const start = Math.min(...open.map((r) => r.start));
  if (now - start < opts.shortAwayMs) return closed;
  const definiteExit = opts.leftPage || opts.aliveMs >= opts.aliveThresholdMs;
  if (!definiteExit) return closed;
  return [...closed, { start, end: now }];
}

export type ProgressRange = { start: number; end: number };

/**
 * Tramos del círculo (en fracción 0→1) que hay que pintar en gris porque el
 * socio estaba fuera de la app. Se recortan al partido y al momento de entrar
 * al modo fan, y se fusionan si se solapan. Como el descanso ocupa 0 de
 * círculo, un rato fuera durante el HT no genera tramo visible.
 */
export function awayProgressRanges(
  ranges: AwayRange[],
  now: number,
  kickoffAt: number,
  joinedAt: number,
  extra: MatchExtra = NO_MATCH_EXTRA,
): ProgressRange[] {
  const from = Math.max(kickoffAt, joinedAt);
  const to = Math.min(now, kickoffAt + matchTiming(extra).total * 1000);
  if (to <= from) return [];

  const segments: ProgressRange[] = [];

  for (const range of ranges) {
    const startMs = Math.max(range.start, from);
    const endMs = Math.min(range.end ?? now, to);
    if (endMs <= startMs) continue;

    const start = matchProgressPct(matchElapsedSeconds(kickoffAt, startMs, extra), extra);
    const end = matchProgressPct(matchElapsedSeconds(kickoffAt, endMs, extra), extra);
    if (end > start) segments.push({ start, end });
  }

  segments.sort((a, b) => a.start - b.start);

  const merged: ProgressRange[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && segment.start <= last.end) {
      last.end = Math.max(last.end, segment.end);
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}
