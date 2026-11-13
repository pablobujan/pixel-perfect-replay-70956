import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildFanSnapshot,
  describeDevice,
  flushFanSheetQueue,
  getFanSheetEndpoint,
  isFanSheetEnabled,
  makeSessionId,
  pendingFanSheetCount,
  sendFanSnapshot,
  type FanSnapshotInput,
} from "@/lib/fan-sheet";

const ENDPOINT = "https://script.google.com/macros/s/PRUEBA/exec";
const QUEUE_KEY = "anxo-carro:sheet-queue";
const ENDPOINT_KEY = "anxo-carro:sheet-url";

const input: FanSnapshotInput = {
  name: "  Ana López ",
  member: " 1042 ",
  phone: " 600111222 ",
  email: " ana@example.com ",
  match: "CD Lugo vs Mirandés",
  matchDate: "15 NOV · 16:30",
  kickoffAt: "2026-11-15T15:30:00.000Z",
  joinedAt: "2026-11-15T15:20:00.000Z",
  joinedMinute: 12.8,
  fanSeconds: 3600.7,
  awaySeconds: 125.2,
  awayCount: 2.6,
  sentAt: "2026-11-15T16:20:00.000Z",
  device: "Android · Chrome",
};

const setEndpointInUrl = (url: string) => {
  window.history.replaceState({}, "", `/?sheet=${encodeURIComponent(url)}`);
};

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  vi.unstubAllEnvs();
  // `.env.local` puede tener la URL real: los tests parten sin hoja configurada.
  vi.stubEnv("VITE_FAN_SHEET_URL", "");
  vi.unstubAllGlobals();
  // jsdom no trae sendBeacon y algún test lo redefine.
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: undefined });
});

describe("fan sheet payload", () => {
  it("trims the user data and normalises the numbers", () => {
    const snapshot = buildFanSnapshot(input, "sesion-1");

    expect(snapshot.sessionId).toBe("sesion-1");
    expect(snapshot.name).toBe("Ana López");
    expect(snapshot.member).toBe("1042");
    expect(snapshot.phone).toBe("600111222");
    expect(snapshot.email).toBe("ana@example.com");
    expect(snapshot.joinedMinute).toBe(12);
    expect(snapshot.fanSeconds).toBe(3600);
    expect(snapshot.awaySeconds).toBe(125);
    expect(snapshot.awayCount).toBe(2);
    expect(snapshot.status).toBe("active");
    expect(snapshot.consent).toBe(false);
    expect(snapshot.demo).toBe(false);
    expect(snapshot.device).toBe("Android · Chrome");
  });

  it("never sends negative seconds and keeps an explicit status", () => {
    const snapshot = buildFanSnapshot(
      { ...input, fanSeconds: -10, awaySeconds: -3, joinedMinute: -1, status: "finished" },
      "s",
    );

    expect(snapshot.fanSeconds).toBe(0);
    expect(snapshot.awaySeconds).toBe(0);
    expect(snapshot.joinedMinute).toBe(0);
    expect(snapshot.status).toBe("finished");
  });

  it("marks demo sessions so they never win the prize", () => {
    const snapshot = buildFanSnapshot({ ...input, demo: true }, "demo-1");
    expect(snapshot.demo).toBe(true);
  });

  it("generates a different session id each time", () => {
    const ids = new Set(Array.from({ length: 20 }, () => makeSessionId()));
    expect(ids.size).toBe(20);
    expect(makeSessionId()).not.toBe("");
  });

  it("describes the device without dumping the whole user agent", () => {
    const device = describeDevice();
    expect(device).toMatch(/ · /);
    expect(device.length).toBeLessThan(40);
  });
});

describe("fan sheet endpoint", () => {
  it("stays disabled without a configured URL", () => {
    expect(isFanSheetEnabled()).toBe(false);
    expect(getFanSheetEndpoint()).toBe("");
  });

  it("reads VITE_FAN_SHEET_URL from the environment", () => {
    vi.stubEnv("VITE_FAN_SHEET_URL", ENDPOINT);
    expect(getFanSheetEndpoint()).toBe(ENDPOINT);
    expect(isFanSheetEnabled()).toBe(true);
  });

  it("accepts ?sheet= and remembers it for the next load", () => {
    setEndpointInUrl(ENDPOINT);
    expect(getFanSheetEndpoint()).toBe(ENDPOINT);
    expect(window.localStorage.getItem(ENDPOINT_KEY)).toBe(ENDPOINT);

    window.history.replaceState({}, "", "/");
    expect(getFanSheetEndpoint()).toBe(ENDPOINT);
  });

  it("ignores values that are not http(s) URLs", () => {
    vi.stubEnv("VITE_FAN_SHEET_URL", "script.google.com/macros/s/x/exec");
    expect(getFanSheetEndpoint()).toBe("");

    window.history.replaceState({}, "", "/?sheet=javascript:alert(1)");
    expect(getFanSheetEndpoint()).toBe("");
  });
});

describe("fan sheet queue", () => {
  it("keeps the last state per session when there is no network", async () => {
    setEndpointInUrl(ENDPOINT);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));

    sendFanSnapshot(buildFanSnapshot({ ...input, fanSeconds: 100 }, "sesion-a"));
    sendFanSnapshot(buildFanSnapshot({ ...input, fanSeconds: 200 }, "sesion-a"));
    sendFanSnapshot(buildFanSnapshot({ ...input, fanSeconds: 50 }, "sesion-b"));

    await vi.waitFor(() => expect(pendingFanSheetCount()).toBe(2));

    const stored = JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? "[]") as {
      payload: { sessionId: string; fanSeconds: number };
    }[];
    const fromA = stored.find((item) => item.payload.sessionId === "sesion-a");
    expect(fromA?.payload.fanSeconds).toBe(200);
  });

  it("empties the queue once the network is back", async () => {
    setEndpointInUrl(ENDPOINT);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    sendFanSnapshot(buildFanSnapshot(input, "sesion-c"));
    await vi.waitFor(() => expect(pendingFanSheetCount()).toBe(1));

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))));
    flushFanSheetQueue();

    await vi.waitFor(() => expect(pendingFanSheetCount()).toBe(0));
  });

  it("keeps a backup of beacon sends until a confirmed send arrives", async () => {
    setEndpointInUrl(ENDPOINT);
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });

    sendFanSnapshot(buildFanSnapshot(input, "sesion-e"), { beacon: true });
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(pendingFanSheetCount()).toBe(1);

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null))));
    sendFanSnapshot(buildFanSnapshot({ ...input, fanSeconds: 999 }, "sesion-e"));

    await vi.waitFor(() => expect(pendingFanSheetCount()).toBe(0));
  });

  it("sends nothing when no endpoint is configured", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);

    sendFanSnapshot(buildFanSnapshot(input, "sesion-d"));

    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pendingFanSheetCount()).toBe(0);
  });
});
