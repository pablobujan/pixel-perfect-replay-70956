import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_LIMIT_SECONDS, sessionElapsed, useSessionTimer } from "@/hooks/use-session-timer";

afterEach(() => vi.useRealTimers());

describe("session timer", () => {
  it("starts at zero with no elapsed progress", () => {
    const { result } = renderHook(() => useSessionTimer());
    expect(result.current).toBe(0);
  });

  it("advances automatically without a ball interaction", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionTimer());
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe(60);
  });

  it("reaches full progress at 90 minutes and never exceeds it", () => {
    expect(SESSION_LIMIT_SECONDS).toBe(5400);
    expect(sessionElapsed(0, 5_400_000)).toBe(5400);
    expect(sessionElapsed(0, 5_500_000)).toBe(5400);
  });

  it("accounts for elapsed time when the browser suspends callbacks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { result } = renderHook(() => useSessionTimer());
    vi.setSystemTime(300_000);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(301);
  });
});