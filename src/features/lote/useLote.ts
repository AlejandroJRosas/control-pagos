import { useEffect, useRef, useState } from "react";
import { reportError } from "@/lib/reportError";

export type EstadoLectura = "en-cola" | "leyendo" | "leido" | "no-reconocido" | "error";
export type FilaLote = { key: string; nombre: string; estado: EstadoLectura; formato: string | null };

type Opciones = {
  /** Guarda la imagen y crea su elemento en la cola; devuelve su id. */
  encolar: (file: File) => Promise<number>;
  /** Lee la imagen con el OCR y guarda lo leído en el elemento; devuelve el formato reconocido o null. */
  leer: (file: File, id: number) => Promise<string | null>;
};

/**
 * Sube un lote: cada imagen se encola de inmediato (en orden) y después se leen una por una, nunca dos a la vez,
 * porque el OCR de Windows es pesado. Al salir de la pantalla las lecturas pendientes se abandonan:
 * esos elementos quedan en la cola para llenarlos a mano.
 */
export function useLote(o: Opciones) {
  const [filas, setFilas] = useState<FilaLote[]>([]);
  const opts = useRef(o);
  opts.current = o;
  const vivo = useRef(true);
  const porLeer = useRef<{ key: string; file: File; id: number }[]>([]);
  const leyendo = useRef(false);
  // Encadena los encolados para respetar el orden aunque se suelten dos tandas seguidas.
  const encolados = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const actualizar = (key: string, cambios: Partial<FilaLote>) => {
    if (vivo.current) setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...cambios } : f)));
  };

  async function leerPendientes() {
    if (leyendo.current) return;
    leyendo.current = true;
    try {
      while (vivo.current && porLeer.current.length > 0) {
        const t = porLeer.current.shift()!;
        actualizar(t.key, { estado: "leyendo" });
        try {
          const formato = await opts.current.leer(t.file, t.id);
          actualizar(t.key, { estado: formato ? "leido" : "no-reconocido", formato });
        } catch (e) {
          actualizar(t.key, { estado: "error" });
          if (vivo.current) reportError(e, `Lectura de ${t.file.name}`);
        }
      }
    } finally {
      leyendo.current = false;
    }
  }

  function agregar(files: File[]) {
    const nuevas = files.map((file) => ({ key: crypto.randomUUID(), file }));
    setFilas((fs) => [...fs, ...nuevas.map(({ key, file }) => ({ key, nombre: file.name, estado: "en-cola" as const, formato: null }))]);
    encolados.current = encolados.current.then(async () => {
      for (const { key, file } of nuevas) {
        if (!vivo.current) return;
        try {
          const id = await opts.current.encolar(file);
          porLeer.current.push({ key, file, id });
          void leerPendientes();
        } catch (e) {
          actualizar(key, { estado: "error" });
          reportError(e, `No se pudo agregar ${file.name}`);
        }
      }
    });
  }

  return { filas, agregar };
}
