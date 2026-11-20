import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_MATCHES,
  fromLocalInput,
  matchLabel,
  normalizeMatch,
  partitionMatches,
  readCachedMatches,
  toLocalInput,
  writeCachedMatches,
  type Match,
} from "@/lib/matches";

const make = (overrides: Partial<Match> = {}): Match => ({
  id: "m-1",
  rival: "Rival",
  kickoffAt: "2026-11-15T16:30:00+01:00",
  home: true,
  played: false,
  ...overrides,
});

describe("matchLabel", () => {
  it("respeta la etiqueta manual", () => {
    expect(matchLabel("2026-11-15T16:30:00+01:00", "15 NOV · 16:30")).toBe("15 NOV · 16:30");
  });

  it("genera la etiqueta desde el kickoff", () => {
    const iso = new Date(2026, 10, 15, 16, 30).toISOString();
    expect(matchLabel(iso)).toBe("15 NOV · 16:30");
  });

  it("devuelve vacío si la fecha no se entiende", () => {
    expect(matchLabel("no-es-fecha")).toBe("");
  });
});

describe("partitionMatches", () => {
  it("separa jugados y próximos y los ordena", () => {
    const early = make({ id: "a", kickoffAt: "2026-11-01T17:00:00+01:00", played: true, gf: 2, ga: 1 });
    const late = make({ id: "b", kickoffAt: "2026-11-06T19:00:00+01:00", played: true, gf: 1, ga: 0 });
    const soon = make({ id: "c", kickoffAt: "2026-11-15T16:30:00+01:00" });
    const later = make({ id: "d", kickoffAt: "2026-11-21T18:45:00+01:00" });

    const state = partitionMatches([soon, late, early, later], Date.parse("2026-11-13T12:00:00+01:00"));

    expect(state.past.map((match) => match.id)).toEqual(["b", "a"]);
    expect(state.next.map((match) => match.id)).toEqual(["c", "d"]);
  });

  it("da por jugado un partido 3 h después del kickoff", () => {
    const match = make({ kickoffAt: "2026-11-15T16:30:00+01:00", played: false });
    const state = partitionMatches([match], Date.parse("2026-11-15T20:00:00+01:00"));
    expect(state.past).toHaveLength(1);
    expect(state.next).toHaveLength(0);
  });

  it("mantiene el próximo partido hasta que pasa el margen", () => {
    const match = make({ kickoffAt: "2026-11-15T16:30:00+01:00", played: false });
    const state = partitionMatches([match], Date.parse("2026-11-15T18:00:00+01:00"));
    expect(state.next).toHaveLength(1);
  });
});

describe("normalizeMatch", () => {
  it("acepta el formato de la hoja (Sí/No y números como texto)", () => {
    const match = normalizeMatch({
      id: " mirandes ",
      rival: " Mirandés ",
      kickoffAt: "2026-11-15T16:30:00+01:00",
      date: "15 NOV · 16:30",
      home: "Sí",
      matchday: "12",
      played: "No",
      gf: "0",
      ga: null,
    });

    expect(match).not.toBeNull();
    expect(match?.id).toBe("mirandes");
    expect(match?.rival).toBe("Mirandés");
    expect(match?.home).toBe(true);
    expect(match?.played).toBe(false);
    expect(match?.matchday).toBe(12);
    expect(match?.gf).toBe(0);
    expect(match?.ga).toBeUndefined();
  });

  it("rechaza filas incompletas o con fecha inválida", () => {
    expect(normalizeMatch({ id: "x", rival: "Y", kickoffAt: "2026-13-45" })).toBeNull();
    expect(normalizeMatch({ id: "", rival: "Y", kickoffAt: "2026-11-15T16:30:00+01:00" })).toBeNull();
    expect(normalizeMatch(null)).toBeNull();
  });

  it("lee el descuento del árbitro de las columnas K y L", () => {
    const match = normalizeMatch({
      id: "mirandes",
      rival: "Mirandés",
      kickoffAt: "2026-11-15T16:30:00+01:00",
      addedFirst: "2",
      addedSecond: 5,
    });

    expect(match?.addedFirst).toBe(2);
    expect(match?.addedSecond).toBe(5);
  });

  it("no guarda descuentos vacíos, cero o negativos", () => {
    const match = normalizeMatch({
      id: "mirandes",
      rival: "Mirandés",
      kickoffAt: "2026-11-15T16:30:00+01:00",
      addedFirst: "",
      addedSecond: "-3",
    });

    expect(match?.addedFirst).toBeUndefined();
    expect(match?.addedSecond).toBeUndefined();
  });
});

describe("calendario de reserva", () => {
  it("tiene el Mirandés hoy a las 16:30", () => {
    const match = DEFAULT_MATCHES.find((item) => item.id === "mirandes-2026-11-15");

    expect(match?.kickoffAt).toBe("2026-11-15T16:30:00+01:00");
    expect(match?.date).toBe("15 NOV · 16:30");
  });
});

describe("caché local", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("guarda y recupera el calendario", () => {
    writeCachedMatches(DEFAULT_MATCHES);
    const cached = readCachedMatches();
    expect(cached).not.toBeNull();
    expect(cached?.map((match) => match.id)).toEqual(DEFAULT_MATCHES.map((match) => match.id));
  });

  it("conserva el descuento del árbitro al guardar y releer", () => {
    const edited = make({ id: "m-int", addedFirst: 2, addedSecond: 4 });
    writeCachedMatches([edited]);

    const cached = readCachedMatches();
    expect(cached?.[0]?.addedFirst).toBe(2);
    expect(cached?.[0]?.addedSecond).toBe(4);
  });

  it("ignora basura guardada", () => {
    window.localStorage.setItem("anxo-carro:matches-v6", "{no es json");
    expect(readCachedMatches()).toBeNull();
  });
});

describe("datetime-local", () => {
  it("hace ida y vuelta con la hora local", () => {
    const iso = new Date(2026, 10, 15, 16, 30).toISOString();
    const local = toLocalInput(iso);
    expect(local).toBe("2026-11-15T16:30");
    expect(fromLocalInput(local)).toBe(iso);
  });
});
