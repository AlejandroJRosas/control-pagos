import type { SqlDriver } from "./driver";

type Migration = { version: number; statements: string[] };

/** UUID v4 en SQL (por fila: `randomblob` se evalúa en cada una). */
const UUID_V4_SQL = `lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))`;

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
  {
    // Colas de revisión de la subida en lote: no cuentan en saldos hasta darles "Hecho".
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS cola_depositos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campana_id INTEGER NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
        imagen_path TEXT NOT NULL,
        nombre_archivo TEXT,
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecho')),
        borrador TEXT NOT NULL,
        formato TEXT,
        deposito_id INTEGER REFERENCES depositos(id) ON DELETE SET NULL,
        orden INTEGER NOT NULL,
        creado_en TEXT NOT NULL,
        actualizado_en TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_cola_depositos_campana ON cola_depositos(campana_id)",
      `CREATE TABLE IF NOT EXISTS cola_tasas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imagen_path TEXT NOT NULL,
        nombre_archivo TEXT,
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecho')),
        borrador TEXT NOT NULL,
        formato TEXT,
        tasa_id INTEGER REFERENCES tasas(id) ON DELETE SET NULL,
        orden INTEGER NOT NULL,
        creado_en TEXT NOT NULL,
        actualizado_en TEXT NOT NULL
      )`,
    ],
  },
  {
    // Ajustes que viajan en los respaldos, feriados (usan la tasa del día hábil anterior) y, para la fase 3,
    // un identificador único global y la fecha de la última modificación en cada registro.
    version: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS ajustes (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        actualizado_en TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS feriados (
        fecha TEXT PRIMARY KEY,
        nombre TEXT,
        creado_en TEXT NOT NULL
      )`,
      ...["gerentes", "campanas", "asignaciones", "tasas", "depositos"].flatMap((t) => [
        `ALTER TABLE ${t} ADD COLUMN uuid TEXT`,
        `UPDATE ${t} SET uuid = ${UUID_V4_SQL} WHERE uuid IS NULL`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_${t}_uuid ON ${t}(uuid)`,
      ]),
      ...["gerentes", "campanas", "asignaciones", "tasas"].map((t) => `ALTER TABLE ${t} ADD COLUMN actualizado_en TEXT`),
      "UPDATE gerentes SET actualizado_en = creado_en WHERE actualizado_en IS NULL",
      "UPDATE campanas SET actualizado_en = creado_en WHERE actualizado_en IS NULL",
      "UPDATE asignaciones SET actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE actualizado_en IS NULL",
      "UPDATE tasas SET actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE actualizado_en IS NULL",
    ],
  },
  {
    // Etiquetas (nombre y color) para categorizar y filtrar gerentes.
    version: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS etiquetas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
        color TEXT NOT NULL,
        creado_en TEXT NOT NULL,
        uuid TEXT NOT NULL UNIQUE,
        actualizado_en TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS gerente_etiquetas (
        gerente_id INTEGER NOT NULL REFERENCES gerentes(id) ON DELETE CASCADE,
        etiqueta_id INTEGER NOT NULL REFERENCES etiquetas(id) ON DELETE CASCADE,
        PRIMARY KEY (gerente_id, etiqueta_id)
      )`,
      "CREATE INDEX IF NOT EXISTS idx_gerente_etiquetas_etiqueta ON gerente_etiquetas(etiqueta_id)",
    ],
  },
  {
    // "Banco de Venezuela" pasa a llamarse "Venezuela": se unifican también sus variantes escritas a mano.
    version: 5,
    statements: [
      "UPDATE depositos SET banco = 'Venezuela', actualizado_en = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE banco <> 'Venezuela' AND lower(trim(banco)) IN ('banco de venezuela', 'banco venezuela', 'venezuela', 'bdv')",
      `UPDATE cola_depositos SET borrador = json_set(borrador, '$.draft.banco', 'Venezuela')
        WHERE json_valid(borrador) AND json_extract(borrador, '$.draft.banco') <> 'Venezuela'
          AND lower(trim(json_extract(borrador, '$.draft.banco'))) IN ('banco de venezuela', 'banco venezuela', 'venezuela', 'bdv')`,
    ],
  },
  {
    // Fecha de nacimiento de los gerentes (YYYY-MM-DD), para el aviso de cumpleaños.
    version: 6,
    statements: ["ALTER TABLE gerentes ADD COLUMN nacimiento TEXT"],
  },
  {
    // Consolidar campañas entre instalaciones: depósitos eliminados, emparejamientos con la otra app y último envío/recibo por gerente.
    version: 7,
    statements: [
      "CREATE TABLE IF NOT EXISTS eliminaciones (uuid TEXT PRIMARY KEY, tabla TEXT NOT NULL, campana_uuid TEXT NOT NULL, asignacion_uuid TEXT NOT NULL, eliminado_en TEXT NOT NULL)",
      "CREATE INDEX IF NOT EXISTS idx_eliminaciones_campana ON eliminaciones(campana_uuid)",
      "CREATE TABLE IF NOT EXISTS equivalencias (tabla TEXT NOT NULL, uuid_remoto TEXT NOT NULL, id_local INTEGER NOT NULL, PRIMARY KEY (tabla, uuid_remoto))",
      "CREATE TABLE IF NOT EXISTS consolidaciones (asignacion_id INTEGER NOT NULL REFERENCES asignaciones(id) ON DELETE CASCADE, sentido TEXT NOT NULL, en TEXT NOT NULL, PRIMARY KEY (asignacion_id, sentido))",
    ],
  },
  {
    // Árbol de gerentes por campaña: cada asignación puede tener como jefe a otra asignación de la misma campaña (solo organiza, no cambia montos).
    version: 8,
    statements: [
      "ALTER TABLE asignaciones ADD COLUMN jefe_id INTEGER REFERENCES asignaciones(id)",
      "CREATE INDEX IF NOT EXISTS idx_asignaciones_jefe ON asignaciones(jefe_id)",
    ],
  },
  {
    // Nombres de banco que el usuario enseñó (alias escrito → banco), para guardar siempre el nombre canónico.
    version: 9,
    statements: ["CREATE TABLE IF NOT EXISTS bancos_alias (alias TEXT PRIMARY KEY, banco TEXT NOT NULL)"],
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Migra hasta `hasta` (por defecto la última versión; las pruebas usan versiones intermedias). */
export async function migrate(db: SqlDriver, hasta = SCHEMA_VERSION): Promise<void> {
  const [{ user_version: current }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  for (const m of MIGRATIONS) {
    if (m.version <= current || m.version > hasta) continue;
    for (const sql of m.statements) {
      try {
        await db.execute(sql);
      } catch (e) {
        // Sin transacción entre llamadas, una migración puede quedar a medias: ADD COLUMN no tiene IF NOT EXISTS.
        if (/^\s*ALTER TABLE \S+ ADD COLUMN/i.test(sql) && /duplicate column/i.test(String(e))) continue;
        throw e;
      }
    }
    await db.execute(`PRAGMA user_version = ${m.version}`);
  }
}
