export type SqlValue = string | number | null;

/** Acceso mínimo a SQLite. Usar solo parámetros posicionales `?`. */
export interface SqlDriver {
  execute(sql: string, params?: SqlValue[]): Promise<{ lastInsertId: number; rowsAffected: number }>;
  select<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
}
