import Decimal from "decimal.js";
import { cicloEn, creaCiclo, descendientes } from "./arbol";
import { claveDuplicado } from "./bancos";
import type { EstadoCampana } from "./campana";
import { fechaDeTasa, formatFecha } from "./dates";
import { MOTIVO_CERRADA } from "./motivos";
import type { AsignacionPaquete, DepositoPaquete, JefePaquete, Paquete } from "./paquete";
import { claveComparacion } from "./texto";

// ---------- Emparejamiento ----------

export type EstadoEmparejamiento = "recordado" | "nombre" | "ninguno" | "varios" | "elegido";

/** Campaña local que corresponde a la del paquete: la recordada, o la de igual nombre si es una sola. */
export function emparejarCampana(
  remota: { uuid: string; nombre: string },
  locales: { id: number; nombre: string }[],
  recordada: number | undefined,
): { campanaId: number | null; estado: EstadoEmparejamiento } {
  if (recordada !== undefined && locales.some((l) => l.id === recordada)) return { campanaId: recordada, estado: "recordado" };
  const clave = claveComparacion(remota.nombre);
  const iguales = locales.filter((l) => claveComparacion(l.nombre) === clave);
  if (iguales.length === 1) return { campanaId: iguales[0].id, estado: "nombre" };
  return { campanaId: null, estado: iguales.length === 0 ? "ninguno" : "varios" };
}

export type AsignacionLocal = {
  id: number; uuid: string; gerenteId: number; gerenteUuid: string; gerenteNombre: string; saldoUsd: string; ultimoEnvio: string | null;
  ultimoRecibo: string | null; jefeId: number | null;
};
export type GerenteLocal = { id: number; uuid: string; nombre: string };
/**
 * `asignacionId`: undefined = falta decidir; null = no incluir (sin bloquear). Con `agregar`, la asignación se crea al aplicar y
 * `asignacionId` es su id provisional (`idProvisional`); `gerenteId: null` = crear también el gerente (con el uuid y el nombre del archivo).
 */
export type GerenteEmparejado = { asignacionId: number | null | undefined; estado: EstadoEmparejamiento; agregar?: { gerenteId: number | null } };

/** Id (negativo) de la asignación que se agregaría a la campaña por una asignación del paquete, hasta que aplicar la cree. */
export function idProvisional(p: Pick<Paquete, "asignaciones">, asignacionUuid: string): number {
  return -(p.asignaciones.findIndex((a) => a.uuid === asignacionUuid) + 1);
}

/** Gerente local (de los que no están en la campaña) que ya es el del archivo: el del mismo uuid o el recordado; null si no se conoce. */
export function gerenteConocido(remota: AsignacionPaquete, fuera: GerenteLocal[], recordados: Map<string, number>): GerenteLocal | null {
  const recordado = recordados.get(remota.gerente.uuid);
  return fuera.find((g) => g.uuid === remota.gerente.uuid) ?? fuera.find((g) => g.id === recordado) ?? null;
}

/** Gerentes locales (de los que no están en la campaña) con el mismo nombre que el del archivo. */
export function gerentesMismoNombre(remota: AsignacionPaquete, fuera: GerenteLocal[]): GerenteLocal[] {
  const clave = claveComparacion(remota.gerente.nombre);
  return fuera.filter((g) => claveComparacion(g.nombre) === clave);
}

/** Gerentes conocidos: uuid remoto → id local (los recordados y los que tienen el mismo uuid, como uno que se agregó desde un archivo). */
export function gerentesRecordados(local: Pick<LocalConsolidar, "gerentes" | "equivalenciasGerentes">): Map<string, number> {
  return new Map([...local.gerentes.map((g) => [g.uuid, g.id] as const), ...local.equivalenciasGerentes]);
}

/** Los gerentes locales sin asignación en la campaña (los que se le pueden agregar). */
export function gerentesFuera(local: Pick<LocalConsolidar, "gerentes" | "asignaciones">): GerenteLocal[] {
  const dentro = new Set(local.asignaciones.map((a) => a.gerenteId));
  return local.gerentes.filter((g) => !dentro.has(g.id));
}

/**
 * Asignación local de cada asignación del paquete (por uuid remoto). Una asignación local recibe a lo sumo una remota automática.
 * Primero la del mismo uuid; luego el gerente recordado y el nombre; si no hay ninguna, se propone agregarlo a la campaña con el gerente
 * local que ya es él (`fuera`: los que no están en la campaña), el único del mismo nombre o uno nuevo.
 */
