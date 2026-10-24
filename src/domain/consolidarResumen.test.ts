import { describe, expect, it } from "vitest";
import { mensajeConsolidado, resumenConsolidacion, tasaParaFecha } from "./consolidarResumen";
import { decisionesIniciales, type DepositoLocal, type PlanConsolidacion } from "./consolidar";
import type { AsignacionData, DepositoData } from "./campanaView";
import type { DepositoPaquete } from "./paquete";

const asignaciones: AsignacionData[] = [
  { id: 10, gerenteId: 1, gerenteNombre: "Ana", saldoUsd: "100" },
  { id: 11, gerenteId: 2, gerenteNombre: "Luis", saldoUsd: "50" },
];
const dep = (id: number, o: Partial<DepositoData> = {}): DepositoData => ({
  id, asignacionId: 10, fecha: "2026-03-02", creadoEn: `2026-03-02T10:00:0${id}.000Z`, banco: "Banesco", referencia: String(id), cuentaDestino: "0134",
  montoBs: "3650", tasaId: 1, tasaValor: "36.5", observaciones: null, imagenPath: null, ...o,
});
const rem = (o: Partial<DepositoPaquete> = {}): DepositoPaquete => ({
  uuid: "r1", asignacionUuid: "ra", fecha: "2026-03-02", banco: "Banesco", referencia: "9", cuentaDestino: "0134", montoBs: "7300",
  observaciones: null, tasaFecha: "2026-03-02", creadoEn: "2026-03-02T11:00:00.000Z", actualizadoEn: "2026-03-02T11:00:00.000Z", imagen: null, equivalentes: [], ...o,
});
const loc = (id: number, o: Partial<DepositoLocal> = {}): DepositoLocal => ({
  id, uuid: `u${id}`, asignacionId: 10, campanaId: 1, campanaNombre: "Marzo", fecha: "2026-03-02", banco: "Banesco", referencia: String(id),
  cuentaDestino: "0134", montoBs: "3650", observaciones: null, imagenPath: null, actualizadoEn: "2026-03-02T10:00:00.000Z", ...o,
});
const plan = (o: Partial<PlanConsolidacion> = {}): PlanConsolidacion => ({
  campana: { id: 1, uuid: "c1", nombre: "Marzo", estado: "activa" },
  nuevos: [], correcciones: [], conflictos: [], eliminaciones: [], vinculos: [], sinCambios: 0, masNuevasAqui: [], noIncluidos: [],
  tasasNuevas: [], tasasDistintas: [], saldos: [], equivalencias: [], agregadas: [], jefes: [], jefesLocales: new Map(), ...o,
});
const tasas = new Map([
  ["2026-03-02", { id: 1, valor: "36.5", usos: 2 }],
  ["2026-03-03", { id: 2, valor: "40", usos: 0 }],
]);

describe("tasaParaFecha", () => {
  it("la mía, la nueva del archivo, o la del archivo si se eligió", () => {
    const p = plan({ tasasNuevas: [{ fecha: "2026-03-04", valor: "37" }], tasasDistintas: [{ fecha: "2026-03-02", local: "36.5", archivo: "36" , usos: 2 }] });
    const d = decisionesIniciales(p);
    expect(tasaParaFecha(p, d, tasas, "2026-03-03")).toBe("40");
    expect(tasaParaFecha(p, d, tasas, "2026-03-04")).toBe("37");
    expect(tasaParaFecha(p, d, tasas, "2026-03-02")).toBe("36.5");
    d.tasas["2026-03-02"] = "archivo";
    expect(tasaParaFecha(p, d, tasas, "2026-03-02")).toBe("36");
  });
});

