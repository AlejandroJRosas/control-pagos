import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { closeDb, getDb } from "@/db";
import { respaldoAntesDe } from "./backup";

/**
 * Actualizaciones: la app consulta el `latest.json` del último release de GitHub (URL en tauri.conf.json).
 * Si hay una versión nueva queda aquí y `AvisoActualizacion` la ofrece; el instalador viene firmado y el
 * plugin rechaza cualquier archivo que no lleve la firma de la clave del proyecto.
 */
let disponible: Update | null = null;
const oyentes = new Set<() => void>();

function fijar(u: Update | null): void {
  if (disponible && disponible !== u) void disponible.close().catch(() => {});
  disponible = u;
  oyentes.forEach((l) => l());
}

export function useActualizacionDisponible(): Update | null {
  return useSyncExternalStore(
    (l) => {
      oyentes.add(l);
      return () => oyentes.delete(l);
    },
    () => disponible,
  );
}

/** Devuelve la versión nueva (y deja abierto el aviso) o `null` si ya está al día. Falla sin internet. */
export async function buscarActualizacion(): Promise<Update | null> {
  const u = await check();
  fijar(u);
  return u;
}

export const posponerActualizacion = () => fijar(null);

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
