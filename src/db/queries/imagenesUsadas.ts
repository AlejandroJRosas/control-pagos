import type { SqlDriver } from "../driver";

/** Nombres de archivo (sin la carpeta `imagenes/`) que referencia algún depósito, tasa o elemento de las colas. */
export async function imagenesUsadas(db: SqlDriver): Promise<string[]> {
  const rows = await db.select<{ p: string }>(
    `SELECT imagen_path AS p FROM depositos WHERE imagen_path IS NOT NULL
     UNION SELECT imagen_path FROM tasas WHERE imagen_path IS NOT NULL
     UNION SELECT imagen_path FROM cola_depositos
     UNION SELECT imagen_path FROM cola_tasas`,
  );
  return [...new Set(rows.map((r) => r.p.split(/[\\/]/).pop() ?? r.p))];
}
