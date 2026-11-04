// Vista previa en el navegador (`pnpm vista`): reemplaza `@/db` por una BD sql.js en memoria con datos de demostración.
// Nada se guarda: al recargar la página vuelve a empezar.
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { SqlDriver, SqlValue } from "@/db/driver";
import { migrate } from "@/db/migrations";
import { sembrar } from "./semilla";
import { setTutorialActivado } from "@/lib/tutorial";
import { KEY_NOVEDADES_VISTAS } from "@/lib/novedades";
import { setModo, setTema, TEMAS, type TemaId } from "@/lib/tema";

// `?capturas` (lo usa `pnpm capturas`): sin tutorial ni novedades que tapen la pantalla; `&modo=oscuro`, `&tema=rosa`.
const params = new URLSearchParams(location.search);
if (params.has("capturas")) {
  setTutorialActivado(false);
  localStorage.setItem(KEY_NOVEDADES_VISTAS, "vista-previa");
  setModo(params.get("modo") === "oscuro" ? "oscuro" : "claro");
  const tema = params.get("tema");
  setTema(TEMAS.some((t) => t.id === tema) ? (tema as TemaId) : "neutro");
}

let actual: Promise<SqlDriver> | null = null;

async function abrir(): Promise<SqlDriver> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  const driver: SqlDriver = {
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
  await migrate(driver);
  await sembrar(driver);
  return driver;
}

export function getDb(): Promise<SqlDriver> {
  actual ??= abrir();
  return actual;
}

export async function closeDb(): Promise<void> {}