export function emparejarGerentes(
  remotas: AsignacionPaquete[],
  locales: AsignacionLocal[],
  recordados: Map<string, number>,
  fuera: GerenteLocal[],
): Record<string, GerenteEmparejado> {
  const resultado: Record<string, GerenteEmparejado> = {};
  const usadas = new Set<number>();
  for (const r of remotas) {
    let elegido: GerenteEmparejado;
    const gerenteId = recordados.get(r.gerente.uuid);
    const mismoUuid = locales.find((l) => l.uuid === r.uuid);
    const recordada = gerenteId === undefined ? undefined : locales.find((l) => l.gerenteId === gerenteId);
    if (mismoUuid) {
      elegido = { asignacionId: mismoUuid.id, estado: "recordado" };
    } else if (recordada) {
      elegido = { asignacionId: recordada.id, estado: "recordado" };
    } else {
      const clave = claveComparacion(r.gerente.nombre);
      const iguales = locales.filter((l) => claveComparacion(l.gerenteNombre) === clave);
      if (iguales.length === 0) elegido = { asignacionId: null, estado: "ninguno" };
      else if (iguales.length === 1) elegido = { asignacionId: iguales[0].id, estado: "nombre" };
      else elegido = { asignacionId: undefined, estado: "varios" };
    }
    if (typeof elegido.asignacionId === "number") {
      if (usadas.has(elegido.asignacionId)) elegido = { asignacionId: undefined, estado: "varios" };
      else usadas.add(elegido.asignacionId);
    }
    if (elegido.asignacionId === null) {
      const iguales = gerentesMismoNombre(r, fuera);
      const conocido = gerenteConocido(r, fuera, recordados);
      // varios locales con el mismo nombre fuera de la campaña: que el usuario elija cuál (o crear uno nuevo), sin crear un tercero en silencio
      if (!conocido && iguales.length > 1) {
        resultado[r.uuid] = { asignacionId: undefined, estado: "varios" };
        continue;
      }
      const existente = conocido ?? (iguales.length === 1 ? iguales[0] : null);
      elegido = { asignacionId: idProvisional({ asignaciones: remotas }, r.uuid), estado: "ninguno", agregar: { gerenteId: existente?.id ?? null } };
    }
    resultado[r.uuid] = elegido;
  }
  return resultado;
}

// ---------- Clasificar ----------

export type DepositoLocal = {
  id: number; uuid: string; asignacionId: number; campanaId: number; campanaNombre: string; fecha: string; banco: string;
  referencia: string; cuentaDestino: string; montoBs: string; observaciones: string | null; imagenPath: string | null; actualizadoEn: string;
};
export type LocalConsolidar = {
  campana: { id: number; uuid: string; nombre: string; estado: EstadoCampana };
  asignaciones: AsignacionLocal[];
  depositos: DepositoLocal[]; // de TODAS las campañas
  tasas: Map<string, { id: number; valor: string; usos: number }>; // por fecha
  feriados: ReadonlySet<string>;
  eliminados: ReadonlySet<string>; // uuids eliminados aquí
  equivalenciasDepositos: Map<string, number>; // uuid remoto → id local
  gerentes: GerenteLocal[]; // todos los de esta instalación
  equivalenciasGerentes: Map<string, number>; // uuid remoto → id local
};
export type Campo = "fecha" | "banco" | "referencia" | "cuentaDestino" | "montoBs" | "observaciones" | "gerente";
export type Cambio = { campo: Campo; antes: string | null; despues: string | null };
export type TasaUsada = { fecha: string; accion: "existente" | "crear" | "distinta" };
export type Nuevo = { remoto: DepositoPaquete; asignacionId: number; tasa: TasaUsada };
export type Correccion = { remoto: DepositoPaquete; local: DepositoLocal; asignacionId: number; tasa: TasaUsada; cambios: Cambio[] };
export type Conflicto = Correccion & { tipo: "editadoEnAmbas" | "duplicado" };
export type Eliminacion = { remotoUuid: string; local: DepositoLocal };
export type Vinculo = { remoto: DepositoPaquete; local: DepositoLocal };
export type NoIncluido = { remoto: DepositoPaquete; gerenteNombre: string; motivo: string };
export type PlanConsolidacion = {
  campana: LocalConsolidar["campana"];
  nuevos: Nuevo[]; correcciones: Correccion[]; conflictos: Conflicto[]; eliminaciones: Eliminacion[]; vinculos: Vinculo[];
  sinCambios: number; masNuevasAqui: Correccion[]; noIncluidos: NoIncluido[];
  tasasNuevas: { fecha: string; valor: string }[];
  tasasDistintas: { fecha: string; local: string; archivo: string; usos: number }[];
  saldos: { asignacionId: number; gerenteNombre: string; local: string; archivo: string }[];
  /** Depósitos del archivo reconocidos por sus `equivalentes`: al aplicar se recuerda su uuid. */
  equivalencias: { remotoUuid: string; localId: number }[];
  /** Gerentes del archivo que se agregan a la campaña. */
  agregadas: Agregada[];
  /** Jefes del archivo distintos de los de aquí (los automáticos se aplican sin preguntar). */
  jefes: JefeCambio[];
  /** Jefes de la campaña aquí (las agregadas, sin jefe): base de `jefesFinales`. */
  jefesLocales: Map<number, number | null>;
};
/**
 * Jefe de una asignación aquí (`local`) y en el archivo (`archivo`), como ids de asignaciones de la campaña (las agregadas, provisionales).
 * `automatico`: aquí no tiene jefe y toma el del archivo. `bloqueo`: el del archivo lo dejaría debajo de sí mismo. `debajo`: cuántos tiene debajo.
 */
