import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { closeDb, getDb } from "@/db";
import { respaldoAntesDe } from "./backup";

/**
 * Actualizaciones: la app consulta el `latest.json` del último release de GitHub (URL en tauri.conf.json).
 * Si hay una versión nueva queda aquí y `AvisoActualizacion` la ofrece; el instalador viene firmado y el
 * plugin rechaza cualquier archivo que no lleve la firma de la clave del proyecto.
 */
/** `update`: la versión nueva encontrada (queda aunque se posponga, para el botón de la barra lateral); `abierto`: el aviso. */
export type EstadoActualizacion = { update: Update | null; abierto: boolean };

let estado: EstadoActualizacion = { update: null, abierto: false };
const oyentes = new Set<() => void>();

function fijar(nuevo: EstadoActualizacion): void {
  if (estado.update && estado.update !== nuevo.update) void estado.update.close().catch(() => {});
  estado = nuevo;
  oyentes.forEach((l) => l());
}

export const estadoActualizacion = (): EstadoActualizacion => estado;

export function useActualizacion(): EstadoActualizacion {
  return useSyncExternalStore(
    (l) => {
      oyentes.add(l);
      return () => oyentes.delete(l);
    },
    estadoActualizacion,
  );
}

/** Devuelve la versión nueva (y abre el aviso) o `null` si ya está al día. Falla sin internet. */
export async function buscarActualizacion(): Promise<Update | null> {
  const u = await check();
  fijar({ update: u, abierto: u !== null });
  return u;
}

/**
 * Búsqueda sin interrumpir (con la app ya abierta): si hay versión nueva solo aparece el botón de la barra
 * lateral. No toca un aviso abierto (podría estar instalando) ni reemplaza la misma versión ya encontrada.
 * Devuelve la versión solo si es nueva para la app (para avisar una sola vez).
 */
export async function buscarEnSegundoPlano(): Promise<Update | null> {
  if (estado.abierto) return null;
  const u = await check();
  if (!u) return null;
  if (estado.abierto || estado.update?.version === u.version) {
    void u.close().catch(() => {});
    return null;
  }
  fijar({ update: u, abierto: false });
  return u;
}

/**
 * Repite `buscarEnSegundoPlano` cada `cadaMs` y llama a `onNueva` cuando aparece una versión; los errores
 * (sin internet) van a `onError`. Devuelve cómo detenerla.
 */
export function buscarPeriodicamente(
  cadaMs: number,
  onNueva: (u: Update) => void,
  onError: (e: unknown) => void = () => {},
): () => void {
  const id = setInterval(
    () =>
      buscarEnSegundoPlano()
        .then((u) => u && onNueva(u))
        .catch(onError),
    cadaMs,
  );
  return () => clearInterval(id);
}

/** "Más tarde": cierra el aviso; la versión sigue disponible desde el botón "Actualizar" de la barra lateral. */
export const posponerActualizacion = () => fijar({ ...estado, abierto: false });

export const abrirAvisoActualizacion = () => {
  if (estado.update) fijar({ ...estado, abierto: true });
};

/**
 * Descarga, respalda los datos (`antes-de-actualizar-*`), cierra la BD y lanza el instalador, que cierra la app
 * y la vuelve a abrir ya actualizada. `onProgreso` recibe 0–100, o `null` si el servidor no dice el tamaño.
 */
export async function instalarActualizacion(u: Update, onProgreso: (pct: number | null) => void): Promise<void> {
  let total = 0;
  let bajado = 0;
  await u.download((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? 0;
    else if (e.event === "Progress") {
      bajado += e.data.chunkLength;
      onProgreso(total ? Math.min(100, Math.round((bajado / total) * 100)) : null);
    }
  });
  await respaldoAntesDe(await getDb(), "actualizar");
  await closeDb();
  await u.install();
}
