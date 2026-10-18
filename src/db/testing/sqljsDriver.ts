import initSqlJs from "sql.js";
import type { SqlDriver, SqlValue } from "../driver";
import { migrate } from "../migrations";

export async function createMemoryDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      db.run(sql, params);
      const rowsAffected = db.getRowsModified();
      const lastInsertId = Number(db.exec("SELECT last_insert_rowid()")[0].values[0][0]);
      return { lastInsertId, rowsAffected };
    },
    async select<T>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
  };
}

export async function createTestDb(): Promise<SqlDriver> {
  const db = await createMemoryDriver();
  await migrate(db);
  return db;
}
