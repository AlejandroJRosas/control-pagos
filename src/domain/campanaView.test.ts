import { beforeEach, describe, expect, it } from "vitest";
import { agruparPorDia, buildCampanaView, calcResumen, compareRecientePrimero, estadoGerente, filtrarDepositos, resumenesDeRama, sumarResumenes, type AsignacionData, type DepositoData } from "./campanaView";
import { armarArbol } from "./arbol";

const asig = (id: number, gerenteId: number, gerenteNombre: string, saldoUsd: string): AsignacionData => ({ id, gerenteId, gerenteNombre, saldoUsd });

let seq = 0;
beforeEach(() => {
  seq = 0;
});
type DepIn = Partial<DepositoData> & Pick<DepositoData, "asignacionId" | "fecha" | "montoBs" | "tasaValor">;
const dep = (o: DepIn): DepositoData => {
  seq += 1;
  return {
    id: seq,
    creadoEn: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    banco: "Banesco",
    referencia: `REF${seq}`,
    cuentaDestino: "0102",
    tasaId: 1,
    observaciones: null,
    imagenPath: null,
    ...o,
  };
};

describe("buildCampanaView", () => {
  it("calcula usd y saldos por gerente y general en orden cronológico", () => {
    const asignaciones = [asig(1, 10, "Ana", "100"), asig(2, 20, "Luis", "50")];
    const d1 = dep({ asignacionId: 1, fecha: "2026-03-02", montoBs: "3650", tasaValor: "36.5" }); // 100
    const d2 = dep({ asignacionId: 2, fecha: "2026-03-01", montoBs: "730", tasaValor: "36.5" }); // 20
    const d3 = dep({ asignacionId: 2, fecha: "2026-03-03", montoBs: "400", tasaValor: "40" }); // 10
    const v = buildCampanaView(asignaciones, [d1, d2, d3]);

    expect(v.depositos.map((d) => d.id)).toEqual([d2.id, d1.id, d3.id]);
    expect(v.depositos.map((d) => d.usd)).toEqual(["20.00", "100.00", "10.00"]);
    expect(v.depositos.map((d) => d.saldoGeneralRestante)).toEqual(["130.00", "30.00", "20.00"]);
    expect(v.depositos.map((d) => d.saldoGerenteRestante)).toEqual(["30.00", "0.00", "20.00"]);
    expect(v.depositos[0]).toMatchObject({ gerenteNombre: "Luis", gerenteId: 20 });

    expect(v.total).toMatchObject({ asignado: "150.00", pagado: "130.00", restante: "20.00", pct: 86.7, cantidad: 3, ultimaFecha: "2026-03-03" });
    expect(v.total.ratio).toBeCloseTo(130 / 150, 10);

    expect(v.gerentes.find((g) => g.asignacionId === 1)).toMatchObject({
      gerenteNombre: "Ana",
      asignado: "100.00",
      pagado: "100.00",
      restante: "0.00",
      pct: 100,
      cantidad: 1,
      ultimaFecha: "2026-03-02",
    });
  });

  it("misma fecha: desempata por creadoEn y luego por id", () => {
    const a = [asig(1, 10, "Ana", "100")];
    const x = dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "10", tasaValor: "1", creadoEn: "2026-03-01T10:00:00.000Z" });
    const y = dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "20", tasaValor: "1", creadoEn: "2026-03-01T09:00:00.000Z" });
    const z = dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "30", tasaValor: "1", creadoEn: "2026-03-01T09:00:00.000Z" });
    expect(buildCampanaView(a, [x, z, y]).depositos.map((d) => d.id)).toEqual([y.id, z.id, x.id]);
  });

  it("pago de más: restante negativo, pct limitado a 100 y ratio real", () => {
    const v = buildCampanaView([asig(1, 10, "Ana", "10")], [dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "15", tasaValor: "1" })]);
    expect(v.gerentes[0]).toMatchObject({ restante: "-5.00", pct: 100, ratio: 1.5 });
    expect(v.depositos[0].saldoGerenteRestante).toBe("-5.00");
  });

  it("gerente sin depósitos y campaña vacía", () => {
    const v = buildCampanaView([asig(1, 10, "Ana", "80")], []);
    expect(v.gerentes[0]).toMatchObject({ pagado: "0.00", restante: "80.00", pct: 0, ratio: 0, cantidad: 0, ultimaFecha: null });
    expect(buildCampanaView([], []).total).toEqual({ asignado: "0.00", pagado: "0.00", restante: "0.00", ratio: 0, pct: 0, cantidad: 0, ultimaFecha: null });
  });

  it("falla si un depósito apunta a una asignación desconocida", () => {
    expect(() => buildCampanaView([], [dep({ asignacionId: 99, fecha: "2026-03-01", montoBs: "1", tasaValor: "1" })])).toThrow(/asignación desconocida/);
  });
});

