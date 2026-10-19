import { invoke } from "@tauri-apps/api/core";
import type { SqlDriver } from "@/db/driver";
import { getAjuste, setAjuste } from "@/db/repos/ajustes";
import { nowIso } from "@/db/clock";
import type { ResultadoEspejo } from "@/domain/espejo";

export const AJUSTE_CARPETA = "espejo_carpeta";
export const AJUSTE_ULTIMO = "espejo_ultimo";
export const AJUSTE_ULTIMO_OK = "espejo_ultimo_ok";

export type EstadoEspejo = { carpeta: string | null; ultimo: ResultadoEspejo | null; ultimoOk: string | null };

export async function getEstadoEspejo(db: SqlDriver): Promise<EstadoEspejo> {
  const ultimo = await getAjuste(db, AJUSTE_ULTIMO);
  return {
    carpeta: await getAjuste(db, AJUSTE_CARPETA),
    ultimo: ultimo ? (JSON.parse(ultimo) as ResultadoEspejo) : null,
    ultimoOk: await getAjuste(db, AJUSTE_ULTIMO_OK),
  };
}

/**
 * Copia un respaldo automático a la carpeta espejo y guarda el resultado. Nunca lanza: si falla, el respaldo
 * local ya está hecho y el error queda para el aviso. null si no hay carpeta configurada.
 */
export async function copiarAlEspejo(db: SqlDriver, zipPath: string): Promise<ResultadoEspejo | null> {
  const dir = await getAjuste(db, AJUSTE_CARPETA);
  if (!dir) return null;
  const fecha = nowIso();
  let r: ResultadoEspejo;
  try {
    await invoke("mirror_backup", { zipPath, dir });
    r = { ok: true, fecha, mensaje: null };
  } catch (e) {
    r = { ok: false, fecha, mensaje: e instanceof Error ? e.message : String(e) };
  }
  try {
    await setAjuste(db, AJUSTE_ULTIMO, JSON.stringify(r));
    if (r.ok) await setAjuste(db, AJUSTE_ULTIMO_OK, fecha);
  } catch {
    // Sin poder guardar el resultado, el respaldo igual quedó: no se interrumpe nada.
  }
  return r;
}

/** "Copiar ahora": el respaldo automático más reciente de la carpeta de respaldos. null si no hay ninguno o no hay carpeta. */
export async function copiarUltimoAlEspejo(db: SqlDriver): Promise<ResultadoEspejo | null> {
  const autos = (await invoke<{ name: string; path: string }[]>("list_backups")).filter((b) => /^auto-.*\.zip$/.test(b.name));
  const ultimo = autos.sort((a, b) => b.name.localeCompare(a.name))[0];
  return ultimo ? copiarAlEspejo(db, ultimo.path) : null;
}
