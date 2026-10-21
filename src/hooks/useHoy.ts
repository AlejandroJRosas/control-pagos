import { useEffect, useState } from "react";
import { todayIso } from "@/domain/dates";

/** Hoy, actualizado al volver a la ventana (puede quedar abierta de un día a otro). */
export function useHoy(): string {
  const [hoy, setHoy] = useState(todayIso);
  useEffect(() => {
    const onFocus = () => setHoy(todayIso());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return hoy;
}
