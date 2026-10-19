import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";

/** Ajustes de la app que viajan en los respaldos (plantillas, carpeta espejo…). Valores como texto. */
export async function getAjuste(db: SqlDriver, clave: string): Promise<string | null> {
  const [row] = await db.select<{ valor: string }>("SELECT valor FROM ajustes WHERE clave = ?", [clave]);
  return row?.valor ?? null;
}

export async function setAjuste(db: SqlDriver, clave: string, valor: string): Promise<void> {
  await db.execute(
    "INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en",
    [clave, valor, nowIso()],
  );
}

export async function deleteAjuste(db: SqlDriver, clave: string): Promise<void> {
  await db.execute("DELETE FROM ajustes WHERE clave = ?", [clave]);
}
