import { describe, expect, it } from "vitest";
import { diasHasta, validateMeta, vistaMetas, type Meta } from "./metas";

const meta = (id: number, montoUsd: string, fecha: string): Meta => ({ id, campanaId: 1, montoUsd, fecha, nota: null });

describe("vistaMetas", () => {
  it("ubica cada meta en la barra según el saldo general y la marca cumplida, vencida o pendiente", () => {
    const v = vistaMetas([meta(2, "8000", "2026-11-22"), meta(1, "5000", "2026-11-15"), meta(3, "6000", "2026-11-01")], { asignado: "10000", pagado: "5500" }, "2026-11-04");
    expect(v.metas.map((m) => [m.id, m.posicion, m.estado, m.falta])).toEqual([
      [3, 60, "vencida", "500.00"],
      [1, 50, "cumplida", "0.00"],
      [2, 80, "pendiente", "2500.00"],
    ]);
    // La próxima es la primera sin cumplir por fecha (una vencida sigue pendiente de lograr).
    expect(v.proxima?.id).toBe(3);
  });

  it("una meta mayor que el saldo general va al final y se marca fuera de escala", () => {
    const v = vistaMetas([meta(1, "12000", "2026-11-30")], { asignado: "10000", pagado: "0" }, "2026-11-04");
    expect(v.metas[0]).toMatchObject({ posicion: 100, fueraDeEscala: true, estado: "pendiente" });
  });

  it("sin saldo asignado las metas van al final; todas cumplidas = sin próxima", () => {
    expect(vistaMetas([meta(1, "10", "2026-11-30")], { asignado: "0", pagado: "0" }, "2026-11-04").metas[0].posicion).toBe(100);
    expect(vistaMetas([meta(1, "10", "2026-11-30")], { asignado: "100", pagado: "10" }, "2026-11-04").proxima).toBeNull();
  });

  it("vence el día siguiente a su fecha, no el mismo día", () => {
    expect(vistaMetas([meta(1, "10", "2026-11-04")], { asignado: "100", pagado: "0" }, "2026-11-04").metas[0].estado).toBe("pendiente");
    expect(vistaMetas([meta(1, "10", "2026-11-03")], { asignado: "100", pagado: "0" }, "2026-11-04").metas[0].estado).toBe("vencida");
  });
});

describe("validateMeta", () => {
  it("acepta monto venezolano y fecha; la nota es opcional", () => {
    expect(validateMeta({ monto: "5.000,50", fecha: "2026-11-15", nota: " " })).toEqual({ ok: true, value: { montoUsd: "5000.5", fecha: "2026-11-15", nota: null } });
  });

  it("rechaza monto vacío o cero y fecha inválida", () => {
    const r = validateMeta({ monto: "0", fecha: "", nota: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual({ monto: "Monto inválido (debe ser mayor que 0)", fecha: "Fecha inválida" });
  });
});

describe("diasHasta", () => {
  it("cuenta los días de hoy a la fecha (negativo si ya pasó)", () => {
    expect(diasHasta("2026-11-04", "2026-11-22")).toBe(18);
    expect(diasHasta("2026-11-04", "2026-11-04")).toBe(0);
    expect(diasHasta("2026-11-04", "2026-11-01")).toBe(-3);
    expect(diasHasta("2026-12-31", "2027-01-01")).toBe(1);
  });
});
