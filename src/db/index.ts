import Database from "@tauri-apps/plugin-sql";
import type { SqlDriver } from "./driver";
import { tauriDriver } from "./tauriDriver";
import { migrate } from "./migrations";

const DB_URL = "sqlite:control-pagos.db";
type Opened = { raw: Database; driver: SqlDriver };
let current: Promise<Opened> | null = null;

async function open(): Promise<Opened> {
  const raw = await Database.load(DB_URL);
  const driver = tauriDriver(raw);
  await driver.execute("PRAGMA foreign_keys = ON");
  await migrate(driver);
  return { raw, driver };
}

export async function getDb(): Promise<SqlDriver> {
  if (!current) {
    const opening = open();
    current = opening;
    opening.catch(() => {
      if (current === opening) current = null;
    });
  }
  return (await current).driver;
}

/** Con `strict`, un fallo al cerrar se propaga (la restauración no debe reemplazar una BD abierta). */
export async function closeDb(opts: { strict?: boolean } = {}): Promise<void> {
  if (!current) return;
  const opened = current;
  current = null;
  let raw: Database;
  try {
    raw = (await opened).raw;
  } catch {
    return; // nunca llegó a abrir
  }
  try {
    await raw.close();
  } catch (e) {
    if (opts.strict) throw e;
  }
}
