import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva } from "../repos/campanas";
import { getAsignacion } from "../repos/asignaciones";
import { findDuplicados, getDeposito, type Deposito } from "../repos/depositos";
import { getTasa, getTasaParaFecha } from "../repos/tasas";
import { feriadosSet } from "../repos/feriados";
import { bancosConocidos, guardarAliasBanco } from "../repos/bancosAlias";
import { bancoCanonico, claveDuplicado } from "@/domain/bancos";
import { fechaDeTasa, formatFecha } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { claveComparacion } from "@/domain/texto";

/** Lo que se cambia en todos los marcados; lo que no viene (o viene vacío) queda como estaba. `nota` se agrega a las observaciones. */
export type CambiosLote = { cuentaDestino?: string; banco?: string; fecha?: string; nota?: string };

type Previo = Pick<Deposito, "id" | "banco" | "cuentaDestino" | "fecha" | "tasaId" | "observaciones" | "actualizadoEn">;
/** Cómo estaba todo antes (para deshacer con `restaurarEditados`): los depósitos y los alias de banco que se tocaron (null = no había). */
export type Editados = { depositos: Previo[]; alias: { alias: string; banco: string | null }[] };

async function assertEditable(db: SqlDriver, asignacionId: number): Promise<void> {
  const a = await getAsignacion(db, asignacionId);
  if (!a) throw new DomainError("NO_ENCONTRADO", "El gerente ya no está en esta campaña");
  await assertCampanaActiva(db, a.campanaId);
}

/**
 * Cambia los mismos campos en varios depósitos. Todo o nada: se comprueba todo antes de escribir (tasa de la fecha nueva,
 * duplicados con el banco nuevo, también entre los marcados). Quedan como editados ahora, así al consolidar llegan como
 * corrección. Si el banco nuevo es conocido, se recuerda que cada nombre viejo (que no sea ya un banco conocido) es ese
 * banco: así lo corrigen las próximas importaciones y `unificarBancos` en las demás campañas.
 */
