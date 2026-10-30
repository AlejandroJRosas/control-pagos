import Decimal from "decimal.js";
import { formatNumberVE, toUsd } from "./money";
import { coincideBusqueda } from "./busqueda";
import type { NodoArbol } from "./arbol";

export type AsignacionData = { id: number; gerenteId: number; gerenteNombre: string; saldoUsd: string };

export type DepositoData = {
  id: number;
  asignacionId: number;
  fecha: string;
  creadoEn: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  tasaId: number;
  tasaValor: string;
  observaciones: string | null;
  imagenPath: string | null;
  /** Captura de la tasa del depósito (si se adjuntó). */
  tasaImagenPath?: string | null;
};

export type DepositoCalculado = DepositoData & {
  gerenteId: number;
  gerenteNombre: string;
  usd: string;
  saldoGerenteRestante: string;
  saldoGeneralRestante: string;
};

export type Resumen = {
  asignado: string;
  pagado: string;
  restante: string;
  ratio: number;
  pct: number;
  cantidad: number;
  ultimaFecha: string | null;
};

export type GerenteResumen = Resumen & { asignacionId: number; gerenteId: number; gerenteNombre: string };

export type CampanaView = { total: Resumen; gerentes: GerenteResumen[]; depositos: DepositoCalculado[] };

type Ordenable = Pick<DepositoData, "fecha" | "creadoEn" | "id">;

export function compareCronologico(a: Ordenable, b: Ordenable): number {
  return a.fecha.localeCompare(b.fecha) || a.creadoEn.localeCompare(b.creadoEn) || a.id - b.id;
}

/** Orden de las tablas: el día más reciente arriba; dentro del día, en el orden en que se registraron. */
export function compareRecientePrimero(a: Ordenable, b: Ordenable): number {
  return b.fecha.localeCompare(a.fecha) || a.creadoEn.localeCompare(b.creadoEn) || a.id - b.id;
}

export function calcResumen(asignado: Decimal.Value, usds: string[], fechas: string[]): Resumen {
  const pagado = usds.reduce((acc, u) => acc.plus(u), new Decimal(0));
  return resumen(new Decimal(asignado), pagado, usds.length, ultima(fechas));
}

/** Total de varios gerentes (el pie de "Por gerente"): el avance sale de los totales, no del promedio de los porcentajes. */
export function sumarResumenes(rs: Resumen[]): Resumen {
  const suma = (k: "asignado" | "pagado") => rs.reduce((acc, r) => acc.plus(r[k]), new Decimal(0));
  const fechas = rs.flatMap((r) => (r.ultimaFecha ? [r.ultimaFecha] : []));
  return resumen(suma("asignado"), suma("pagado"), rs.reduce((n, r) => n + r.cantidad, 0), ultima(fechas));
}

/** Resumen de cada jefe con toda su gente (todos los niveles), por id; los que no tienen a nadie debajo no llevan. */
export function resumenesDeRama<T extends Resumen>(nodos: NodoArbol<T>[], id: (t: T) => number): Map<number, Resumen> {
  const ramas = new Map<number, Resumen>();
  const visitar = (nodo: NodoArbol<T>): T[] => {
    const todos = [nodo.item, ...nodo.hijos.flatMap(visitar)];
    if (nodo.hijos.length > 0) ramas.set(id(nodo.item), sumarResumenes(todos));
    return todos;
  };
  nodos.forEach(visitar);
  return ramas;
}

/** Total en USD de unos depósitos si todos tuvieran la tasa `tasaValor` (cada uno redondeado, como siempre). */
export function totalUsdConTasa(depositos: { montoBs: string }[], tasaValor: string): string {
  return depositos.reduce((acc, d) => acc.plus(toUsd(d.montoBs, tasaValor)), new Decimal(0)).toFixed(2);
}

function ultima(fechas: string[]): string | null {
  return fechas.length > 0 ? fechas.reduce((max, f) => (f > max ? f : max)) : null;
}

function resumen(asig: Decimal, pagado: Decimal, cantidad: number, ultimaFecha: string | null): Resumen {
  const ratio = asig.gt(0) ? pagado.div(asig) : new Decimal(0);
  const pct = Decimal.min(Decimal.max(ratio.times(100), 0), 100).toDecimalPlaces(1).toNumber();
  return {
    asignado: asig.toFixed(2),
    pagado: pagado.toFixed(2),
    restante: asig.minus(pagado).toFixed(2),
    ratio: ratio.toNumber(),
    pct,
    cantidad,
    ultimaFecha,
  };
}

