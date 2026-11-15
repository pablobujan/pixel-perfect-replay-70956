import { describe, expect, it } from "vitest";

import {
  FIRST_HALF_DURATION,
  HT_END,
  HT_START,
  SECOND_HALF_DURATION,
  TOTAL_MATCH_DURATION,
  awayProgressRanges,
  effectiveDisconnectionSeconds,
  disconnectionSeconds,
  isHalfTime,
  matchElapsedSeconds,
  matchProgressPct,
  matchTiming,
  restoreAwayRanges,
  type MatchExtra,
} from "@/lib/match-clock";

const KICKOFF = Date.UTC(2026, 10, 21, 17, 45);
const at = (seconds: number) => KICKOFF + seconds * 1000;

describe("match clock", () => {
  it("returns -1 before kickoff and clamps at full time", () => {
    expect(matchElapsedSeconds(KICKOFF, at(-1))).toBe(-1);
    expect(matchElapsedSeconds(KICKOFF, at(0))).toBe(0);
    expect(matchElapsedSeconds(KICKOFF, at(600))).toBe(600);
    expect(matchElapsedSeconds(KICKOFF, at(TOTAL_MATCH_DURATION))).toBe(TOTAL_MATCH_DURATION);
    expect(matchElapsedSeconds(KICKOFF, at(TOTAL_MATCH_DURATION + 500))).toBe(TOTAL_MATCH_DURATION);
  });

  it("maps progress to 0 -> 0.5 (descanso) -> 1", () => {
    expect(matchProgressPct(-1)).toBe(0);
    expect(matchProgressPct(FIRST_HALF_DURATION)).toBe(0.5);
    expect(matchProgressPct((HT_START + HT_END) / 2)).toBe(0.5);
    expect(matchProgressPct(TOTAL_MATCH_DURATION)).toBe(1);
  });

  it("flags half time only between the 45' pause and the restart", () => {
    expect(isHalfTime(-1)).toBe(false);
    expect(isHalfTime(FIRST_HALF_DURATION)).toBe(false);
    expect(isHalfTime(HT_START + 1)).toBe(true);
    expect(isHalfTime(HT_END)).toBe(true);
    expect(isHalfTime(HT_END + 1)).toBe(false);
  });

  it("pauses the disconnection timer during half time", () => {
    expect(disconnectionSeconds(at(0), at(FIRST_HALF_DURATION), KICKOFF)).toBe(FIRST_HALF_DURATION);
    expect(disconnectionSeconds(at(0), at(HT_END), KICKOFF)).toBe(FIRST_HALF_DURATION);
    expect(disconnectionSeconds(at(0), at(TOTAL_MATCH_DURATION), KICKOFF)).toBe(90 * 60);
  });

  it("counts only playtime after joining mid-match or before kickoff", () => {
    expect(disconnectionSeconds(at(600), at(1200), KICKOFF)).toBe(600);
    expect(disconnectionSeconds(at(-600), at(600), KICKOFF)).toBe(600);
  });

  it("freezes the timer while the fan is away from the app", () => {
    const away = [{ start: at(600), end: null }];

    expect(effectiveDisconnectionSeconds(at(0), at(900), KICKOFF, away)).toBe(600);
    expect(effectiveDisconnectionSeconds(at(0), at(1800), KICKOFF, away)).toBe(600);
  });

  it("resumes where it left off when the fan comes back", () => {
    const away = [
      { start: at(600), end: at(900) },
      { start: at(1200), end: at(1500) },
    ];

    expect(effectiveDisconnectionSeconds(at(0), at(1800), KICKOFF, away)).toBe(1200);
  });

  it("does not discount time away during half time", () => {
    const away = [{ start: at(FIRST_HALF_DURATION), end: at(HT_END) }];

    expect(effectiveDisconnectionSeconds(at(0), at(HT_END + 600), KICKOFF, away)).toBe(
      FIRST_HALF_DURATION + 600,
    );
  });

  it("marks the away time as a gray segment on the ring", () => {
    const segments = awayProgressRanges(
      [{ start: at(600), end: at(900) }],
      at(1800),
      KICKOFF,
      at(0),
    );
    const segment = segments[0]!;

    expect(segment.start).toBeCloseTo(matchProgressPct(600));
    expect(segment.end).toBeCloseTo(matchProgressPct(900));
  });

  it("keeps the gray segment growing while the fan is still away", () => {
    const segment = awayProgressRanges([{ start: at(600), end: null }], at(1200), KICKOFF, at(0))[0]!;

    expect(segment.start).toBeCloseTo(matchProgressPct(600));
    expect(segment.end).toBeCloseTo(matchProgressPct(1200));
  });

  it("never paints gray before the fan joined the mode", () => {
    const segments = awayProgressRanges([{ start: at(0), end: at(900) }], at(1800), KICKOFF, at(600));

    expect(segments).toHaveLength(1);
    expect(segments[0]!.start).toBeCloseTo(matchProgressPct(600));
    expect(segments[0]!.end).toBeCloseTo(matchProgressPct(900));
  });

  it("merges overlapping away ranges", () => {
    const segments = awayProgressRanges(
      [
        { start: at(600), end: at(900) },
        { start: at(800), end: at(1000) },
      ],
      at(1800),
      KICKOFF,
      at(0),
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]!.start).toBeCloseTo(matchProgressPct(600));
    expect(segments[0]!.end).toBeCloseTo(matchProgressPct(1000));
  });

  it("draws no gray segment for time away during half time", () => {
    expect(
      awayProgressRanges([{ start: at(HT_START), end: at(HT_END) }], at(HT_END), KICKOFF, at(0)),
    ).toEqual([]);
  });

  const awayOpts = (overrides: Partial<Parameters<typeof restoreAwayRanges>[2]> = {}) => ({
    leftPage: false,
    aliveMs: 0,
    aliveThresholdMs: 2_000,
    shortAwayMs: 20_000,
    ...overrides,
  });

  it("cierra el hueco abierto si se salió de la web (pagehide)", () => {
    const ranges = [
      { start: at(600), end: at(900) },
      { start: at(1200), end: null },
    ];

    expect(restoreAwayRanges(ranges, at(3600), awayOpts({ leftPage: true }))).toEqual([
      { start: at(600), end: at(900) },
      { start: at(1200), end: at(3600) },
    ]);
  });

  it("cierra el hueco si la página siguió viva al ocultarse", () => {
    expect(
      restoreAwayRanges([{ start: at(1200), end: null }], at(3600), awayOpts({ aliveMs: 5_000 })),
    ).toEqual([{ start: at(1200), end: at(3600) }]);
  });

  it("descarta el hueco si se apagó la pantalla desde la web (latido cortado)", () => {
    expect(
      restoreAwayRanges(
        [{ start: at(600), end: at(900) }, { start: at(1200), end: null }],
        at(3600),
        awayOpts({ aliveMs: 1_000 }),
      ),
    ).toEqual([{ start: at(600), end: at(900) }]);
  });

  it("perdona huecos muy cortos al volver", () => {
    expect(
      restoreAwayRanges([{ start: at(1200), end: null }], at(1210), awayOpts({ leftPage: true })),
    ).toEqual([]);
  });
});