export async function editarDepositos(db: SqlDriver, ids: number[], cambios: CambiosLote): Promise<Editados> {
  const cuenta = cambios.cuentaDestino?.trim() || null;
  const bancoEscrito = cambios.banco?.trim() || null;
  const fecha = cambios.fecha || null;
  const nota = cambios.nota?.trim() || null;
  if (!cuenta && !bancoEscrito && !fecha && !nota) throw new DomainError("VALIDACION", "Indica qué cambiar");
  if (ids.length === 0) throw new DomainError("VALIDACION", "Elige al menos un depósito");

  const previos: Deposito[] = [];
  for (const id of ids) {
    const d = await getDeposito(db, id);
    if (!d) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
    await assertEditable(db, d.asignacionId);
    previos.push(d);
  }

  let tasaId: number | null = null;
  if (fecha) {
    const tasa = await getTasaParaFecha(db, fecha);
    if (!tasa) {
      const rige = fechaDeTasa(fecha, await feriadosSet(db));
      throw new DomainError("VALIDACION", `No hay tasa del ${formatFecha(rige)}${rige !== fecha ? ` (la que rige el ${formatFecha(fecha)})` : ""}: cárgala primero`);
    }
    tasaId = tasa.id;
  }

  const conocidos = await bancosConocidos(db);
  const banco = bancoEscrito ? (bancoCanonico(bancoEscrito, conocidos) ?? bancoEscrito) : null;
  const nuevos = previos.map((d) => ({
    ...d,
    banco: banco ?? d.banco,
    cuentaDestino: cuenta ?? d.cuentaDestino,
    fecha: fecha ?? d.fecha,
    tasaId: tasaId ?? d.tasaId,
    observaciones: nota ? (d.observaciones?.trim() ? `${d.observaciones}\n${nota}` : nota) : d.observaciones,
  }));

  // Duplicados: solo los que cambian de clave (un duplicado de antes se puede seguir editando), contra los demás y entre sí.
  if (banco) {
    const marcados = new Set(ids);
    const claves = new Map<string, { d: Deposito; cambia: boolean }>();
    for (const [i, d] of nuevos.entries()) {
      const clave = claveDuplicado(d.banco, d.referencia);
      if (!clave) continue;
      const cambia = clave !== claveDuplicado(previos[i].banco, previos[i].referencia);
      const otro = claves.get(clave);
      if (otro && (otro.cambia || cambia)) {
        throw new DomainError("DUPLICADO", `Quedarían dos depósitos de ${d.banco} con la referencia ${d.referencia} (${formatFecha(otro.d.fecha)} y ${formatFecha(d.fecha)})`);
      }
      claves.set(clave, { d, cambia });
      if (!cambia) continue;
      const [dup] = (await findDuplicados(db, d.banco, d.referencia)).filter((x) => !marcados.has(x.id));
      if (dup) {
        throw new DomainError(
          "DUPLICADO",
          `Ya existe un depósito de ${dup.banco} con la referencia ${dup.referencia} (${formatFecha(dup.fecha)}, ${dup.gerenteNombre}, ${dup.campanaNombre})`,
        );
      }
    }
  }

  // Alias: el nombre viejo de cada marcado → el banco nuevo, si este se conoce y el viejo no es ya un banco de la lista fija.
  const alias: Editados["alias"] = [];
  if (banco && bancoCanonico(banco, conocidos)) {
    for (const viejo of new Set(previos.map((d) => d.banco))) {
      const clave = claveComparacion(viejo);
      if (!clave || clave === claveComparacion(banco) || bancoCanonico(viejo) || alias.some((a) => a.alias === clave)) continue;
      const [fila] = await db.select<{ banco: string }>("SELECT banco FROM bancos_alias WHERE alias = ?", [clave]);
      alias.push({ alias: clave, banco: fila?.banco ?? null });
    }
  }

  const ahora = nowIso();
  const hechos: Previo[] = [];
  try {
    for (const d of nuevos) {
      await escribir(db, { ...d, actualizadoEn: ahora });
      hechos.push(previo(previos.find((p) => p.id === d.id) as Deposito));
    }
    for (const a of alias) await guardarAliasBanco(db, a.alias, banco as string);
  } catch (err) {
    for (const p of hechos) await escribir(db, p);
    await restaurarAlias(db, alias);
    throw err;
  }
  return { depositos: previos.map(previo), alias };
}

const previo = ({ id, banco, cuentaDestino, fecha, tasaId, observaciones, actualizadoEn }: Deposito): Previo => ({
  id,
  banco,
  cuentaDestino,
  fecha,
  tasaId,
  observaciones,
  actualizadoEn,
});

function escribir(db: SqlDriver, d: Previo) {
  return db.execute("UPDATE depositos SET banco = ?, cuenta_destino = ?, fecha = ?, tasa_id = ?, observaciones = ?, actualizado_en = ? WHERE id = ?", [
    d.banco,
    d.cuentaDestino,
    d.fecha,
    d.tasaId,
    d.observaciones,
    d.actualizadoEn,
    d.id,
  ]);
}

async function restaurarAlias(db: SqlDriver, alias: Editados["alias"]) {
  for (const a of alias) {
    if (a.banco === null) await db.execute("DELETE FROM bancos_alias WHERE alias = ?", [a.alias]);
    else await guardarAliasBanco(db, a.alias, a.banco);
  }
}

/** Deshace `editarDepositos`: cada depósito vuelve a sus valores y a su fecha de edición, y los alias como estaban. */
export async function restaurarEditados(db: SqlDriver, e: Editados): Promise<void> {
  for (const p of e.depositos) {
    const d = await getDeposito(db, p.id);
    if (!d) throw new DomainError("NO_ENCONTRADO", "El depósito ya no existe");
    await assertEditable(db, d.asignacionId);
    if (!(await getTasa(db, p.tasaId))) throw new DomainError("NO_ENCONTRADO", "La tasa del depósito ya no existe");
  }
  for (const p of e.depositos) await escribir(db, p);
  await restaurarAlias(db, e.alias);
}
