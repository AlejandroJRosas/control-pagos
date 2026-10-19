import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { SqlDriver } from "@/db/driver";
import { closeDb } from "@/db";
import { todayIso } from "@/domain/dates";
import { imagenesUsadas } from "@/db/queries/imagenesUsadas";
import { precargarFeriados } from "@/db/repos/feriados";

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

export async function runAutoBackup(db: SqlDriver): Promise<void> {
  const dest = await invoke<string | null>("auto_backup_path", { today: todayIso() });
  if (!dest) return;
  await createBackup(db, dest);
  await invoke("prune_auto_backups");
}

/**
 * Al abrir la app: respaldo automático del día y, solo después (así lo borrado queda en un respaldo), poda de
 * los respaldos de seguridad viejos y de las imágenes que ya no usa ningún registro.
 */
export async function mantenimientoAlIniciar(db: SqlDriver): Promise<void> {
  await runAutoBackup(db);
  await precargarFeriados(db, todayIso());
  await invoke("prune_safety_backups");
  await invoke("clean_orphan_images", { usadas: await imagenesUsadas(db) });
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
