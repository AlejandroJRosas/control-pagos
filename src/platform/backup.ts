import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { SqlDriver } from "@/db/driver";
import { closeDb } from "@/db";
import { todayIso } from "@/domain/dates";
import { imagenesUsadas } from "@/db/queries/imagenesUsadas";
import { precargarFeriados } from "@/db/repos/feriados";
import { copiarAlEspejo } from "./espejo";
import { huboEscrituras, reiniciarEscrituras } from "@/db/tauriDriver";
import { getAjuste, setAjuste } from "@/db/repos/ajustes";

/** Error del último respaldo al cerrar (JSON `{ fecha, mensaje, respaldadoAlAbrir? }`); se avisa una vez al abrir. */
export const AJUSTE_ERROR_CIERRE = "cierre_error";

type ErrorCierre = { fecha?: string; mensaje: string; respaldadoAlAbrir?: boolean };

export function mensajeErrorDeCierre(valor: string): string {
  const e = JSON.parse(valor) as ErrorCierre;
  return e.respaldadoAlAbrir
    ? `El respaldo al cerrar la app la última vez no se completó (${e.mensaje}). Ya se volvió a respaldar al abrir.`
    : `El respaldo al cerrar la app la última vez no se completó (${e.mensaje}) y tampoco se pudo respaldar al abrir. Revisa Configuración → Respaldos.`;
}

export type DataPaths = { dbPath: string; imagesDir: string; backupsDir: string };
export type BackupInfo = { name: string; path: string; sizeBytes: number; modifiedMs: number };

export const getDataPaths = () => invoke<DataPaths>("data_paths");
export const listBackups = () => invoke<BackupInfo[]>("list_backups");

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Copia consistente de la BD abierta, dentro de la carpeta de respaldos. */
async function snapshot(db: SqlDriver): Promise<string> {
  const { backupsDir } = await getDataPaths();
  const path = await join(backupsDir, `snapshot-${crypto.randomUUID()}.db`);
  await db.execute(`VACUUM INTO ${sqlString(path)}`);
  return path;
}

export async function createBackup(db: SqlDriver, destPath: string): Promise<void> {
  const snapshotPath = await snapshot(db);
  await invoke("create_backup", { snapshotPath, destPath });
}

/** Respaldo de seguridad antes de una operación destructiva (`antes-de-<motivo>-<ms>.zip`); lo poda `mantenimientoAlIniciar`. */
export async function respaldoAntesDe(db: SqlDriver, motivo: string): Promise<string> {
  const { backupsDir } = await getDataPaths();
  const dest = await join(backupsDir, `antes-de-${motivo}-${Date.now()}.zip`);
  await createBackup(db, dest);
  return dest;
}

/**
 * Respaldo automático del día (`auto-<hoy>.zip`) y su copia a la carpeta espejo. Al abrir no se repite si ya
 * existe; con `reemplazar` (al cerrar) se rehace para que quede el estado más reciente del día.
 */
export async function runAutoBackup(db: SqlDriver, { reemplazar = false }: { reemplazar?: boolean } = {}): Promise<void> {
  const dest = reemplazar
    ? await invoke<string>("auto_backup_path_hoy", { today: todayIso() })
    : await invoke<string | null>("auto_backup_path", { today: todayIso() });
  if (!dest) return;
  // Lo escrito hasta aquí entra en este respaldo; lo que llegue mientras se hace queda pendiente para el de cierre.
  reiniciarEscrituras();
  await createBackup(db, dest);
  await invoke("prune_auto_backups");
  await copiarAlEspejo(db, dest);
}

/**
 * Al abrir la app: respaldo automático del día y, solo después (así lo borrado queda en un respaldo), poda de
 * los respaldos de seguridad viejos y de las imágenes que ya no usa ningún registro.
 */
export async function mantenimientoAlIniciar(db: SqlDriver): Promise<void> {
  // Si el respaldo al cerrar falló, el del día no tiene lo de esa sesión: se rehace ahora.
  const errorCierre = await getAjuste(db, AJUSTE_ERROR_CIERRE);
  await runAutoBackup(db, { reemplazar: errorCierre !== null });
  if (errorCierre) await setAjuste(db, AJUSTE_ERROR_CIERRE, JSON.stringify({ ...(JSON.parse(errorCierre) as ErrorCierre), respaldadoAlAbrir: true }));
  await precargarFeriados(db, todayIso());
  await invoke("prune_safety_backups");
  await invoke("clean_orphan_images", { usadas: await imagenesUsadas(db) });
}

type Arranque = { integridadOk: boolean; mantenimiento?: Promise<unknown> };
let arranque: Arranque = { integridadOk: false };

/** Termina cuando acaba el mantenimiento de apertura (o enseguida si no hay). */
export const esperarArranque = (): Promise<unknown> => (arranque.mantenimiento ?? Promise.resolve()).catch(() => {});

/** Lo fija `main.tsx` al abrir: si la BD pasó la verificación y la promesa del mantenimiento de apertura. */
export function marcarArranque(a: Arranque): void {
  arranque = a;
}

/**
 * Respaldo al cerrar: reemplaza el del día si hubo escrituras. Nunca con una BD que no pasó la verificación (pisaría
 * un respaldo bueno y la copia de Drive) y siempre después del respaldo de apertura (los dos escribirían el mismo zip).
 */
export async function respaldoDeCierre(db: SqlDriver): Promise<void> {
  await arranque.mantenimiento?.catch(() => {});
  if (!arranque.integridadOk || !huboEscrituras()) return;
  await runAutoBackup(db, { reemplazar: true });
}

/** Cierra la BD y reemplaza los datos. Quien llama debe recargar la ventana. */
export async function restoreBackup(zipPath: string): Promise<void> {
  try {
    await closeDb({ strict: true });
  } catch (e) {
    throw new Error(`No se pudo cerrar la base de datos; no se restauró nada (${e instanceof Error ? e.message : String(e)})`);
  }
  await invoke("restore_backup", { zipPath });
}
