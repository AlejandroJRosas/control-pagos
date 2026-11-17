import { describe, expect, it } from "vitest";
import { contarCumplimiento, cumplimientoGerente, diasHasta, metaPorDefecto, parsePorcentaje, validateMeta, vistaMetas, type Meta } from "./metas";

const meta = (id: number, montoUsd: string, fecha: string): Meta => ({ id, campanaId: 1, montoUsd, porcentaje: null, fecha, nota: null });
const metaPct = (id: number, porcentaje: string, fecha: string): Meta => ({ id, campanaId: 1, montoUsd: null, porcentaje, fecha, nota: null });

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
    expect(validateMeta({ tipo: "monto", monto: "5.000,50", porcentaje: "40", fecha: "2026-11-15", nota: " " })).toEqual({
      ok: true,
      value: { montoUsd: "5000.5", porcentaje: null, fecha: "2026-11-15", nota: null },
    });
  });

  it("rechaza monto vacío o cero y fecha inválida", () => {
    const r = validateMeta({ tipo: "monto", monto: "0", porcentaje: "", fecha: "", nota: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual({ monto: "Monto inválido (debe ser mayor que 0)", fecha: "Fecha inválida" });
  });
});

describe("metas por porcentaje", () => {
  it("el equivalente sale del saldo asignado y la marca va en el porcentaje", () => {
    const [m] = vistaMetas([metaPct(1, "60", "2026-11-30")], { asignado: "10000", pagado: "5500" }, "2026-11-04").metas;
    expect(m).toMatchObject({ montoUsd: "6000.00", porcentaje: "60", posicion: 60, estado: "pendiente", falta: "500.00", fueraDeEscala: false });
    expect(vistaMetas([metaPct(1, "60", "2026-11-30")], { asignado: "10000", pagado: "6000" }, "2026-11-04").metas[0].estado).toBe("cumplida");
  });

  it("el equivalente redondea a 2 decimales", () => {
    expect(vistaMetas([metaPct(1, "50", "2026-11-30")], { asignado: "333.33", pagado: "0" }, "2026-11-04").metas[0].montoUsd).toBe("166.67");
  });

  it("sin saldo asignado una meta de porcentaje no se cumple", () => {
    const [m] = vistaMetas([metaPct(1, "50", "2026-11-30")], { asignado: "0", pagado: "0" }, "2026-11-04").metas;
    expect(m).toMatchObject({ estado: "pendiente", posicion: 50 });
  });

  it("valida el porcentaje (coma o punto, de 0 a 100)", () => {
    expect(validateMeta({ tipo: "porcentaje", monto: "50", porcentaje: "60,5", fecha: "2026-11-15", nota: "" })).toEqual({
      ok: true,
      value: { montoUsd: null, porcentaje: "60.5", fecha: "2026-11-15", nota: null },
    });
    expect(parsePorcentaje("60.5")).toBe("60.5");
    expect(parsePorcentaje("100")).toBe("100");
    for (const malo of ["0", "101", "abc", ""]) {
      const r = validateMeta({ tipo: "porcentaje", monto: "", porcentaje: malo, fecha: "2026-11-15", nota: "" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toEqual({ porcentaje: "Porcentaje inválido (de 0 a 100)" });
    }
  });

  it("cumplimiento de cada gerente sobre su propio saldo", () => {
    const m = metaPct(1, "60", "2026-11-30");
    expect(cumplimientoGerente(m, { asignado: "10000", pagado: "6500" })).toEqual({ cumplida: true, equivalente: "6000.00", falta: "0.00" });
    expect(cumplimientoGerente(m, { asignado: "10000", pagado: "3000" })).toEqual({ cumplida: false, equivalente: "6000.00", falta: "3000.00" });
    expect(cumplimientoGerente(m, { asignado: "0", pagado: "0" })).toBeNull();
    expect(cumplimientoGerente(meta(2, "100", "2026-11-30"), { asignado: "10000", pagado: "0" })).toBeNull();
    expect(
      contarCumplimiento(m, [
        { asignado: "100", pagado: "60" },
        { asignado: "100", pagado: "10" },
        { asignado: "0", pagado: "0" },
      ]),
    ).toEqual({ cumplieron: 1, noCumplieron: 1 });
  });

  it("la meta por defecto es la primera de porcentaje sin cumplir; si todas se cumplieron, la última", () => {
    const total = { asignado: "100", pagado: "55" };
    const v = (ms: Meta[]) => vistaMetas(ms, total, "2026-11-04").metas;
    expect(metaPorDefecto(v([meta(1, "90", "2026-11-05"), metaPct(2, "50", "2026-11-10"), metaPct(3, "80", "2026-11-20")]))?.id).toBe(3);
    expect(metaPorDefecto(v([metaPct(2, "50", "2026-11-10"), metaPct(3, "40", "2026-11-20")]))?.id).toBe(3);
    expect(metaPorDefecto(v([meta(1, "90", "2026-11-05")]))).toBeNull();
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