describe("filtrarDepositos", () => {
  const asignaciones = [asig(1, 10, "Ana", "100"), asig(2, 20, "Luis", "100")];
  const build = () =>
    buildCampanaView(asignaciones, [
      dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "10", tasaValor: "1", banco: "Banesco" }),
      dep({ asignacionId: 2, fecha: "2026-03-02", montoBs: "20", tasaValor: "1", banco: "Mercantil" }),
      dep({ asignacionId: 1, fecha: "2026-03-03", montoBs: "30", tasaValor: "1", banco: " banesco " }),
    ]);

  it("sin filtro muestra el saldo general", () => {
    const r = filtrarDepositos(build().depositos, {});
    expect(r.filas.map((f) => f.saldoMostrado)).toEqual(["190.00", "170.00", "140.00"]);
    expect(r).toMatchObject({ totalBs: "60.00", totalUsd: "60.00", cantidad: 3 });
  });

  it("filtrando por gerente muestra el saldo del gerente", () => {
    const r = filtrarDepositos(build().depositos, { gerenteId: 10 });
    expect(r.filas.map((f) => f.saldoMostrado)).toEqual(["90.00", "60.00"]);
    expect(r.totalUsd).toBe("40.00");
  });

  it("banco sin distinguir mayúsculas ni espacios y rango de fechas inclusivo", () => {
    expect(filtrarDepositos(build().depositos, { banco: "BANESCO" }).cantidad).toBe(2);
    expect(filtrarDepositos(build().depositos, { desde: "2026-03-02", hasta: "2026-03-03" }).cantidad).toBe(2);
  });

  it("busca texto en referencia, banco, gerente y observaciones sin distinguir mayúsculas ni acentos", () => {
    const v = buildCampanaView(asignaciones, [
      dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "1234567.89", tasaValor: "1", referencia: "000123", observaciones: "Pagó en Caracas" }),
      dep({ asignacionId: 2, fecha: "2026-03-02", montoBs: "20", tasaValor: "1", banco: "Mercantil" }),
    ]);
    const ids = (texto: string) => filtrarDepositos(v.depositos, { texto }).filas.map((f) => f.id);
    expect(ids("0001")).toEqual([1]);
    expect(ids("MERCANTIL")).toEqual([2]);
    expect(ids("luis")).toEqual([2]);
    expect(ids("pago en caracas")).toEqual([1]);
    expect(ids("  ")).toEqual([1, 2]);
  });

  it("busca montos con o sin separadores", () => {
    const v = buildCampanaView(asignaciones, [
      dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "1234567.89", tasaValor: "1" }),
      dep({ asignacionId: 2, fecha: "2026-03-02", montoBs: "20", tasaValor: "1" }),
    ]);
    const ids = (texto: string) => filtrarDepositos(v.depositos, { texto }).filas.map((f) => f.id);
    expect(ids("1.234.567")).toEqual([1]);
    expect(ids("1234567,89")).toEqual([1]);
    expect(ids("1234")).toEqual([1]);
    expect(ids("20,00")).toEqual([2]);
  });
});

describe("estadoGerente", () => {
  const estado = (asignado: string, usds: string[]) => estadoGerente(calcResumen(asignado, usds, usds.map(() => "2026-03-01")));
  it("distingue sin pagos, en curso, completo y pagado de más", () => {
    expect(estado("100", [])).toBe("sin-pagos");
    expect(estado("100", ["40"])).toBe("en-curso");
    expect(estado("100", ["40", "60"])).toBe("completo");
    expect(estado("100", ["40", "60.01"])).toBe("excedido");
    expect(estado("0", [])).toBe("sin-pagos");
  });
});

