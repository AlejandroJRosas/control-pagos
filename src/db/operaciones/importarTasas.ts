import type { SqlDriver } from "../driver";
import { createTasa, deleteTasa, getTasa, updateTasa } from "../repos/tasas";
import { DomainError } from "@/domain/errors";
import type { CambioImportarTasa } from "@/domain/archivoTasas";

/** Lo que hizo la importación, para deshacerla con `deshacerImportarTasas`. */
export type TasasImportadas = {
  creadas: number[];
  actualizadas: { id: number; valor: string; notas: string | null; imagenPath: string | null; actualizadoEn: string }[];
};

/**
 * Importa las tasas de un archivo. `imagenes` = nombre de la captura en el archivo → ruta ya copiada a `imagenes\`
 * (una captura que no llegó deja la que tenía la tasa). Todo o nada: si una falla, se revierte lo hecho y se relanza.
 */
export async function importarTasas(db: SqlDriver, cambios: CambioImportarTasa[], imagenes: ReadonlyMap<string, string>): Promise<TasasImportadas> {
  if (cambios.length === 0) throw new DomainError("VALIDACION", "No hay tasas para importar");
  const hecho: TasasImportadas = { creadas: [], actualizadas: [] };
  const ruta = (imagen: string | null, siNo: string | null) => (imagen ? (imagenes.get(imagen) ?? siNo) : siNo);
  try {
    for (const c of cambios) {
      if (c.tipo === "nueva") {
        hecho.creadas.push(await createTasa(db, { fecha: c.fecha, valor: c.valor, notas: c.notas, imagenPath: ruta(c.imagen, null) }));
        continue;
      }
      const t = await getTasa(db, c.id);
      if (!t) throw new DomainError("NO_ENCONTRADO", `La tasa del ${c.fecha} ya no existe`);
      const [{ actualizadoEn }] = await db.select<{ actualizadoEn: string }>("SELECT actualizado_en AS actualizadoEn FROM tasas WHERE id = ?", [c.id]);
      await updateTasa(db, c.id, { valor: c.valor, notas: c.notas, imagenPath: ruta(c.imagen, c.imagenPath ?? t.imagenPath) });
      hecho.actualizadas.push({ id: c.id, valor: t.valor, notas: t.notas, imagenPath: t.imagenPath, actualizadoEn });
    }
  } catch (e) {
    await deshacerImportarTasas(db, hecho);
    throw e;
  }
  return hecho;
}

/** Deshace `importarTasas`: repone las actualizadas como estaban y borra las creadas (si nadie las usa ya). */
export async function deshacerImportarTasas(db: SqlDriver, h: TasasImportadas): Promise<void> {
  for (const a of [...h.actualizadas].reverse())
    await db.execute("UPDATE tasas SET valor = ?, notas = ?, imagen_path = ?, actualizado_en = ? WHERE id = ?", [a.valor, a.notas, a.imagenPath, a.actualizadoEn, a.id]);
  for (const id of [...h.creadas].reverse()) await deleteTasa(db, id);
}
