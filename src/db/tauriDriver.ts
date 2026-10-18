import type Database from "@tauri-apps/plugin-sql";
import type { SqlDriver, SqlValue } from "./driver";

export function tauriDriver(db: Database): SqlDriver {
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const r = await db.execute(sql, params);
      return { lastInsertId: Number(r.lastInsertId ?? 0), rowsAffected: r.rowsAffected };
    },
    select<T>(sql: string, params: SqlValue[] = []) {
      return db.select<T[]>(sql, params);
    },
  };
}