export type JefeCambio = {
  asignacionId: number; gerenteNombre: string; local: number | null; archivo: number | null; automatico: boolean; bloqueo: string | null; debajo: number;
};
/** `gerenteId` null = gerente nuevo. Nombre: el del gerente local si ya existe; si no, el del archivo. */
export type Agregada = { remotaUuid: string; asignacionId: number; gerenteId: number | null; gerenteNombre: string; saldoUsd: string };
export type Eleccion = "mia" | "archivo";
export type Decisiones = {
  tasas: Record<string, Eleccion | undefined>; saldos: Record<number, Eleccion>; conflictos: Record<string, Eleccion>; eliminar: Set<string>;
  jefes: Record<number, Eleccion>;
};

/** Diferencias de campos entre la copia local y la del archivo (montos por valor; observaciones vacías = sin observaciones). */
function compararCampos(remoto: DepositoPaquete, local: DepositoLocal, asignacionId: number, nombreDe: (id: number) => string): Cambio[] {
  const cambios: Cambio[] = [];
  const texto = (campo: Campo, antes: string | null, despues: string | null) => {
    if ((antes ?? "") !== (despues ?? "")) cambios.push({ campo, antes, despues });
  };
  texto("fecha", local.fecha, remoto.fecha);
  texto("banco", local.banco, remoto.banco);
  texto("referencia", local.referencia, remoto.referencia);
  texto("cuentaDestino", local.cuentaDestino, remoto.cuentaDestino);
  if (!new Decimal(local.montoBs).eq(remoto.montoBs)) cambios.push({ campo: "montoBs", antes: local.montoBs, despues: remoto.montoBs });
  texto("observaciones", local.observaciones, remoto.observaciones);
  if (local.asignacionId !== asignacionId) cambios.push({ campo: "gerente", antes: nombreDe(local.asignacionId), despues: nombreDe(asignacionId) });
  return cambios;
}

/**
 * Decide qué pasa con cada depósito, eliminación y monto asignado del paquete en la campaña local. No cambia nada:
 * lo aplica otra parte según el plan y las decisiones del usuario.
 */
