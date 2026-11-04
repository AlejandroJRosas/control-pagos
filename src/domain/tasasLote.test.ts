import { describe, expect, it } from "vitest";
import { diasSinTasa, planTasasLote, type TasaExistente } from "./tasasLote";

const SIN: ReadonlySet<string> = new Set();

describe("diasSinTasa", () => {
  it("lista los días hábiles sin tasa desde la última hasta la que rige hoy", () => {
    // Última: jueves 29/10. Hoy miércoles 04/11.
    expect(diasSinTasa("2026-11-04", "2026-10-29", new Set(["2026-10-29"]), SIN)).toEqual(["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04"]);
  });

  it("salta feriados y los días que ya tienen tasa", () => {
    const con = new Set(["2026-10-29", "2026-11-03"]);
    expect(diasSinTasa("2026-11-04", "2026-11-03", con, new Set(["2026-11-02"]))).toEqual(["2026-11-04"]);
    expect(diasSinTasa("2026-11-04", "2026-10-29", con, new Set(["2026-11-02"]))).toEqual(["2026-10-30", "2026-11-04"]);
  });

  it("en fin de semana llega hasta el lunes, cuya tasa ya rige", () => {
    expect(diasSinTasa("2026-11-07", "2026-11-05", new Set(["2026-11-05"]), SIN)).toEqual(["2026-11-06", "2026-11-09"]);
  });

  it("sin tasas, solo la que rige hoy; al día, nada", () => {
    expect(diasSinTasa("2026-11-04", null, SIN, SIN)).toEqual(["2026-11-04"]);
    expect(diasSinTasa("2026-11-04", "2026-11-04", new Set(["2026-11-04"]), SIN)).toEqual([]);
  });

  it("no retrocede más de un mes aunque la última sea vieja", () => {
    const dias = diasSinTasa("2026-11-04", "2026-01-05", SIN, SIN);
    expect(dias[0] >= "2026-10-05").toBe(true);
    expect(dias[dias.length - 1]).toBe("2026-11-04");
  });
});

describe("planTasasLote", () => {
  const existentes = new Map<string, TasaExistente>([["2026-11-02", { id: 7, valor: "219.45", usos: 3 }]]);

  it("crea las nuevas, corrige las que cambian y salta las vacías o iguales", () => {
    const p = planTasasLote(
      [
        { fecha: "2026-10-30", valor: "218,00" },
        { fecha: "2026-11-03", valor: "" },
        { fecha: "2026-11-02", valor: "220,10" },
        { fecha: "2026-11-04", valor: "221" },
      ],
      existentes,
      SIN,
    );
    expect(p.errores).toEqual([null, null, null, null]);
    expect(p.cambios).toEqual([
      { tipo: "nueva", fecha: "2026-10-30", valor: "218" },
      { tipo: "corregir", fecha: "2026-11-02", valor: "220.1", id: 7, antes: "219.45", usos: 3 },
      { tipo: "nueva", fecha: "2026-11-04", valor: "221" },
    ]);
    expect(p.afectados).toBe(3);
  });

  it("una existente con el mismo valor (o vacía) no cambia", () => {
    expect(planTasasLote([{ fecha: "2026-11-02", valor: "219,450" }], existentes, SIN).cambios).toEqual([]);
    expect(planTasasLote([{ fecha: "2026-11-02", valor: "" }], existentes, SIN).cambios).toEqual([]);
  });

  it("marca el error de cada fila y no la incluye", () => {
    const p = planTasasLote(
      [
        { fecha: "2026-10-31", valor: "218" },
        { fecha: "2026-11-02", valor: "abc" },
        { fecha: "2026-11-05", valor: "221" },
        { fecha: "2026-11-05", valor: "222" },
        { fecha: "", valor: "223" },
        { fecha: "2026-10-12", valor: "200" },
      ],
      existentes,
      new Set(["2026-10-12"]),
    );
    expect(p.errores).toEqual([
      "Sábado: usa la tasa del lunes 02/11/2026",
      "Tasa inválida (ej. 36,50)",
      null,
      "Fecha repetida",
      "Fecha inválida",
      "Feriado: usa la tasa del martes 13/10/2026",
    ]);
    expect(p.cambios).toEqual([{ tipo: "nueva", fecha: "2026-11-05", valor: "221" }]);
  });
});
