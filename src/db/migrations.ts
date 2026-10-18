import type { SqlDriver } from "./driver";

type Migration = { version: number; statements: string[] };

/** Cada sentencia va por separado: el driver de Tauri ejecuta una sentencia por llamada. */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS gerentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT,
        activo INTEGER NOT NULL DEFAULT 1,
        creado_en TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS campanas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT,
        estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cerrada')),
        notas TEXT,
        creado_en TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS asignaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campana_id INTEGER NOT NULL REFERENCES campanas(id) ON DELETE RESTRICT,
        gerente_id INTEGER NOT NULL REFERENCES gerentes(id) ON DELETE RESTRICT,
        saldo_usd TEXT NOT NULL,
        UNIQUE (campana_id, gerente_id)
      )`,
      `CREATE TABLE IF NOT EXISTS tasas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL UNIQUE,
        valor TEXT NOT NULL,
        imagen_path TEXT,
        notas TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS depositos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asignacion_id INTEGER NOT NULL REFERENCES asignaciones(id) ON DELETE RESTRICT,
        tasa_id INTEGER NOT NULL REFERENCES tasas(id) ON DELETE RESTRICT,
        fecha TEXT NOT NULL,
        banco TEXT NOT NULL,
        referencia TEXT NOT NULL,
        cuenta_destino TEXT NOT NULL,
        monto_bs TEXT NOT NULL,
        observaciones TEXT,
        imagen_path TEXT,
        creado_en TEXT NOT NULL,
        actualizado_en TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_depositos_asignacion ON depositos(asignacion_id)",
      "CREATE INDEX IF NOT EXISTS idx_depositos_tasa ON depositos(tasa_id)",
      "CREATE INDEX IF NOT EXISTS idx_depositos_referencia ON depositos(referencia)",
    ],
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function migrate(db: SqlDriver): Promise<void> {
  const [{ user_version: current }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    for (const sql of m.statements) await db.execute(sql);
    await db.execute(`PRAGMA user_version = ${m.version}`);
  }
}
