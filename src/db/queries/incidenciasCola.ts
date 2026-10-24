import type { SqlDriver } from "../driver";
import type { ItemColaDeposito } from "../repos/cola";
import { bancosConocidos } from "../repos/bancosAlias";
import { feriadosSet } from "../repos/feriados";
import { bancoCanonico, claveDuplicado, clavePosibleRepetido } from "@/domain/bancos";
import { duplicadosEnCola } from "@/domain/cola";
import { fechaDeTasa } from "@/domain/dates";
import { parseMonto } from "@/domain/money";
import type { ContextoIncidencia } from "@/features/lote/incidencias";

/**
 * Lo que cada pendiente de la cola tiene en común con lo registrado y con el resto de la cola, con una sola lectura de
 * depósitos, tasas y feriados. Los hechos no aparecen.
 */
export async function contextoIncidencias(db: SqlDriver, items: ItemColaDeposito[]): Promise<Map<number, ContextoIncidencia>> {
  const pendientes = items.filter((i) => i.estado === "pendiente");
  const resultado = new Map<number, ContextoIncidencia>();
  if (pendientes.length === 0) return resultado;

  const registrados = await db.select<{ fecha: string; banco: string; referencia: string; montoBs: string }>(
    "SELECT fecha, banco, referencia, monto_bs AS montoBs FROM depositos",
  );
  const fechasConTasa = new Set((await db.select<{ fecha: string }>("SELECT fecha FROM tasas")).map((t) => t.fecha));
  const feriados = await feriadosSet(db);
  const conocidos = await bancosConocidos(db);

  const clavesDuplicado = new Set(registrados.map((r) => claveDuplicado(r.banco, r.referencia)).filter(Boolean));
  const clavesRepetido = new Set(registrados.map((r) => clavePosibleRepetido(r.banco, r.referencia, r.fecha, r.montoBs)).filter(Boolean));

  const filas = pendientes.map((i) => {
    const { banco, referencia, fecha, montoBs } = i.borrador.draft;
    const canonico = bancoCanonico(banco, conocidos) ?? banco.trim();
    return { id: i.id, estado: i.estado, banco: canonico, referencia: referencia.trim(), fecha, montoBs: parseMonto(montoBs) ?? "" };
  });
  const repetidoDe = (f: (typeof filas)[number]) => clavePosibleRepetido(f.banco, f.referencia, f.fecha, f.montoBs);
  const enCola = new Map<string, number>();
  for (const f of filas) enCola.set(repetidoDe(f), (enCola.get(repetidoDe(f)) ?? 0) + 1);

  for (const f of filas) {
    const dup = claveDuplicado(f.banco, f.referencia);
    const rep = repetidoDe(f);
    resultado.set(f.id, {
      duplicado: (dup !== "" && clavesDuplicado.has(dup)) || duplicadosEnCola(filas, f.id).length > 0,
      posibleRepetido: rep !== "" && (clavesRepetido.has(rep) || (enCola.get(rep) ?? 0) > 1),
      faltaTasa: f.fecha !== "" && !fechasConTasa.has(fechaDeTasa(f.fecha, feriados)),
    });
  }
  return resultado;
}
