import Decimal from "decimal.js";
import type { SqlDriver } from "../driver";
import { assertCampanaActiva } from "../repos/campanas";
import { getAsignacion, updateSaldoAsignacion } from "../repos/asignaciones";
import { listGerentes } from "../repos/gerentes";
import { createTasa, getTasaParaFecha } from "../repos/tasas";
import { claveComparacion, createDeposito, findDuplicados, type Duplicado } from "../repos/depositos";
import { resolverDestino } from "./destino";
import type { CuadroPagos, FilaCuadro } from "@/import/cuadroPagos";
import type { Destino, DestinoDraft } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import { toInputVE, toUsd } from "@/domain/money";
import { fechaDeTasa } from "@/domain/dates";

/** existente: ya hay tasa ese día y coincide · nueva: se registrará · distinta: se usará la ya registrada (o la de una fila anterior). */
export type EstadoTasa = "existente" | "nueva" | "distinta";

export type FilaPlan = FilaCuadro & {
  estadoTasa: EstadoTasa | null;
  tasaAplicada: string | null;
  usd: string | null;
  duplicados: Duplicado[];
  /** Fila anterior del mismo archivo con el mismo banco y referencia. */
  repetidaEnArchivo: number | null;
  importable: boolean;
  /** Sugerencia inicial: se desmarca lo que pide revisión. */
  marcada: boolean;
};

export type PlanImportacion = { cuadro: CuadroPagos; destino: DestinoDraft; filas: FilaPlan[] };

async function sugerirDestino(db: SqlDriver, campanaId: number, c: CuadroPagos): Promise<DestinoDraft> {
  const saldo = c.saldoInicial ? toInputVE(c.saldoInicial) : "";
  if (!c.gerenteNombre) return { sel: "", nombre: "", saldo };
  const clave = claveComparacion(c.gerenteNombre);
  const g = (await listGerentes(db)).find((x) => claveComparacion(x.nombre) === clave);
  if (!g) return { sel: "nuevo", nombre: c.gerenteNombre, saldo };
  const [a] = await db.select<{ id: number }>("SELECT id FROM asignaciones WHERE campana_id = ? AND gerente_id = ?", [campanaId, g.id]);
  return a ? { sel: `a:${a.id}`, nombre: "", saldo: "" } : { sel: `g:${g.id}`, nombre: "", saldo };
}

export async function planificarImportacion(db: SqlDriver, campanaId: number, cuadro: CuadroPagos): Promise<PlanImportacion> {
  const tasas = new Map<string, { valor: string; registrada: boolean }>();
  const vistas = new Map<string, number>();
  const filas: FilaPlan[] = [];

  for (const f of cuadro.filas) {
    let estadoTasa: EstadoTasa | null = null;
    let tasaAplicada: string | null = null;
    if (f.fecha) {
      // Clave = fecha donde vive la tasa (sábado y domingo comparten la del viernes).
      const t = await getTasaParaFecha(db, f.fecha);
      const clave = t?.fecha ?? fechaDeTasa(f.fecha);
      if (t && !tasas.has(clave)) tasas.set(clave, { valor: t.valor, registrada: true });
      const previa = tasas.get(clave);
      if (previa) {
        tasaAplicada = previa.valor;
        if (f.tasa && !new Decimal(f.tasa).eq(previa.valor)) estadoTasa = "distinta";
        else estadoTasa = previa.registrada ? "existente" : "nueva";
      } else if (f.tasa) {
        tasas.set(clave, { valor: f.tasa, registrada: false });
        tasaAplicada = f.tasa;
        estadoTasa = "nueva";
      }
    }

    let duplicados: Duplicado[] = [];
    let repetidaEnArchivo: number | null = null;
    if (f.banco && f.referencia) {
      duplicados = await findDuplicados(db, f.banco, f.referencia);
      const clave = `${claveComparacion(f.banco)}\u001f${claveComparacion(f.referencia)}`;
      repetidaEnArchivo = vistas.get(clave) ?? null;
      if (repetidaEnArchivo === null) vistas.set(clave, f.fila);
    }

    const importable = f.problemas.length === 0;
    filas.push({
      ...f,
      estadoTasa,
      tasaAplicada,
      usd: f.montoBs && tasaAplicada ? toUsd(f.montoBs, tasaAplicada) : null,
      duplicados,
      repetidaEnArchivo,
      importable,
      marcada: importable && estadoTasa !== "distinta" && duplicados.length === 0 && repetidaEnArchivo === null,
    });
  }

  return { cuadro, destino: await sugerirDestino(db, campanaId, cuadro), filas };
}

export type Importacion = {
  destino: Destino;
  /** Nuevo saldo a pagar para un gerente que ya estaba en la campaña, o null para no cambiarlo. */
  saldoUsd: string | null;
  filas: FilaCuadro[];
};

/**
 * Registra los depósitos elegidos. Crea la tasa del día si no existe (la de un sábado o domingo, en su viernes); si existe, se usa la registrada.
 * Si algo falla, borra lo creado y restaura el saldo (el plugin SQL no permite transacciones entre llamadas).
 */
export async function importarPagos(
  db: SqlDriver,
  campanaId: number,
  imp: Importacion,
): Promise<{ asignacionId: number; depositos: number; tasasCreadas: number }> {
  await assertCampanaActiva(db, campanaId);
  const malas = imp.filas.filter((f) => f.problemas.length > 0 || !f.fecha || !f.montoBs || !f.tasa);
  if (malas.length > 0) {
    throw new DomainError("VALIDACION", `No se pueden importar filas con problemas (fila ${malas.map((f) => f.fila).join(", ")})`);
  }

  const { asignacionId, deshacer } = await resolverDestino(db, campanaId, imp.destino);
  const depositos: number[] = [];
  const tasasCreadas: number[] = [];
  let saldoAnterior: string | null = null;
  try {
    if (imp.saldoUsd && imp.destino.kind === "asignacion") {
      saldoAnterior = (await getAsignacion(db, asignacionId))?.saldoUsd ?? null;
      await updateSaldoAsignacion(db, asignacionId, imp.saldoUsd);
    }
    for (const f of imp.filas) {
      const fecha = f.fecha as string;
      let tasaId = (await getTasaParaFecha(db, fecha))?.id;
      if (tasaId === undefined) {
        tasaId = await createTasa(db, { fecha: fechaDeTasa(fecha), valor: f.tasa as string, notas: "Importada de Excel", imagenPath: null });
        tasasCreadas.push(tasaId);
      }
      depositos.push(
        await createDeposito(db, asignacionId, {
          fecha,
          banco: f.banco,
          referencia: f.referencia,
          cuentaDestino: f.cuentaDestino,
          montoBs: f.montoBs as string,
          tasaId,
          observaciones: f.observaciones,
          imagenPath: null,
        }),
      );
    }
  } catch (e) {
    for (const id of depositos) await db.execute("DELETE FROM depositos WHERE id = ?", [id]);
    for (const id of tasasCreadas) await db.execute("DELETE FROM tasas WHERE id = ?", [id]);
    if (saldoAnterior !== null) await db.execute("UPDATE asignaciones SET saldo_usd = ? WHERE id = ?", [saldoAnterior, asignacionId]);
    await deshacer();
    throw e;
  }
  return { asignacionId, depositos: depositos.length, tasasCreadas: tasasCreadas.length };
}
