import type { SqlDriver } from "../driver";
import { createTasa, deleteTasa, getTasa, updateTasa } from "../repos/tasas";
import { DomainError } from "@/domain/errors";
import type { CambioTasa } from "@/domain/tasasLote";

/** Lo que hizo la carga en lote, para deshacerla con `deshacerTasasLote`. */
export type TasasGuardadas = { creadas: number[]; corregidas: { id: number; valor: string; actualizadoEn: string }[] };

/**
 * Guarda las tasas de la carga en lote (sin captura): crea las nuevas y corrige el valor de las existentes (las notas y
 * la captura quedan). Todo o nada: si una falla, se revierte lo hecho y se relanza el error.
 */
export async function guardarTasasLote(db: SqlDriver, cambios: CambioTasa[]): Promise<TasasGuardadas> {
  if (cambios.length === 0) throw new DomainError("VALIDACION", "No hay tasas para guardar");
  const hecho: TasasGuardadas = { creadas: [], corregidas: [] };
  try {
    for (const c of cambios) {
      if (c.tipo === "nueva") {
        hecho.creadas.push(await createTasa(db, { fecha: c.fecha, valor: c.valor, notas: null, imagenPath: null }));
        continue;
      }
      const t = await getTasa(db, c.id);
      if (!t) throw new DomainError("NO_ENCONTRADO", "La tasa ya no existe");
      const [{ actualizadoEn }] = await db.select<{ actualizadoEn: string }>("SELECT actualizado_en AS actualizadoEn FROM tasas WHERE id = ?", [c.id]);
      await updateTasa(db, c.id, { valor: c.valor, notas: t.notas, imagenPath: t.imagenPath });
      hecho.corregidas.push({ id: c.id, valor: t.valor, actualizadoEn });
    }
  } catch (e) {
    await deshacerTasasLote(db, hecho);
    throw e;
  }
  return hecho;
}

/** Deshace `guardarTasasLote`: borra las creadas (si nadie las usa ya) y repone el valor de las corregidas. */
export async function deshacerTasasLote(db: SqlDriver, h: TasasGuardadas): Promise<void> {
  for (const c of [...h.corregidas].reverse())
    await db.execute("UPDATE tasas SET valor = ?, actualizado_en = ? WHERE id = ?", [c.valor, c.actualizadoEn, c.id]);
  for (const id of [...h.creadas].reverse()) await deleteTasa(db, id);
}
