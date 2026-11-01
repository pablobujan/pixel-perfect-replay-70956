import { useEffect, useState } from "react";

export const SESSION_LIMIT_SECONDS = 90 * 60;

export function sessionElapsed(startedAt: number, now: number) {
  return Math.min(SESSION_LIMIT_SECONDS, Math.max(0, Math.floor((now - startedAt) / 1000)));
}

// Mounted in the shell so changing tabs does not restart the session.
export function useSessionTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const tick = () => setSeconds(sessionElapsed(startedAt, Date.now()));
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return seconds;
}