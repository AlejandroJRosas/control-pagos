import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { CampoPropuesto } from "@/extraction/tipos";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { loadImageBlob } from "@/platform/images";

type Opciones<B, F extends string> = {
  imagenPath: string;
  formato: string | null;
  /** El borrador como está ahora en el formulario. */
  borrador: B;
  extraer: (imagen: Blob) => Promise<{ formato: string | null; fields: Partial<Record<F, CampoPropuesto>> }>;
  reemplazar: (b: B, fields: Partial<Record<F, CampoPropuesto>>) => { borrador: B; cambiados: F[] };
  /** Pone el borrador en el formulario (no se llama si ya se pasó a otro elemento). */
  aplicar: (b: B) => void;
  guardar: (b: B, formato: string | null) => Promise<void>;
};

/**
 * "Volver a leer" un elemento de la cola con el OCR (p. ej. tras una actualización que reconoce más formatos).
 * Lo leído reemplaza lo del formulario y el aviso trae "Deshacer", que deja el borrador y el formato como estaban.
 */
export function useReleer<B, F extends string>(o: Opciones<B, F>) {
  const [leyendo, setLeyendo] = useState(false);
  const opts = useRef(o);
  opts.current = o;
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  async function releer() {
    if (leyendo) return;
    setLeyendo(true);
    try {
      const r = await opts.current.extraer(await loadImageBlob(opts.current.imagenPath));
      if (!vivo.current) return;
      if (r.formato === null) {
        toast.warning("No se reconoció la imagen: los datos quedan como estaban");
        return;
      }
      // Sobre lo que hay ahora: lo escrito mientras se leía también vuelve con "Deshacer".
      const { borrador: previo, formato: formatoPrevio } = opts.current;
      const { borrador, cambiados } = opts.current.reemplazar(previo, r.fields);
      opts.current.aplicar(borrador);
      const guardar = opts.current.guardar;
      await guardar(borrador, r.formato);
      invalidate();
      if (cambiados.length === 0) {
        toast.success("Leído de nuevo: sin cambios");
        return;
      }
      toast.success(`Leído de nuevo: ${cambiados.length === 1 ? "cambió 1 campo" : `cambiaron ${cambiados.length} campos`}`, {
        action: {
          label: "Deshacer",
          onClick: () => {
            if (vivo.current) opts.current.aplicar(previo);
            guardar(previo, formatoPrevio)
              .then(() => invalidate())
              .catch((e) => reportError(e, "Deshacer"));
          },
        },
      });
    } catch (e) {
      if (vivo.current) reportError(e, "Lectura de la imagen");
    } finally {
      if (vivo.current) setLeyendo(false);
    }
  }

  return { leyendo, releer };
}
