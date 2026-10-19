import type Database from "@tauri-apps/plugin-sql";
import type { SqlDriver, SqlValue } from "./driver";

/** ¿La sentencia modifica datos? (PRAGMA y VACUUM no cuentan.) */
export const esEscritura = (sql: string): boolean => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql);

let escrituras = 0;
/** Hubo escrituras desde que se abrió la BD o desde el último `reiniciarEscrituras` (decide el respaldo al cerrar). */
export const huboEscrituras = (): boolean => escrituras > 0;
export const reiniciarEscrituras = (): void => {
  escrituras = 0;
};

export function tauriDriver(db: Database): SqlDriver {
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const r = await db.execute(sql, params);
      if (esEscritura(sql)) escrituras++;
      return { lastInsertId: Number(r.lastInsertId ?? 0), rowsAffected: r.rowsAffected };
    },
    select<T>(sql: string, params: SqlValue[] = []) {
      return db.select<T[]>(sql, params);
    },
  };
}