export function clasificar(p: Paquete, local: LocalConsolidar, gerentes: Record<string, GerenteEmparejado>): PlanConsolidacion {
  const plan: PlanConsolidacion = {
    campana: local.campana, nuevos: [], correcciones: [], conflictos: [], eliminaciones: [], vinculos: [], sinCambios: 0, masNuevasAqui: [],
    noIncluidos: [], tasasNuevas: [], tasasDistintas: [], saldos: [], equivalencias: [], agregadas: [], jefes: [], jefesLocales: new Map(),
  };
  const campanaId = local.campana.id;
  const porId = new Map(local.depositos.map((d) => [d.id, d]));
  const porUuid = new Map(local.depositos.map((d) => [d.uuid, d]));
  const porUuidOEquivalencia = (uuid: string): DepositoLocal | undefined => {
    const id = local.equivalenciasDepositos.get(uuid);
    return porUuid.get(uuid) ?? (id === undefined ? undefined : porId.get(id));
  };
  /** Copia local de un depósito del archivo: por su uuid, por una equivalencia o por los uuids que la otra app tiene vinculados a él. */
  const resolver = (d: DepositoPaquete): { local: DepositoLocal; porEquivalente: boolean } | undefined => {
    const directo = porUuidOEquivalencia(d.uuid);
    if (directo) return { local: directo, porEquivalente: false };
    for (const e of d.equivalentes) {
      const l = porUuidOEquivalencia(e);
      if (l) return { local: l, porEquivalente: true };
    }
    return undefined;
  };
  /** Eliminado aquí: registrado como eliminado, o vinculado antes a un depósito que ya no está. */
  const eliminadoAqui = (uuid: string): boolean => {
    const equivalente = local.equivalenciasDepositos.get(uuid);
    return local.eliminados.has(uuid) || (equivalente !== undefined && !porId.has(equivalente));
  };

  // Eliminaciones: solo las de gerentes emparejados y depósitos que existen en esta campaña.
  const eliminadosPorArchivo = new Set<number>();
  for (const e of p.eliminaciones) {
    if (typeof gerentes[e.asignacionUuid]?.asignacionId !== "number") continue;
    const l = porUuidOEquivalencia(e.uuid);
    if (!l || l.campanaId !== campanaId || eliminadosPorArchivo.has(l.id)) continue;
    eliminadosPorArchivo.add(l.id);
    plan.eliminaciones.push({ remotoUuid: e.uuid, local: l });
  }

  // Los que el archivo elimina no cuentan como duplicados: su reemplazo (p. ej. el que se quedó en la pantalla de duplicados) entra como
  // nuevo. Si se desmarca esa eliminación, aplicar falla por duplicado y no cambia nada (`motivoPendiente` lo avisa antes).
  const porClave = new Map<string, DepositoLocal[]>();
  for (const d of local.depositos) {
    const k = claveDuplicado(d.banco, d.referencia);
    if (k && !eliminadosPorArchivo.has(d.id)) porClave.set(k, [...(porClave.get(k) ?? []), d]);
  }
  const asignacionesArchivo = new Map(p.asignaciones.map((a) => [a.uuid, a]));
  const asignacionesLocales = new Map(local.asignaciones.map((a) => [a.id, a]));
  // Las que se agregan cuentan como de la campaña, con su id provisional, el monto del archivo y sin recibo.
  for (const a of p.asignaciones) {
    const g = gerentes[a.uuid];
    if (!g?.agregar || typeof g.asignacionId !== "number") continue;
    const gerenteId = g.agregar.gerenteId;
    const gerenteNombre = (gerenteId === null ? undefined : local.gerentes.find((x) => x.id === gerenteId)?.nombre) ?? a.gerente.nombre;
    plan.agregadas.push({ remotaUuid: a.uuid, asignacionId: g.asignacionId, gerenteId, gerenteNombre, saldoUsd: a.saldoUsd });
    asignacionesLocales.set(g.asignacionId, {
      id: g.asignacionId, uuid: a.uuid, gerenteId: gerenteId ?? g.asignacionId, gerenteUuid: a.gerente.uuid, gerenteNombre, saldoUsd: a.saldoUsd,
      ultimoEnvio: null, ultimoRecibo: null, jefeId: null,
    });
  }
  const nombreLocal = (id: number) => asignacionesLocales.get(id)?.gerenteNombre ?? "";
  const tasasArchivo = new Map(p.tasas.map((t) => [t.fecha, t.valor]));
  const fechasNuevas = new Set<string>();
  const fechasDistintas = new Set<string>();

  // Depósitos locales que ya son la copia de otro depósito del archivo: un duplicado de ellos es un repetido del archivo.
  const reclamados = new Set<number>();
  for (const d of p.depositos) {
    const r = resolver(d);
    if (r) reclamados.add(r.local.id);
  }
  const clavesArchivo = new Set<string>();

  /** Tasa que usaría el depósito según los feriados locales, o null si no hay ni aquí ni en el archivo. */
  const tasaDe = (d: DepositoPaquete): TasaUsada | null => {
    const rige = fechaDeTasa(d.fecha, local.feriados);
    const mia = local.tasas.get(rige);
    if (mia) {
      // La del archivo para el mismo día que rige aquí (con otros feriados, la del archivo puede ser de otra fecha).
      const delArchivo = tasasArchivo.get(rige);
      if (delArchivo === undefined || new Decimal(mia.valor).eq(delArchivo)) return { fecha: rige, accion: "existente" };
      if (!fechasDistintas.has(rige)) {
        fechasDistintas.add(rige);
        plan.tasasDistintas.push({ fecha: rige, local: mia.valor, archivo: delArchivo, usos: mia.usos });
      }
      return { fecha: rige, accion: "distinta" };
    }
    const valor = tasasArchivo.get(rige);
    if (valor === undefined) return null;
    if (!fechasNuevas.has(rige)) {
      fechasNuevas.add(rige);
      plan.tasasNuevas.push({ fecha: rige, valor });
    }
    return { fecha: rige, accion: "crear" };
  };
  /** En una corrección o conflicto la tasa solo cuenta si el archivo cambia la fecha; si no, queda la del local. */
  const tasaDeCorreccion = (d: DepositoPaquete, l: DepositoLocal): TasaUsada | null =>
    d.fecha !== l.fecha ? tasaDe(d) : { fecha: fechaDeTasa(l.fecha, local.feriados), accion: "existente" };

  for (const d of p.depositos) {
    const nombre = asignacionesArchivo.get(d.asignacionUuid)?.gerente.nombre ?? "(desconocido)";
    const noIncluir = (motivo: string) => plan.noIncluidos.push({ remoto: d, gerenteNombre: nombre, motivo });
    const faltaTasa = () => noIncluir(`Falta la tasa del ${formatFecha(fechaDeTasa(d.fecha, local.feriados))}`);

    // 1. Gerente
    const g = gerentes[d.asignacionUuid];
    const asignacionId = g?.asignacionId;
    if (asignacionId === null || asignacionId === undefined || !asignacionesLocales.has(asignacionId)) {
      noIncluir(g?.estado === "elegido" ? `Elegiste no incluir a ${nombre}` : `${nombre} no está en tu campaña`);
      continue;
    }

    // 2. Copia local por uuid, equivalencia o equivalentes
    const clave = claveDuplicado(d.banco, d.referencia);
    const resuelto = resolver(d);
    const l = resuelto?.local;
    if (l && l.campanaId !== campanaId) {
      noIncluir(`Está en tu campaña ${l.campanaNombre}`);
      continue;
    }
    if (l && resuelto.porEquivalente) plan.equivalencias.push({ remotoUuid: d.uuid, localId: l.id });

    if (!l) {
      if ([d.uuid, ...d.equivalentes].some(eliminadoAqui)) {
        noIncluir("Lo eliminaste en tu app");
        continue;
      }
      // 3. Duplicado por banco y referencia
      const dups = clave ? (porClave.get(clave) ?? []) : [];
      const fuera = dups.find((x) => x.campanaId !== campanaId);
      if (fuera) {
        noIncluir(`Ya existe en tu campaña ${fuera.campanaNombre}`);
        continue;
      }
      const aqui = dups[0];
      if ((clave && clavesArchivo.has(clave)) || (aqui && reclamados.has(aqui.id))) {
        noIncluir("Repetido en el archivo");
        continue;
      }
      if (clave) clavesArchivo.add(clave);
      if (aqui) {
        const cambios = compararCampos(d, aqui, asignacionId, nombreLocal);
        if (cambios.length === 0) {
          plan.vinculos.push({ remoto: d, local: aqui });
          continue;
        }
        const tasa = tasaDeCorreccion(d, aqui);
        if (!tasa) faltaTasa();
        else plan.conflictos.push({ tipo: "duplicado", remoto: d, local: aqui, asignacionId, tasa, cambios });
        continue;
      }
      // 4. Nuevo
      const tasa = tasaDe(d);
      if (!tasa) faltaTasa();
      else plan.nuevos.push({ remoto: d, asignacionId, tasa });
      continue;
    }

    // 5. Con copia en esta campaña
    // Con otra clave, choca con otro local o con un depósito anterior del archivo (sin depender del orden: los posteriores ven esta clave).
    const quedariaDuplicado =
      clave !== "" && clave !== claveDuplicado(l.banco, l.referencia) && (clavesArchivo.has(clave) || (porClave.get(clave) ?? []).some((x) => x.id !== l.id));
    if (clave) clavesArchivo.add(clave);
    // Sin diferencias en los campos (p. ej. un vinculado con otro reloj) = sin cambios. Un cambio solo de imagen no se detecta.
    const cambios = d.actualizadoEn === l.actualizadoEn ? [] : compararCampos(d, l, asignacionId, nombreLocal);
    if (cambios.length === 0) {
      plan.sinCambios++;
      continue;
    }
    if (d.actualizadoEn < l.actualizadoEn) {
      plan.masNuevasAqui.push({ remoto: d, local: l, asignacionId, tasa: { fecha: fechaDeTasa(l.fecha, local.feriados), accion: "existente" }, cambios });
      continue;
    }
    if (quedariaDuplicado) {
      noIncluir(`Quedaría duplicado de ${d.banco} ${d.referencia}`);
      continue;
    }
    const tasa = tasaDeCorreccion(d, l);
    if (!tasa) {
      faltaTasa();
      continue;
    }
    const correccion: Correccion = { remoto: d, local: l, asignacionId, tasa, cambios };
    // Editado aquí desde el último archivo recibido (no cuenta el envío: la otra app pudo editar antes de recibirlo, y sería una edición cruzada).
    // >=: al quedarse con "mia" en un conflicto, aplicar deja actualizado_en >= ahora = último recibo, y el próximo archivo vuelve a ser conflicto.
    const recibo = asignacionesLocales.get(l.asignacionId)?.ultimoRecibo ?? null;
    if (recibo === null || l.actualizadoEn >= recibo) plan.conflictos.push({ ...correccion, tipo: "editadoEnAmbas" });
    else plan.correcciones.push(correccion);
  }

  // Montos asignados distintos en gerentes emparejados.
  for (const a of p.asignaciones) {
    const id = gerentes[a.uuid]?.asignacionId;
    const la = typeof id === "number" ? asignacionesLocales.get(id) : undefined;
    if (la && !new Decimal(la.saldoUsd).eq(a.saldoUsd)) plan.saldos.push({ asignacionId: la.id, gerenteNombre: la.gerenteNombre, local: la.saldoUsd, archivo: a.saldoUsd });
  }

  plan.jefesLocales = new Map([...asignacionesLocales.values()].map((a) => [a.id, a.jefeId]));
  plan.jefes = jefesDelArchivo(p, local, gerentes, asignacionesLocales, plan.jefesLocales);
  return plan;
}

