import { DomainError } from "./errors";
import { isValidIsoDate } from "./dates";
import { archivoBase } from "./texto";

export const FORMATO_PAQUETE = 1;

export type AsignacionPaquete = { uuid: string; gerente: { uuid: string; nombre: string }; saldoUsd: string; desde: string | null };
export type DepositoPaquete = {
  uuid: string; asignacionUuid: string; fecha: string; banco: string; referencia: string; cuentaDestino: string; montoBs: string;
  observaciones: string | null; tasaFecha: string; creadoEn: string; actualizadoEn: string; imagen: string | null; // nombre dentro de imagenes/
};
export type EliminacionPaquete = { uuid: string; asignacionUuid: string; eliminadoEn: string };
export type Paquete = {
  formato: 1; appVersion: string; creadoEn: string; origen: string;
  campana: { uuid: string; nombre: string };
  asignaciones: AsignacionPaquete[]; depositos: DepositoPaquete[]; tasas: { fecha: string; valor: string }[]; eliminaciones: EliminacionPaquete[];
};
export type DatosEnvio = {
  campana: { id: number; uuid: string; nombre: string };
  asignaciones: { id: number; uuid: string; gerenteId: number; gerenteUuid: string; gerenteNombre: string; saldoUsd: string; ultimoEnvio: string | null }[];
  depositos: (Omit<DepositoPaquete, "imagen"> & { asignacionId: number; tasaValor: string; imagenPath: string | null })[];
  eliminaciones: EliminacionPaquete[];
};
export type SeleccionEnvio = { asignacionIds: number[]; soloCambios: boolean };

const MSG_INVALIDO = "El archivo no es un paquete de Control de Pagos válido";
const MSG_NUEVO = "El archivo es de una versión más nueva de Control de Pagos: actualiza la app para abrirlo";

export function armarPaquete(
  d: DatosEnvio,
  sel: SeleccionEnvio,
  meta: { appVersion: string; creadoEn: string; origen: string },
): { paquete: Paquete; imagenes: string[]; porAsignacion: Map<number, number> } {
  const asignaciones = d.asignaciones.filter((a) => sel.asignacionIds.includes(a.id));
  const desdeDe = new Map(asignaciones.map((a) => [a.id, sel.soloCambios ? a.ultimoEnvio : null]));
  const idPorUuid = new Map(asignaciones.map((a) => [a.uuid, a.id]));

  const depositos = d.depositos.filter((x) => {
    const desde = desdeDe.get(x.asignacionId);
    return desde !== undefined && (desde === null || x.actualizadoEn > desde);
  });
  const eliminaciones = d.eliminaciones.filter((e) => {
    const id = idPorUuid.get(e.asignacionUuid);
    if (id === undefined) return false;
    const desde = desdeDe.get(id) ?? null;
    return desde === null || e.eliminadoEn > desde;
  });

  const tasas = new Map<string, string>();
  for (const x of depositos) tasas.set(x.tasaFecha, x.tasaValor);
  const porAsignacion = new Map<number, number>();
  for (const x of depositos) porAsignacion.set(x.asignacionId, (porAsignacion.get(x.asignacionId) ?? 0) + 1);
  const imagenes = [...new Set(depositos.flatMap((x) => (x.imagenPath ? [x.imagenPath] : [])))];

  const paquete: Paquete = {
    formato: FORMATO_PAQUETE,
    appVersion: meta.appVersion,
    creadoEn: meta.creadoEn,
    origen: meta.origen,
    campana: { uuid: d.campana.uuid, nombre: d.campana.nombre },
    asignaciones: asignaciones.map((a) => ({
      uuid: a.uuid,
      gerente: { uuid: a.gerenteUuid, nombre: a.gerenteNombre },
      saldoUsd: a.saldoUsd,
      desde: desdeDe.get(a.id) ?? null,
    })),
    depositos: depositos.map(({ asignacionId: _a, tasaValor: _t, imagenPath, ...resto }) => ({
      ...resto,
      imagen: imagenPath ? imagenPath.replace(/^imagenes\//, "") : null,
    })),
    tasas: [...tasas].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([fecha, valor]) => ({ fecha, valor })),
    eliminaciones,
  };
  return { paquete, imagenes, porAsignacion };
}

const invalido = (): never => {
  throw new DomainError("VALIDACION", MSG_INVALIDO);
};

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v : invalido());
const uuid = (v: unknown): string => (typeof v === "string" && v !== "" ? v : invalido());
const monto = (v: unknown): string => (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? v : invalido());
const fecha = (v: unknown): string => (typeof v === "string" && isValidIsoDate(v) ? v : invalido());
const nullable = <T>(v: unknown, f: (x: unknown) => T): T | null => (v === null ? null : f(v));
const lista = (v: unknown): Obj[] => (Array.isArray(v) && v.every(esObj) ? (v as Obj[]) : invalido());
const imagen = (v: unknown): string => (typeof v === "string" && /^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i.test(v) ? v : invalido());

export function leerPaquete(texto_: string): Paquete {
  let raw: unknown;
  try {
    raw = JSON.parse(texto_);
  } catch {
    return invalido();
  }
  if (!esObj(raw)) return invalido();
  if (typeof raw.formato === "number" && raw.formato > FORMATO_PAQUETE) throw new DomainError("VALIDACION", MSG_NUEVO);
  if (raw.formato !== FORMATO_PAQUETE) return invalido();
  if (!esObj(raw.campana)) return invalido();
  return {
    formato: 1,
    appVersion: texto(raw.appVersion),
    creadoEn: texto(raw.creadoEn),
    origen: texto(raw.origen),
    campana: { uuid: uuid(raw.campana.uuid), nombre: texto(raw.campana.nombre) },
    asignaciones: lista(raw.asignaciones).map((a) => {
      if (!esObj(a.gerente)) return invalido();
      return {
        uuid: uuid(a.uuid),
        gerente: { uuid: uuid(a.gerente.uuid), nombre: texto(a.gerente.nombre) },
        saldoUsd: monto(a.saldoUsd),
        desde: nullable(a.desde, texto),
      };
    }),
    depositos: lista(raw.depositos).map((x) => ({
      uuid: uuid(x.uuid),
      asignacionUuid: uuid(x.asignacionUuid),
      fecha: fecha(x.fecha),
      banco: texto(x.banco),
      referencia: texto(x.referencia),
      cuentaDestino: texto(x.cuentaDestino),
      montoBs: monto(x.montoBs),
      observaciones: nullable(x.observaciones, texto),
      tasaFecha: fecha(x.tasaFecha),
      creadoEn: texto(x.creadoEn),
      actualizadoEn: texto(x.actualizadoEn),
      imagen: nullable(x.imagen, imagen),
    })),
    tasas: lista(raw.tasas).map((t) => ({ fecha: fecha(t.fecha), valor: monto(t.valor) })),
    eliminaciones: lista(raw.eliminaciones).map((e) => ({ uuid: uuid(e.uuid), asignacionUuid: uuid(e.asignacionUuid), eliminadoEn: texto(e.eliminadoEn) })),
  };
}

export const nombreArchivoPaquete = (campana: string, origen: string, hoy: string): string =>
  `consolidar-${archivoBase(campana)}-${archivoBase(origen)}-${hoy}.cpagos`;
