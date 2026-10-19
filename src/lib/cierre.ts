/**
 * Cierre de la ventana en un solo lugar: primero los bloqueadores (formularios sin guardar, autoguardado
 * pendiente), luego el respaldo de cierre con tope de tiempo, y al final se destruye la ventana.
 */

/** true = se puede cerrar. Un formulario sucio muestra su diálogo y resuelve según lo que elija el usuario. */
export type Bloqueador = () => Promise<boolean>;

const bloqueadores = new Set<Bloqueador>();

export function registrarBloqueador(b: Bloqueador): () => void {
  bloqueadores.add(b);
  return () => {
    bloqueadores.delete(b);
  };
}

export type DepsCierre = {
  respaldar: () => Promise<void>;
  destruir: () => Promise<void>;
  guardarError: (e: unknown) => Promise<void>;
  timeoutMs?: number;
  onRespaldando?: (v: boolean) => void;
};

/** Tope del respaldo de cierre: pasado este tiempo la app se cierra igual y avisa al abrir. */
export const TOPE_RESPALDO_MS = 20_000;

let enCurso: Promise<"cerrado" | "cancelado"> | null = null;

export function pedirCierre(deps: DepsCierre): Promise<"cerrado" | "cancelado"> {
  if (!enCurso) {
    enCurso = cerrar(deps).finally(() => {
      enCurso = null;
    });
  }
  return enCurso;
}

async function cerrar({ respaldar, destruir, guardarError, timeoutMs = TOPE_RESPALDO_MS, onRespaldando }: DepsCierre) {
  for (const b of [...bloqueadores]) {
    if (!(await b())) return "cancelado";
  }
  onRespaldando?.(true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const tope = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`el respaldo tardó más de ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
    });
    await Promise.race([respaldar(), tope]);
  } catch (e) {
    await guardarError(e).catch(() => {});
  } finally {
    clearTimeout(timer);
    onRespaldando?.(false);
  }
  await destruir();
  return "cerrado";
}