describe("sumarResumenes", () => {
  it("suma los gerentes y saca el avance del total, no del promedio", () => {
    const a = calcResumen("100", ["100"], ["2026-03-02"]);
    const b = calcResumen("300", ["30", "120.5"], ["2026-03-05", "2026-03-01"]);
    const c = calcResumen("50", ["60"], ["2026-03-03"]);
    expect(sumarResumenes([a, b, c])).toEqual({
      asignado: "450.00",
      pagado: "310.50",
      restante: "139.50",
      ratio: 0.69,
      pct: 69,
      cantidad: 4,
      ultimaFecha: "2026-03-05",
    });
  });

  it("coincide con el total de la campaña sin filtros", () => {
    const view = buildCampanaView(
      [asig(1, 10, "Ana", "100"), asig(2, 20, "Luis", "50")],
      [
        dep({ asignacionId: 1, fecha: "2026-03-02", montoBs: "3650", tasaValor: "36.5" }),
        dep({ asignacionId: 2, fecha: "2026-03-03", montoBs: "2555", tasaValor: "36.5" }),
      ],
    );
    expect(sumarResumenes(view.gerentes)).toEqual(view.total);
  });

  it("sin gerentes da ceros", () => {
    expect(sumarResumenes([])).toMatchObject({ asignado: "0.00", pagado: "0.00", restante: "0.00", pct: 0, cantidad: 0, ultimaFecha: null });
  });
});

describe("resumenesDeRama", () => {
  it("suma a cada jefe con toda su gente (todos los niveles); los que no tienen gente no llevan", () => {
    const g = (id: number, asignado: string, usds: string[], fechas: string[]) => ({ id, ...calcResumen(asignado, usds, fechas) });
    const gerentes = [g(1, "1000", ["800"], ["2026-03-02"]), g(2, "1200", ["900"], ["2026-03-05"]), g(3, "800", ["400"], ["2026-03-01"]), g(4, "100", [], [])];
    const jefes = new Map([
      [2, 1],
      [3, 2],
    ]);
    const ramas = resumenesDeRama(armarArbol(gerentes, (x) => x.id, jefes), (x) => x.id);
    expect([...ramas.keys()].sort()).toEqual([1, 2]);
    expect(ramas.get(1)).toEqual(sumarResumenes(gerentes.slice(0, 3)));
    expect(ramas.get(1)).toMatchObject({ asignado: "3000.00", pagado: "2100.00", restante: "900.00", pct: 70, cantidad: 3, ultimaFecha: "2026-03-05" });
    expect(ramas.get(2)).toEqual(sumarResumenes(gerentes.slice(1, 3)));
  });
});

describe("compareRecientePrimero", () => {
  it("días del más reciente al más viejo y, dentro del día, en el orden en que se registraron", () => {
    const d = (id: number, fecha: string, creadoEn: string) => ({ id, fecha, creadoEn });
    const filas = [
      d(1, "2026-03-01", "2026-03-01T10:00:00.000Z"),
      d(2, "2026-03-02", "2026-03-02T15:00:00.000Z"),
      d(3, "2026-03-02", "2026-03-02T09:00:00.000Z"),
      d(5, "2026-03-02", "2026-03-02T09:00:00.000Z"),
      d(4, "2026-03-03", "2026-03-03T08:00:00.000Z"),
    ];
    expect(filas.sort(compareRecientePrimero).map((f) => f.id)).toEqual([4, 3, 5, 2, 1]);
  });
});

describe("agruparPorDia", () => {
  it("junta los depósitos seguidos del mismo día, en el orden en que vienen, con sus subtotales", () => {
    const d = (id: number, fecha: string, montoBs: string, usd: string) => ({ id, fecha, montoBs, usd });
    const grupos = agruparPorDia([d(1, "2026-03-03", "100", "2.74"), d(2, "2026-03-03", "50.5", "1.38"), d(3, "2026-03-02", "10", "0.27")]);
    expect(grupos).toEqual([
      { fecha: "2026-03-03", filas: [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })], totalBs: "150.50", totalUsd: "4.12" },
      { fecha: "2026-03-02", filas: [expect.objectContaining({ id: 3 })], totalBs: "10.00", totalUsd: "0.27" },
    ]);
  });

  it("sin depósitos no hay grupos", () => {
    expect(agruparPorDia([])).toEqual([]);
  });
});