/**
 * Jefe del archivo como id de una asignación de la campaña (o undefined si no se encuentra): el emparejamiento de su asignación si viene en el
 * archivo; si no, la asignación de aquí con ese uuid; si no, la de su gerente (por uuid o recordado).
 */
function resolverJefe(
  j: JefePaquete,
  local: LocalConsolidar,
  gerentes: Record<string, GerenteEmparejado>,
  asignaciones: Map<number, AsignacionLocal>,
): number | undefined {
  const emparejada = gerentes[j.asignacionUuid]?.asignacionId;
  if (typeof emparejada === "number") return emparejada;
  const todas = [...asignaciones.values()];
  const mismoUuid = todas.find((a) => a.uuid === j.asignacionUuid);
  if (mismoUuid) return mismoUuid.id;
  const gerenteId = gerentesRecordados(local).get(j.gerente.uuid);
  return gerenteId === undefined ? undefined : todas.find((a) => a.gerenteId === gerenteId)?.id;
}

const BLOQUEO_CICLO = "Quedaría debajo de sí mismo";

function jefesDelArchivo(
  p: Paquete,
  local: LocalConsolidar,
  gerentes: Record<string, GerenteEmparejado>,
  asignaciones: Map<number, AsignacionLocal>,
  jefesLocales: Map<number, number | null>,
): JefeCambio[] {
  const filas: JefeCambio[] = [];
  for (const a of p.asignaciones) {
    const id = gerentes[a.uuid]?.asignacionId;
    // Un archivo anterior al árbol (jefe undefined) no toca nada.
    if (typeof id !== "number" || a.jefe === undefined || !asignaciones.has(id)) continue;
    const archivo = a.jefe === null ? null : resolverJefe(a.jefe, local, gerentes, asignaciones);
    if (archivo === undefined) continue;
    const mio = jefesLocales.get(id) ?? null;
    if (mio === archivo) continue;
    const gerenteNombre = asignaciones.get(id)?.gerenteNombre ?? a.gerente.nombre;
    filas.push({ asignacionId: id, gerenteNombre, local: mio, archivo, automatico: mio === null, bloqueo: null, debajo: 0 });
  }
  // Los automáticos que cierran un ciclo pasan a preguntarse, bloqueados.
  const conAutomaticos = new Map(jefesLocales);
  for (const f of filas) if (f.automatico) conAutomaticos.set(f.asignacionId, f.archivo);
  for (let ciclo = cicloEn(conAutomaticos); ciclo; ciclo = cicloEn(conAutomaticos)) {
    const ids = ciclo;
    const enCiclo = filas.filter((f) => f.automatico && ids.includes(f.asignacionId));
    if (enCiclo.length === 0) break; // un ciclo que ya estaba aquí: no lo arregla el archivo
    for (const f of enCiclo) {
      f.automatico = false;
      f.bloqueo = BLOQUEO_CICLO;
      conAutomaticos.set(f.asignacionId, f.local);
    }
  }
  for (const f of filas) {
    if (!f.automatico && !f.bloqueo && creaCiclo(conAutomaticos, f.asignacionId, f.archivo)) f.bloqueo = BLOQUEO_CICLO;
    f.debajo = descendientes(conAutomaticos, f.asignacionId).length;
  }
  return filas;
}

