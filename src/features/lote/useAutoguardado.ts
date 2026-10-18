import { useEffect, useRef } from "react";
import { reportError } from "@/lib/reportError";

/**
 * Guarda `valor` (serializado, para comparar por contenido) unos `ms` después del último cambio y al desmontar,
 * solo si cambió respecto de lo último guardado. `cancelar` descarta lo pendiente (antes de "Hecho" o "Descartar");
 * `guardar` lo guarda ya.
 */
export function useAutoguardado(valor: string, guardar: (v: string) => Promise<void>, ms = 500) {
  const ultimo = useRef(valor);
  const actual = useRef(valor);
  actual.current = valor;
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelado = useRef(false);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = actual.current;
    if (cancelado.current || v === ultimo.current) return Promise.resolve();
    ultimo.current = v;
    return guardarRef.current(v).catch((e) => reportError(e, "No se pudo guardar el borrador"));
  };

  useEffect(() => {
    if (valor === ultimo.current) return;
    cancelado.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, ms]);

  useEffect(
    () => () => {
      void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return {
    cancelar: () => {
      cancelado.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    },
    guardar: () => {
      cancelado.current = false;
      return flush();
    },
  };
}
