import type { SqlDriver } from "../driver";
import { assertCampanaActiva } from "../repos/campanas";
import { updateSaldoAsignacion } from "../repos/asignaciones";
import { createTasa, deleteTasa, getTasaParaFecha, listTasas, updateTasa } from "../repos/tasas";
import { feriadosSet } from "../repos/feriados";
import { createDeposito, deleteDepositos, getDeposito, restaurarDepositos, updateDeposito, type DepositoGuardar } from "../repos/depositos";
import {
  deleteEquivalencia, getEquivalencias, getIntercambios, marcarIntercambio, setEquivalencia, uuidsEliminados, type TablaEquivalencia,
} from "../repos/consolidacion";
import {
  emparejarCampana, emparejarGerentes, gerentesRepetidos, motivoRepetidos, type AsignacionLocal, type Decisiones, type DepositoLocal, type EstadoEmparejamiento,
  type GerenteEmparejado, type LocalConsolidar, type PlanConsolidacion,
} from "@/domain/consolidar";
import type { DepositoPaquete, Paquete } from "@/domain/paquete";
import { DomainError } from "@/domain/errors";
import { formatFecha } from "@/domain/dates";

/** Lo que `clasificar` necesita de esta instalación para la campaña destino (los depósitos, de todas las campañas). */
export async function cargarLocal(db: SqlDriver, campanaId: number): Promise<LocalConsolidar> {
  const [campana] = await db.select<LocalConsolidar["campana"]>("SELECT id, uuid, nombre, estado FROM campanas WHERE id = ?", [campanaId]);
  if (!campana) throw new DomainError("NO_ENCONTRADO", "La campaña no existe");
  const intercambios = await getIntercambios(db, campanaId);
  const asignaciones = await db.select<Omit<AsignacionLocal, "ultimoEnvio" | "ultimoRecibo">>(
    `SELECT a.id, a.uuid, a.gerente_id AS gerenteId, g.nombre AS gerenteNombre, a.saldo_usd AS saldoUsd
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id WHERE a.campana_id = ? ORDER BY g.nombre, a.id`,
    [campanaId],
  );
  const depositos = await db.select<DepositoLocal>(
    `SELECT d.id, d.uuid, d.asignacion_id AS asignacionId, a.campana_id AS campanaId, c.nombre AS campanaNombre, d.fecha, d.banco, d.referencia,
            d.cuenta_destino AS cuentaDestino, d.monto_bs AS montoBs, d.observaciones, d.imagen_path AS imagenPath, d.actualizado_en AS actualizadoEn
     FROM depositos d JOIN asignaciones a ON a.id = d.asignacion_id JOIN campanas c ON c.id = a.campana_id
     ORDER BY d.fecha, d.creado_en, d.id`,
  );
  return {
    campana,
    asignaciones: asignaciones.map((a) => ({ ...a, ultimoEnvio: intercambios.get(a.id)?.envio ?? null, ultimoRecibo: intercambios.get(a.id)?.recibo ?? null })),
    depositos,
    tasas: new Map((await listTasas(db)).map((t) => [t.fecha, { id: t.id, valor: t.valor, usos: t.usos }])),
    feriados: await feriadosSet(db),
    eliminados: await uuidsEliminados(db),
    equivalenciasDepositos: await getEquivalencias(db, "depositos"),
  };
}

/** Emparejamiento de los gerentes del paquete con las asignaciones de una campaña local (los recordados primero). */
export async function emparejarGerentesDe(db: SqlDriver, p: Paquete, campanaId: number): Promise<Record<string, GerenteEmparejado>> {
  const locales = (await cargarLocal(db, campanaId)).asignaciones;
  return emparejarGerentes(p.asignaciones, locales, await getEquivalencias(db, "gerentes"));
}

/**
 * Campaña y gerentes locales del paquete. La campaña sugerida (la de la ruta) se usa solo si no hay una recordada ni una única
 * del mismo nombre. Sin campaña, los gerentes quedan sin emparejar.
 */