/** Los cambios de jefe que se aplican con las decisiones: los automáticos y los del archivo elegidos (sin bloqueo). */
export function jefesAplicados(plan: PlanConsolidacion, d: Decisiones): JefeCambio[] {
  return plan.jefes.filter((f) => f.automatico || (d.jefes[f.asignacionId] === "archivo" && !f.bloqueo));
}

/** Los jefes de la campaña tras consolidar: los de aquí con `jefesAplicados`. */
export function jefesFinales(plan: PlanConsolidacion, d: Decisiones): Map<number, number | null> {
  const jefes = new Map(plan.jefesLocales);
  for (const f of jefesAplicados(plan, d)) jefes.set(f.asignacionId, f.archivo);
  return jefes;
}

/** Mensaje de un ciclo de jefes (ids de `plan.jefes`), con los nombres de los gerentes que lo forman. */
export function motivoCiclo(plan: PlanConsolidacion, ciclo: number[]): string {
  const nombres = plan.jefes.filter((f) => ciclo.includes(f.asignacionId)).map((f) => f.gerenteNombre);
  return nombres.length > 0
    ? `${nombres.join(" y ")} quedarían uno debajo del otro: cambia la elección de su jefe`
    : "Dos gerentes quedarían uno debajo del otro: cambia la elección de su jefe";
}

