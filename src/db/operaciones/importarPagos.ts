import Decimal from "decimal.js";
import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva } from "../repos/campanas";
import { getAsignacion, updateSaldoAsignacion } from "../repos/asignaciones";
import { listGerentes } from "../repos/gerentes";
import { createTasa, getTasaParaFecha } from "../repos/tasas";
import { feriadosSet } from "../repos/feriados";
import { claveComparacion, createDeposito, findDuplicados, type Duplicado } from "../repos/depositos";
import { resolverDestino } from "./destino";
import { aplicarEdicion, camposFaltantes, type CampoEditable, type CuadroPagos, type EdicionFila, type FilaCuadro } from "@/import/cuadroPagos";
import type { Destino, DestinoDraft } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import { toInputVE, toUsd } from "@/domain/money";
import { fechaDeTasa, formatFecha } from "@/domain/dates";
import { claveDuplicado } from "@/domain/bancos";

/**
 * existente: ya hay tasa ese día y coincide · nueva: se registrará · distinta: se usará la ya registrada (o la de una fila anterior)
 * · registrada: el Excel no la trae y se usa la de la app.
 */
export type EstadoTasa = "existente" | "nueva" | "distinta" | "registrada";

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
  /** El usuario completó algo de la fila. */
  editada: boolean;
  /** Campos que el Excel no trae o trae mal, y se pueden completar (la tasa, solo si la app no la tiene). */
  editables: CampoEditable[];
};

const PROBLEMAS_TASA = ["Falta la tasa", "Tasa inválida"];

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

/** `ediciones`: lo que el usuario completó, por número de fila del Excel. */
export async function planificarImportacion(
  db: SqlDriver,
  campanaId: number,
  cuadro: CuadroPagos,
  ediciones: ReadonlyMap<number, EdicionFila> = new Map(),
): Promise<PlanImportacion> {
  const feriados = await feriadosSet(db);
  const tasas = new Map<string, { valor: string; registrada: boolean }>();
  const vistas = new Map<string, number>();
  const filas: FilaPlan[] = [];

  for (const original of cuadro.filas) {
    const edicion = ediciones.get(original.fila);
    const f = aplicarEdicion(original, edicion);
    let estadoTasa: EstadoTasa | null = null;
    let tasaAplicada: string | null = null;
    let tasaEnApp = false;
    if (f.fecha) {
      // Clave = fecha donde vive la tasa (sábado, domingo y feriados comparten la del día hábil anterior).
      const t = await getTasaParaFecha(db, f.fecha);
      const clave = t?.fecha ?? fechaDeTasa(f.fecha, feriados);
      if (t && !tasas.has(clave)) tasas.set(clave, { valor: t.valor, registrada: true });
      tasaEnApp = t !== null;
      const previa = tasas.get(clave);
      if (previa) {
        tasaAplicada = previa.valor;
        if (!f.tasa) estadoTasa = previa.registrada ? "registrada" : "nueva";
        else if (!new Decimal(f.tasa).eq(previa.valor)) estadoTasa = "distinta";
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
      const clave = claveDuplicado(f.banco, f.referencia);
      repetidaEnArchivo = vistas.get(clave) ?? null;
      if (repetidaEnArchivo === null) vistas.set(clave, f.fila);
    }

    const problemas = tasaAplicada ? f.problemas.filter((p) => !PROBLEMAS_TASA.includes(p)) : f.problemas;
    const importable = problemas.length === 0;
    filas.push({
      ...f,
      problemas,
      estadoTasa,
      tasaAplicada,
      usd: f.montoBs && tasaAplicada ? toUsd(f.montoBs, tasaAplicada) : null,
      duplicados,
      repetidaEnArchivo,
      importable,
      marcada: importable && estadoTasa !== "distinta" && duplicados.length === 0 && repetidaEnArchivo === null,
      editada: edicion !== undefined && Object.keys(edicion).length > 0,
      editables: camposFaltantes(original).filter((c) => c !== "tasa" || !tasaEnApp),
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
 * Registra los depósitos elegidos. Crea la tasa del día si no existe (la de un sábado o domingo, en su viernes); si existe, se usa la registrada
 * (una fila sin tasa solo se acepta si ya hay tasa registrada para su fecha).
 * Si algo falla, borra lo creado y restaura el saldo (el plugin SQL no permite transacciones entre llamadas).
 */
export async function importarPagos(
  db: SqlDriver,
  campanaId: number,
  imp: Importacion,
): Promise<{ asignacionId: number; depositos: number; tasasCreadas: number }> {
  await assertCampanaActiva(db, campanaId);
  const malas = imp.filas.filter((f) => f.problemas.length > 0 || !f.fecha || !f.montoBs);
  if (malas.length > 0) {
    throw new DomainError("VALIDACION", `No se pueden importar filas con problemas (fila ${malas.map((f) => f.fila).join(", ")})`);
  }
  for (const f of imp.filas) {
    if (!f.tasa && !(await getTasaParaFecha(db, f.fecha as string))) {
      throw new DomainError("VALIDACION", `Falta la tasa del ${formatFecha(f.fecha as string)} (fila ${f.fila})`);
    }
  }

  const { asignacionId, deshacer } = await resolverDestino(db, campanaId, imp.destino);
  const feriados = await feriadosSet(db);
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
        tasaId = await createTasa(db, { fecha: fechaDeTasa(fecha, feriados), valor: f.tasa as string, notas: "Importada de Excel", imagenPath: null });
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
    if (saldoAnterior !== null) await db.execute("UPDATE asignaciones SET saldo_usd = ?, actualizado_en = ? WHERE id = ?", [saldoAnterior, nowIso(), asignacionId]);
    await deshacer();
    throw e;
  }
  return { asignacionId, depositos: depositos.length, tasasCreadas: tasasCreadas.length };
}