export async function emparejamientoInicial(
  db: SqlDriver,
  p: Paquete,
  campanaSugerida: number | null,
): Promise<{ campanaId: number | null; estadoCampana: EstadoEmparejamiento; gerentes: Record<string, GerenteEmparejado> }> {
  const locales = await db.select<{ id: number; uuid: string; nombre: string }>("SELECT id, uuid, nombre FROM campanas ORDER BY id");
  const recordada = (await getEquivalencias(db, "campanas")).get(p.campana.uuid) ?? locales.find((c) => c.uuid === p.campana.uuid)?.id;
  let { campanaId, estado } = emparejarCampana(p.campana, locales, recordada);
  if (campanaId === null && campanaSugerida !== null && locales.some((c) => c.id === campanaSugerida)) {
    campanaId = campanaSugerida;
    estado = "elegido";
  }
  return { campanaId, estadoCampana: estado, gerentes: campanaId === null ? {} : await emparejarGerentesDe(db, p, campanaId) };
}

export type Resultado = { nuevos: number; corregidos: number; eliminados: number; vinculados: number; tasasCreadas: number; tasasCambiadas: number; saldosCambiados: number };

type FilaDeposito = NonNullable<Awaited<ReturnType<typeof getDeposito>>>;

/** `ahora`, o 1 ms después de `remoto` si este es posterior (reloj de aquí atrasado). */
function masNuevaQue(remoto: string, ahora: string): string {
  const despues = Date.parse(remoto) + 1;
  return Number.isNaN(despues) || despues <= Date.parse(ahora) ? ahora : new Date(despues).toISOString();
}

/**
 * Aplica el plan según las decisiones: todo o nada. El plugin SQL no da transacciones entre llamadas, así que cada paso apila cómo
 * deshacerse y, ante un error, se deshace al revés y se relanza.
 */
