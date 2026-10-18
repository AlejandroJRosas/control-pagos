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

export async function closeDb(): Promise<void> {
  if (!current) return;
  const opened = current;
  current = null;
  try {
    await (await opened).raw.close();
  } catch {
    // ya estaba cerrada o nunca abrió
  }
}
