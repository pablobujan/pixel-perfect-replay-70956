import { useEffect, useState } from "react";

/**
 * Devuelve la hora actual y se actualiza cada `intervalMs`.
 * Se monta una sola vez en el shell; cambiar de pestaña no lo reinicia y, si el
 * navegador suspende el timer, el siguiente tick recupera el tiempo real.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
