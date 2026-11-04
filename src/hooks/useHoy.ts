import { useEffect, useState } from "react";
import { todayIso } from "@/domain/dates";

/** Cada cuánto se revisa si cambió el día (además del foco): cubre la app abierta toda la noche sin tocarla. */
export const REVISAR_HOY_MS = 60_000;

/** Hoy, actualizado al cambiar el día aunque la ventana quede abierta y sin tocar (y al volver a ella). */
export function useHoy(): string {
  const [hoy, setHoy] = useState(todayIso);
  useEffect(() => {
    const revisar = () => setHoy(todayIso());
    // Un intervalo corto y no un temporizador a medianoche: el equipo puede suspenderse y el reloj cambiar.
    const id = setInterval(revisar, REVISAR_HOY_MS);
    window.addEventListener("focus", revisar);
    document.addEventListener("visibilitychange", revisar);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", revisar);
      document.removeEventListener("visibilitychange", revisar);
    };
  }, []);
  return hoy;
}