describe("resumenConsolidacion", () => {
  const base = { asignaciones, depositos: [dep(1), dep(2)] };

  it("suma los nuevos al gerente y deja fuera a los que no cambian", () => {
    const p = plan({ nuevos: [{ remoto: rem(), asignacionId: 10, tasa: { fecha: "2026-03-02", accion: "existente" } }] });
    const r = resumenConsolidacion(base, p, decisionesIniciales(p), tasas);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ asignacionId: 10, gerenteNombre: "Ana", agregado: false });
    expect(r[0].antes.pagado).toBe("200.00");
    expect(r[0].despues.pagado).toBe("400.00");
    expect(r[0].despues.cantidad).toBe(3);
  });

  it("aplica correcciones (también de gerente), conflictos del archivo, eliminaciones marcadas y montos asignados elegidos", () => {
    const p = plan({
      correcciones: [{ remoto: rem({ uuid: "u1", montoBs: "7300" }), local: loc(1), asignacionId: 11, tasa: { fecha: "2026-03-02", accion: "existente" }, cambios: [] }],
      conflictos: [{ tipo: "editadoEnAmbas", remoto: rem({ uuid: "u2", montoBs: "730" }), local: loc(2), asignacionId: 10, tasa: { fecha: "2026-03-02", accion: "existente" }, cambios: [] }],
      saldos: [{ asignacionId: 11, gerenteNombre: "Luis", local: "50", archivo: "500" }],
    });
    const d = decisionesIniciales(p);
    d.saldos[11] = "archivo";
    const r = resumenConsolidacion(base, p, d, tasas);
    const ana = r.find((x) => x.asignacionId === 10)!;
    const luis = r.find((x) => x.asignacionId === 11)!;
    expect(ana.despues.pagado).toBe("20.00"); // el conflicto quedó con 730 Bs y el 1 pasó a Luis
    expect(luis.antes.pagado).toBe("0.00");
    expect(luis.despues.pagado).toBe("200.00");
    expect(luis.despues.asignado).toBe("500.00");

    d.conflictos.u2 = "mia";
    expect(resumenConsolidacion(base, p, d, tasas).find((x) => x.asignacionId === 10)!.despues.pagado).toBe("100.00");
  });

  it("una eliminación desmarcada no cuenta y una tasa del archivo cambia todos los depósitos de esa fecha", () => {
    const p = plan({
      eliminaciones: [{ remotoUuid: "u1", local: loc(1) }],
      tasasDistintas: [{ fecha: "2026-03-02", local: "36.5", archivo: "73", usos: 2 }],
    });
    const d = decisionesIniciales(p);
    d.tasas["2026-03-02"] = "archivo";
    expect(resumenConsolidacion(base, p, d, tasas)[0].despues).toMatchObject({ pagado: "50.00", cantidad: 1 });
    d.eliminar.delete("u1");
    expect(resumenConsolidacion(base, p, d, tasas)[0].despues).toMatchObject({ pagado: "100.00", cantidad: 2 });
  });
  it("un gerente agregado empieza en cero y queda con su monto asignado y sus nuevos", () => {
    const p = plan({
      agregadas: [{ remotaUuid: "rz", asignacionId: -2, gerenteId: null, gerenteNombre: "Rosa", saldoUsd: "80" }],
      nuevos: [{ remoto: rem({ asignacionUuid: "rz" }), asignacionId: -2, tasa: { fecha: "2026-03-02", accion: "existente" } }],
    });
    const r = resumenConsolidacion(base, p, decisionesIniciales(p), tasas);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ asignacionId: -2, gerenteNombre: "Rosa", agregado: true });
    expect([r[0].antes.asignado, r[0].antes.pagado, r[0].antes.cantidad]).toEqual(["0.00", "0.00", 0]);
    expect([r[0].despues.asignado, r[0].despues.pagado, r[0].despues.cantidad]).toEqual(["80.00", "200.00", 1]);
    // sin depósitos ni monto también sale: es un gerente nuevo en la campaña
    const vacio = plan({ agregadas: [{ remotaUuid: "rz", asignacionId: -2, gerenteId: 2, gerenteNombre: "Luis", saldoUsd: "0" }] });
    expect(resumenConsolidacion(base, vacio, decisionesIniciales(vacio), tasas).map((x) => [x.gerenteNombre, x.agregado])).toEqual([["Luis", true]]);
  });
});

describe("mensajeConsolidado", () => {
  it("solo las partes distintas de cero, en singular o plural", () => {
    expect(mensajeConsolidado({ nuevos: 12, corregidos: 2, eliminados: 1 })).toBe("Consolidado: 12 nuevos, 2 corregidos, 1 eliminado");
    expect(mensajeConsolidado({ nuevos: 1, corregidos: 0, eliminados: 3 })).toBe("Consolidado: 1 nuevo, 3 eliminados");
    expect(mensajeConsolidado({ nuevos: 0, corregidos: 0, eliminados: 0 })).toBe("Consolidado");
  });
});