export function buildCampanaView(asignaciones: AsignacionData[], depositos: DepositoData[]): CampanaView {
  const porId = new Map(asignaciones.map((a) => [a.id, a]));
  const restantePorAsignacion = new Map(asignaciones.map((a) => [a.id, new Decimal(a.saldoUsd)]));
  const totalAsignado = asignaciones.reduce((acc, a) => acc.plus(a.saldoUsd), new Decimal(0));
  let restanteGeneral = totalAsignado;

  const calculados: DepositoCalculado[] = [...depositos].sort(compareCronologico).map((d) => {
    const a = porId.get(d.asignacionId);
    if (!a) throw new Error(`Depósito ${d.id} con asignación desconocida ${d.asignacionId}`);
    const usd = toUsd(d.montoBs, d.tasaValor);
    const restanteGerente = (restantePorAsignacion.get(a.id) as Decimal).minus(usd);
    restantePorAsignacion.set(a.id, restanteGerente);
    restanteGeneral = restanteGeneral.minus(usd);
    return {
      ...d,
      gerenteId: a.gerenteId,
      gerenteNombre: a.gerenteNombre,
      usd,
      saldoGerenteRestante: restanteGerente.toFixed(2),
      saldoGeneralRestante: restanteGeneral.toFixed(2),
    };
  });

  const gerentes: GerenteResumen[] = asignaciones.map((a) => {
    const propios = calculados.filter((d) => d.asignacionId === a.id);
    return {
      asignacionId: a.id,
      gerenteId: a.gerenteId,
      gerenteNombre: a.gerenteNombre,
      ...calcResumen(a.saldoUsd, propios.map((d) => d.usd), propios.map((d) => d.fecha)),
    };
  });

  return {
    total: calcResumen(totalAsignado, calculados.map((d) => d.usd), calculados.map((d) => d.fecha)),
    gerentes,
    depositos: calculados,
  };
}

export type EstadoGerente = "sin-pagos" | "en-curso" | "completo" | "excedido";

export function estadoGerente(r: Resumen): EstadoGerente {
  const restante = new Decimal(r.restante);
  if (restante.isNegative() && !restante.isZero()) return "excedido";
  if (r.cantidad === 0) return "sin-pagos";
  return restante.lte(0) ? "completo" : "en-curso";
}

/** Búsqueda libre: referencia, banco, cuenta, gerente, observaciones y montos (con o sin separadores). */
export function coincideTexto(d: DepositoCalculado, texto: string): boolean {
  return coincideBusqueda(
    [d.referencia, d.banco, d.cuentaDestino, d.gerenteNombre, d.observaciones ?? ""],
    [formatNumberVE(d.montoBs), formatNumberVE(d.usd)],
    texto,
  );
}

export type FiltroDepositos = {
  gerenteId?: number | null;
  banco?: string | null;
  cuenta?: string | null;
  desde?: string | null;
  hasta?: string | null;
  texto?: string | null;
};
export type FilaDeposito = DepositoCalculado & { saldoMostrado: string };

export type GrupoDia<T> = { fecha: string; filas: T[]; totalBs: string; totalUsd: string };

/** Junta los depósitos seguidos del mismo día (respeta el orden recibido); los subtotales suman los USD ya redondeados. */
export function agruparPorDia<T extends { fecha: string; montoBs: string; usd: string }>(filas: T[]): GrupoDia<T>[] {
  const grupos: { fecha: string; filas: T[] }[] = [];
  for (const f of filas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.fecha === f.fecha) ultimo.filas.push(f);
    else grupos.push({ fecha: f.fecha, filas: [f] });
  }
  const sum = (fs: T[], key: "montoBs" | "usd") => fs.reduce((acc, d) => acc.plus(d[key]), new Decimal(0)).toFixed(2);
  return grupos.map((g) => ({ ...g, totalBs: sum(g.filas, "montoBs"), totalUsd: sum(g.filas, "usd") }));
}

export function filtrarDepositos(
  depositos: DepositoCalculado[],
  f: FiltroDepositos,
): { filas: FilaDeposito[]; totalBs: string; totalUsd: string; cantidad: number } {
  const banco = f.banco?.trim().toLowerCase() || null;
  const cuenta = f.cuenta?.trim().toLowerCase() || null;
  const porGerente = f.gerenteId != null;
  const filas = depositos
    .filter(
      (d) =>
        (!porGerente || d.gerenteId === f.gerenteId) &&
        (!banco || d.banco.trim().toLowerCase() === banco) &&
        (!cuenta || d.cuentaDestino.trim().toLowerCase() === cuenta) &&
        (!f.desde || d.fecha >= f.desde) &&
        (!f.hasta || d.fecha <= f.hasta) &&
        (!f.texto || coincideTexto(d, f.texto)),
    )
    .map((d) => ({ ...d, saldoMostrado: porGerente ? d.saldoGerenteRestante : d.saldoGeneralRestante }));
  const sum = (key: "montoBs" | "usd") => filas.reduce((acc, d) => acc.plus(d[key]), new Decimal(0)).toFixed(2);
  return { filas, totalBs: sum("montoBs"), totalUsd: sum("usd"), cantidad: filas.length };
}