export async function aplicarConsolidacion(
  db: SqlDriver,
  p: Paquete,
  plan: PlanConsolidacion,
  gerentes: Record<string, GerenteEmparejado>,
  d: Decisiones,
  deps: { importarImagen: (nombre: string) => Promise<string | null>; ahora: string },
): Promise<Resultado> {
  const campanaId = plan.campana.id;
  await assertCampanaActiva(db, campanaId);
  if (Object.values(gerentes).some((g) => g.asignacionId === undefined)) {
    throw new DomainError("VALIDACION", "Indica quién es cada gerente del archivo en tu campaña");
  }
  const repetidos = gerentesRepetidos(gerentes);
  if (repetidos) throw new DomainError("VALIDACION", motivoRepetidos(repetidos, Object.fromEntries(p.asignaciones.map((a) => [a.uuid, a.gerente.nombre]))));
  const sinElegir = plan.tasasDistintas.find((t) => d.tasas[t.fecha] === undefined);
  if (sinElegir) throw new DomainError("VALIDACION", `Elige la tasa del ${formatFecha(sinElegir.fecha)}`);

  const asignaciones = await db.select<{ id: number; gerenteId: number; gerenteUuid: string }>(
    "SELECT a.id, a.gerente_id AS gerenteId, g.uuid AS gerenteUuid FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id WHERE a.campana_id = ?",
    [campanaId],
  );
  const asignacionPorId = new Map(asignaciones.map((a) => [a.id, a]));
  const emparejadas = p.asignaciones.flatMap((a) => {
    const id = gerentes[a.uuid]?.asignacionId;
    return typeof id === "number" ? [{ remota: a, id }] : [];
  });
  const fuera = emparejadas.find((e) => !asignacionPorId.has(e.id));
  if (fuera) throw new DomainError("VALIDACION", `${fuera.remota.gerente.nombre} está emparejado con un gerente que no es de esta campaña`);

  const r: Resultado = { nuevos: 0, corregidos: 0, eliminados: 0, vinculados: 0, tasasCreadas: 0, tasasCambiadas: 0, saldosCambiados: 0 };
  const deshacer: (() => Promise<void>)[] = [];

  /** Restaura la fila previa de un depósito tal cual (con su actualizado_en). */
  const reponerDeposito = (a: FilaDeposito) => async () => {
    await db.execute(
      `UPDATE depositos SET asignacion_id = ?, tasa_id = ?, fecha = ?, banco = ?, referencia = ?, cuenta_destino = ?, monto_bs = ?,
         observaciones = ?, imagen_path = ?, creado_en = ?, actualizado_en = ?, uuid = ? WHERE id = ?`,
      [a.asignacionId, a.tasaId, a.fecha, a.banco, a.referencia, a.cuentaDestino, a.montoBs, a.observaciones, a.imagenPath, a.creadoEn, a.actualizadoEn, a.uuid, a.id],
    );
  };
  const filaDeposito = async (id: number): Promise<FilaDeposito> => {
    const f = await getDeposito(db, id);
    if (!f) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
    return f;
  };
  const tasaIdPara = async (fecha: string): Promise<number> => {
    const t = await getTasaParaFecha(db, fecha);
    if (!t) throw new DomainError("VALIDACION", `Falta la tasa del ${formatFecha(fecha)}`);
    return t.id;
  };
  const camposDe = (x: DepositoPaquete, tasaId: number, imagenPath: string | null): DepositoGuardar => ({
    fecha: x.fecha, banco: x.banco, referencia: x.referencia, cuentaDestino: x.cuentaDestino, montoBs: x.montoBs, tasaId, observaciones: x.observaciones, imagenPath,
  });
  const equivaler = async (tabla: TablaEquivalencia, uuidRemoto: string, idLocal: number) => {
    const [previa] = await db.select<{ id: number }>("SELECT id_local AS id FROM equivalencias WHERE tabla = ? AND uuid_remoto = ?", [tabla, uuidRemoto]);
    if (previa?.id === idLocal) return;
    await setEquivalencia(db, tabla, uuidRemoto, idLocal);
    deshacer.push(() => (previa ? setEquivalencia(db, tabla, uuidRemoto, previa.id) : deleteEquivalencia(db, tabla, uuidRemoto)));
  };

  try {
    // Tasas nuevas.
    for (const t of plan.tasasNuevas) {
      const id = await createTasa(db, { fecha: t.fecha, valor: t.valor, notas: `Recibida de ${p.origen}`, imagenPath: null });
      deshacer.push(() => deleteTasa(db, id));
      r.tasasCreadas++;
    }

    // Tasas distintas: la del archivo, si se eligió.
    for (const t of plan.tasasDistintas) {
      if (d.tasas[t.fecha] !== "archivo") continue;
      const [previa] = await db.select<{ id: number; valor: string; notas: string | null; imagenPath: string | null; actualizadoEn: string }>(
        "SELECT id, valor, notas, imagen_path AS imagenPath, actualizado_en AS actualizadoEn FROM tasas WHERE fecha = ?",
        [t.fecha],
      );
      if (!previa) throw new DomainError("NO_ENCONTRADO", `La tasa del ${formatFecha(t.fecha)} ya no existe`);
      await updateTasa(db, previa.id, { valor: t.archivo, notas: previa.notas, imagenPath: previa.imagenPath });
      deshacer.push(async () => {
        await db.execute("UPDATE tasas SET valor = ?, actualizado_en = ? WHERE id = ?", [previa.valor, previa.actualizadoEn, previa.id]);
      });
      r.tasasCambiadas++;
    }

    // Montos asignados: el del archivo, si se eligió.
    for (const s of plan.saldos) {
      if (d.saldos[s.asignacionId] !== "archivo") continue;
      const [previo] = await db.select<{ saldoUsd: string; actualizadoEn: string }>(
        "SELECT saldo_usd AS saldoUsd, actualizado_en AS actualizadoEn FROM asignaciones WHERE id = ?",
        [s.asignacionId],
      );
      await updateSaldoAsignacion(db, s.asignacionId, s.archivo);
      deshacer.push(async () => {
        await db.execute("UPDATE asignaciones SET saldo_usd = ?, actualizado_en = ? WHERE id = ?", [previo.saldoUsd, previo.actualizadoEn, s.asignacionId]);
      });
      r.saldosCambiados++;
    }

    // Eliminaciones marcadas (`deleteDepositos` las registra para que no vuelvan si esta app reenvía).
    const aEliminar = [...new Set(plan.eliminaciones.filter((e) => d.eliminar.has(e.remotoUuid)).map((e) => e.local.id))];
    if (aEliminar.length > 0) {
      const eliminados = await deleteDepositos(db, aEliminar);
      deshacer.push(() => restaurarDepositos(db, eliminados));
      r.eliminados = eliminados.depositos.length;
    }
    const eliminado = new Set(aEliminar);

    // Correcciones y conflictos: el archivo conserva su actualizado_en; quedarse con la mía la marca como editada ahora, y siempre más nueva
    // que la del archivo (aunque el reloj de aquí vaya atrasado) para que gane en la otra app.
    for (const c of [...plan.correcciones, ...plan.conflictos]) {
      if (eliminado.has(c.local.id)) continue;
      const previa = await filaDeposito(c.local.id);
      const delArchivo = !("tipo" in c) || d.conflictos[c.remoto.uuid] === "archivo";
      if (delArchivo) {
        const tasaId = await tasaIdPara(c.remoto.fecha);
        const imagenPath = c.remoto.imagen ? ((await deps.importarImagen(c.remoto.imagen)) ?? previa.imagenPath) : null;
        await updateDeposito(db, c.local.id, camposDe(c.remoto, tasaId, imagenPath), { actualizadoEn: c.remoto.actualizadoEn, asignacionId: c.asignacionId });
        deshacer.push(reponerDeposito(previa));
        r.corregidos++;
      } else {
        await db.execute("UPDATE depositos SET actualizado_en = ? WHERE id = ?", [masNuevaQue(c.remoto.actualizadoEn, deps.ahora), c.local.id]);
        deshacer.push(reponerDeposito(previa));
      }
    }

    // Nuevos, con el uuid y las fechas del origen.
    for (const n of plan.nuevos) {
      const tasaId = await tasaIdPara(n.remoto.fecha);
      const imagenPath = n.remoto.imagen ? await deps.importarImagen(n.remoto.imagen) : null;
      const id = await createDeposito(db, n.asignacionId, camposDe(n.remoto, tasaId, imagenPath), {
        uuid: n.remoto.uuid, creadoEn: n.remoto.creadoEn, actualizadoEn: n.remoto.actualizadoEn,
      });
      deshacer.push(async () => {
        await db.execute("DELETE FROM depositos WHERE id = ?", [id]);
      });
      r.nuevos++;
    }

    // Equivalencias: campaña, gerentes emparejados y depósitos vinculados (los duplicados, quede la versión que quede).
    if (p.campana.uuid !== plan.campana.uuid) await equivaler("campanas", p.campana.uuid, campanaId);
    for (const e of emparejadas) {
      const local = asignacionPorId.get(e.id);
      if (local && local.gerenteUuid !== e.remota.gerente.uuid) await equivaler("gerentes", e.remota.gerente.uuid, local.gerenteId);
    }
    for (const v of [...plan.vinculos, ...plan.conflictos.filter((c) => c.tipo === "duplicado")]) {
      if (eliminado.has(v.local.id) || v.remoto.uuid === v.local.uuid) continue;
      await equivaler("depositos", v.remoto.uuid, v.local.id);
      r.vinculados++;
    }
    // Reconocidos por sus equivalentes: el próximo archivo los reconoce por su propio uuid.
    for (const e of plan.equivalencias) {
      if (!eliminado.has(e.localId)) await equivaler("depositos", e.remotoUuid, e.localId);
    }

    // Último recibo de cada gerente emparejado.
    const ids = [...new Set(emparejadas.map((e) => e.id))];
    const intercambios = await getIntercambios(db, campanaId);
    await marcarIntercambio(db, ids, "recibo", deps.ahora);
    deshacer.push(async () => {
      for (const id of ids) {
        const previo = intercambios.get(id)?.recibo ?? null;
        if (previo === null) await db.execute("DELETE FROM consolidaciones WHERE asignacion_id = ? AND sentido = 'recibo'", [id]);
        else await marcarIntercambio(db, [id], "recibo", previo);
      }
    });
  } catch (e) {
    let fallos = 0;
    for (const paso of deshacer.reverse()) {
      try {
        await paso();
      } catch (err) {
        fallos++;
        console.error("No se pudo deshacer un paso de la consolidación", err);
      }
    }
    if (fallos > 0) {
      throw new DomainError(
        "VALIDACION",
        `La consolidación falló (${e instanceof Error ? e.message : String(e)}) y no se pudo deshacer del todo: restaura el respaldo "antes de consolidar"`,
      );
    }
    throw e;
  }
  return r;
}
