import { expect, it } from "vitest";
import type { AsignacionData, DepositoData } from "./campanaView";
import { buildResumenGeneral, type CampanaConDatos } from "./resumenGeneral";

const asig = (id: number, gerenteId: number, gerenteNombre: string, saldoUsd: string): AsignacionData => ({ id, gerenteId, gerenteNombre, saldoUsd });
let sig = 1;
const dep = (asignacionId: number, fecha: string, montoBs: string, tasaValor = "10"): DepositoData => ({
  id: sig++,
  asignacionId,
  fecha,
  creadoEn: `${fecha}T10:00:00.000Z`,
  banco: "Banesco",
  referencia: String(sig),
  cuentaDestino: "",
  montoBs,
  tasaId: 1,
  tasaValor,
  observaciones: null,
  imagenPath: null,
});

const marzo: CampanaConDatos = {
  campanaId: 1,
  campanaNombre: "Marzo",
  enCola: 2,
  asignaciones: [asig(10, 1, "Ana", "100"), asig(11, 2, "Luis", "50")],
  depositos: [dep(10, "2026-10-01", "300"), dep(10, "2026-10-15", "200"), dep(11, "2026-10-19", "600")], // Ana 50, Luis 60 (de más)
};
const abril: CampanaConDatos = {
  campanaId: 2,
  campanaNombre: "Abril",
  enCola: 0,
  asignaciones: [asig(20, 2, "Luis", "80"), asig(21, 3, "Pedro", "30")],
  depositos: [dep(20, "2026-10-12", "200")], // Luis 20
};

it("suma las campañas y resume cada una con lo depositado en los últimos 7 días", () => {
  const r = buildResumenGeneral([marzo, abril], "2026-10-19");
  expect(r.total).toMatchObject({ asignado: "260.00", pagado: "130.00", restante: "130.00", cantidad: 4, ultimaFecha: "2026-10-19" });
  expect(r.semana).toEqual({ desde: "2026-10-13", usd: "80.00", cantidad: 2 });
  expect(r.campanas.map((c) => [c.campanaNombre, c.gerentes, c.pagado, c.restante, c.semanaUsd, c.semanaCantidad, c.enCola])).toEqual([
    ["Marzo", 2, "110.00", "40.00", "80.00", 2, 2],
    ["Abril", 2, "20.00", "90.00", "0.00", 0, 0],
  ]);
});

it("ordena a los gerentes por lo que deben, sin que un pago de más en una campaña descuente otra", () => {
  const r = buildResumenGeneral([marzo, abril], "2026-10-19");
  // Luis: pagó 10 de más en Marzo, debe 60 en Abril → debe 60, no 50.
  expect(r.deudores).toEqual([
    { gerenteId: 2, gerenteNombre: "Luis", debe: "60.00", campanas: 1 },
    { gerenteId: 1, gerenteNombre: "Ana", debe: "50.00", campanas: 1 },
    { gerenteId: 3, gerenteNombre: "Pedro", debe: "30.00", campanas: 1 },
  ]);
});

it("deja fuera a quien ya pagó todo y cuenta las campañas con saldo de cada gerente", () => {
  const mayo: CampanaConDatos = { campanaId: 3, campanaNombre: "Mayo", enCola: 0, asignaciones: [asig(30, 1, "Ana", "10")], depositos: [] };
  const junio: CampanaConDatos = {
    campanaId: 4,
    campanaNombre: "Junio",
    enCola: 0,
    asignaciones: [asig(40, 1, "Ana", "5"), asig(41, 4, "Rosa", "20")],
    depositos: [dep(41, "2026-10-02", "200")],
  };
  expect(buildResumenGeneral([mayo, junio], "2026-10-19").deudores).toEqual([{ gerenteId: 1, gerenteNombre: "Ana", debe: "15.00", campanas: 2 }]);
});

it("sin campañas todo queda en cero", () => {
  const r = buildResumenGeneral([], "2026-10-19");
  expect(r.total).toMatchObject({ asignado: "0.00", pagado: "0.00", cantidad: 0, ultimaFecha: null });
  expect(r.campanas).toEqual([]);
  expect(r.deudores).toEqual([]);
});
