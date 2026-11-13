import { describe, expect, it } from "vitest";

import {
  FIRST_HALF_DURATION,
  HT_END,
  HT_START,
  TOTAL_MATCH_DURATION,
  awayProgressRanges,
  effectiveDisconnectionSeconds,
  disconnectionSeconds,
  isHalfTime,
  matchElapsedSeconds,
  matchProgressPct,
  restoreAwayRanges,
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

  it("closes an open away range when the page was left on purpose", () => {
    const restored = restoreAwayRanges(
      [
        { start: at(600), end: at(900) },
        { start: at(1200), end: null },
      ],
      at(1800),
      { leftPage: true, aliveMs: 0, shortAwayMs: 20_000 },
    );

    expect(restored).toEqual([
      { start: at(600), end: at(900) },
      { start: at(1200), end: at(1800) },
    ]);
  });

  it("drops an open range if the page froze right after leaving (screen off)", () => {
    const restored = restoreAwayRanges([{ start: at(1200), end: null }], at(3600), {
      leftPage: false,
      aliveMs: 4_000,
      shortAwayMs: 20_000,
    });

    expect(restored).toEqual([]);
  });

  it("counts the gap when the page kept running while away (screen on)", () => {
    const restored = restoreAwayRanges([{ start: at(1200), end: null }], at(3600), {
      leftPage: false,
      aliveMs: 60_000,
      shortAwayMs: 20_000,
    });

    expect(restored).toEqual([{ start: at(1200), end: at(3600) }]);
  });

  it("forgives very short open gaps and pagehide wins over a frozen heartbeat", () => {
    expect(
      restoreAwayRanges([{ start: at(1200), end: null }], at(1210), {
        leftPage: true,
        aliveMs: 0,
        shortAwayMs: 20_000,
      }),
    ).toEqual([]);

    expect(
      restoreAwayRanges([{ start: at(600), end: null }], at(1200), {
        leftPage: true,
        aliveMs: 0,
        shortAwayMs: 20_000,
      }),
    ).toEqual([{ start: at(600), end: at(1200) }]);
  });
});