export type GrupoJefe = { desde: string; hacia: string; filas: JefeCambio[] };

/** Los jefes distintos (no automáticos) agrupados por el par (mi jefe → el del archivo), en el orden en que aparecen. */
export function agruparJefes(plan: PlanConsolidacion, nombreDe: (id: number) => string): GrupoJefe[] {
  const nombre = (id: number | null) => (id === null ? "sin jefe" : nombreDe(id));
  const grupos = new Map<string, GrupoJefe>();
  for (const f of plan.jefes) {
    if (f.automatico) continue;
    const desde = nombre(f.local);
    const hacia = nombre(f.archivo);
    const clave = JSON.stringify([desde, hacia]);
    const grupo = grupos.get(clave);
    if (grupo) grupo.filas.push(f);
    else grupos.set(clave, { desde, hacia, filas: [f] });
  }
  return [...grupos.values()];
}

/**
 * Montos asignados: el mío. Conflictos: la más reciente (el archivo si editaron las dos; el mío si es un duplicado). Eliminaciones: todas.
 * Tasas: sin decidir. Jefes distintos: el mío.
 */
export function decisionesIniciales(plan: PlanConsolidacion): Decisiones {
  return {
    tasas: {},
    saldos: Object.fromEntries(plan.saldos.map((s) => [s.asignacionId, "mia" as const])),
    conflictos: Object.fromEntries(plan.conflictos.map((c) => [c.remoto.uuid, c.tipo === "editadoEnAmbas" ? ("archivo" as const) : ("mia" as const)])),
    eliminar: new Set(plan.eliminaciones.map((e) => e.remotoUuid)),
    jefes: Object.fromEntries(plan.jefes.filter((f) => !f.automatico).map((f) => [f.asignacionId, "mia" as const])),
  };
}