describe("descuento del árbitro", () => {
  const extra: MatchExtra = { firstHalfSeconds: 3 * 60, secondHalfSeconds: 5 * 60 };

  it("alarga cada parte y el final del partido", () => {
    const timing = matchTiming(extra);

    expect(timing.firstHalf).toBe(48 * 60);
    expect(timing.htStart).toBe(48 * 60);
    expect(timing.htEnd).toBe(66 * 60);
    expect(timing.secondHalf).toBe(50 * 60);
    expect(timing.total).toBe(48 * 60 + 18 * 60 + 50 * 60);
  });

  it("deja el reloj en el 90 + descuento, sin pasarse", () => {
    const timing = matchTiming(extra);

    expect(matchElapsedSeconds(KICKOFF, at(timing.total - 1), extra)).toBe(timing.total - 1);
    expect(matchElapsedSeconds(KICKOFF, at(timing.total), extra)).toBe(timing.total);
    expect(matchElapsedSeconds(KICKOFF, at(timing.total + 600), extra)).toBe(timing.total);
  });

  it("cuenta el descuento de la 1ª parte como juego, no como descanso", () => {
    const timing = matchTiming(extra);

    expect(isHalfTime(timing.firstHalf, extra)).toBe(false);
    expect(isHalfTime(timing.firstHalf + 1, extra)).toBe(true);
    expect(isHalfTime(timing.htEnd, extra)).toBe(true);
    expect(isHalfTime(timing.htEnd + 1, extra)).toBe(false);
  });

  it("deja el aro a la mitad a los 45' y lleno a los 90'", () => {
    const timing = matchTiming(extra);

    expect(matchProgressPct(timing.firstHalf, extra)).toBe(0.5);
    expect(matchProgressPct(FIRST_HALF_DURATION + 90, extra)).toBe(0.5);
    expect(matchProgressPct(timing.htEnd, extra)).toBe(0.5);
    expect(matchProgressPct(timing.htEnd + SECOND_HALF_DURATION / 2, extra)).toBeCloseTo(0.75);
    expect(matchProgressPct(timing.htEnd + SECOND_HALF_DURATION, extra)).toBe(1);
    expect(matchProgressPct(timing.htEnd + SECOND_HALF_DURATION + 90, extra)).toBe(1);
    expect(matchProgressPct(timing.total, extra)).toBe(1);
  });

  it("suma el descuento a los minutos del premio", () => {
    const timing = matchTiming(extra);

    expect(disconnectionSeconds(at(0), at(timing.total), KICKOFF, extra)).toBe(98 * 60);
  });

  it("descuenta del premio un rato fuera durante el descuento aunque el aro ya esté lleno", () => {
    const timing = matchTiming(extra);
    const away = [
      {
        start: at(timing.htEnd + SECOND_HALF_DURATION + 60),
        end: at(timing.htEnd + SECOND_HALF_DURATION + 180),
      },
    ];

    expect(effectiveDisconnectionSeconds(at(0), at(timing.total), KICKOFF, away, extra)).toBe(
      98 * 60 - 120,
    );
    expect(awayProgressRanges(away, at(timing.total), KICKOFF, at(0), extra)).toEqual([]);
  });

  it("ignora descuentos negativos o no numéricos", () => {
    expect(matchTiming({ firstHalfSeconds: -60, secondHalfSeconds: Number.NaN })).toEqual(matchTiming());
  });
});
