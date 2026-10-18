import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { SqlDriver } from "@/db/driver";
import { closeDb } from "@/db";
import { todayIso } from "@/domain/dates";

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

export async function runAutoBackup(db: SqlDriver): Promise<void> {
  const dest = await invoke<string | null>("auto_backup_path", { today: todayIso() });
  if (!dest) return;
  await createBackup(db, dest);
  await invoke("prune_auto_backups");
}

/** Cierra la BD y reemplaza los datos. Quien llama debe recargar la ventana. */
export async function restoreBackup(zipPath: string): Promise<void> {
  await closeDb();
  await invoke("restore_backup", { zipPath });
}