/** Dos gerentes del archivo (uuid de su asignación) emparejados con la misma asignación local o agregados con el mismo gerente local, o null. */
export function gerentesRepetidos(gerentes: Record<string, GerenteEmparejado>): [string, string] | null {
  const vistos = new Map<string, string>();
  for (const [uuid, g] of Object.entries(gerentes)) {
    if (typeof g.asignacionId !== "number") continue;
    const claves = [`asignacion ${g.asignacionId}`, ...(typeof g.agregar?.gerenteId === "number" ? [`gerente ${g.agregar.gerenteId}`] : [])];
    for (const k of claves) {
      const otro = vistos.get(k);
      if (otro !== undefined) return [otro, uuid];
      vistos.set(k, uuid);
    }
  }
  return null;
}

/** Mensaje de `gerentesRepetidos`, con los nombres del archivo si se conocen. */
export function motivoRepetidos([a, b]: [string, string], nombres: Record<string, string>): string {
  return nombres[a] && nombres[b]
    ? `${nombres[a]} y ${nombres[b]} no pueden ser el mismo gerente de tu campaña`
    : "Dos gerentes del archivo no pueden ser el mismo de tu campaña";
}

/** Depósito del archivo que quedaría duplicado de uno local porque se desmarcó la eliminación de ese local (aplicar fallaría). */
function reemplazoSinEliminar(plan: PlanConsolidacion, d: Decisiones): DepositoPaquete | null {
  const sinEliminar = plan.eliminaciones.filter((e) => !d.eliminar.has(e.remotoUuid));
  if (sinEliminar.length === 0) return null;
  const entrantes = [
    ...plan.nuevos.map((n) => ({ remoto: n.remoto, localId: null as number | null })),
    ...plan.correcciones.map((c) => ({ remoto: c.remoto, localId: c.local.id })),
    ...plan.conflictos.filter((c) => d.conflictos[c.remoto.uuid] === "archivo").map((c) => ({ remoto: c.remoto, localId: c.local.id })),
  ];
  for (const { remoto, localId } of entrantes) {
    const clave = claveDuplicado(remoto.banco, remoto.referencia);
    if (clave && sinEliminar.some((e) => e.local.id !== localId && claveDuplicado(e.local.banco, e.local.referencia) === clave)) return remoto;
  }
  return null;
}

/** Por qué todavía no se puede consolidar, o null si se puede. `nombres`: nombre de cada gerente del archivo por uuid de su asignación. */
export function motivoPendiente(
  plan: PlanConsolidacion,
  gerentes: Record<string, GerenteEmparejado>,
  d: Decisiones,
  nombres: Record<string, string> = {},
): string | null {
  if (plan.campana.estado === "cerrada") return MOTIVO_CERRADA;
  for (const [uuid, g] of Object.entries(gerentes)) {
    if (g.asignacionId !== undefined) continue;
    const nombre = plan.noIncluidos.find((n) => n.remoto.asignacionUuid === uuid)?.gerenteNombre;
    return nombre ? `Indica quién es ${nombre} en tu campaña` : "Indica quién es cada gerente del archivo en tu campaña";
  }
  const repetidos = gerentesRepetidos(gerentes);
  if (repetidos) return motivoRepetidos(repetidos, nombres);
  const tasa = plan.tasasDistintas.find((t) => d.tasas[t.fecha] === undefined);
  if (tasa) return `Elige la tasa del ${formatFecha(tasa.fecha)}`;
  const reemplazo = reemplazoSinEliminar(plan, d);
  if (reemplazo) return `${reemplazo.banco} ${reemplazo.referencia} del archivo reemplaza a uno que el archivo elimina: marca esa eliminación para consolidar`;
  const ciclo = cicloEn(jefesFinales(plan, d));
  if (ciclo) return motivoCiclo(plan, ciclo);
  const hayAlgo =
    plan.agregadas.length > 0 || jefesAplicados(plan, d).length > 0 || plan.nuevos.length > 0 || plan.correcciones.length > 0 || plan.conflictos.length > 0 || plan.vinculos.length > 0 ||
    plan.tasasNuevas.length > 0 ||
    plan.eliminaciones.some((e) => d.eliminar.has(e.remotoUuid)) || plan.saldos.some((s) => d.saldos[s.asignacionId] === "archivo") ||
    plan.tasasDistintas.some((t) => d.tasas[t.fecha] === "archivo");
  return hayAlgo ? null : "No hay nada nuevo para consolidar";
}
