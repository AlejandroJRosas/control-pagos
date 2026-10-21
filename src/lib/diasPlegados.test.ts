import { describe, expect, it } from "vitest";
import { alternarDia, normalizarPlegados, plegarDias } from "./diasPlegados";

describe("alternarDia", () => {
  it("pliega un día desplegado y despliega uno plegado", () => {
    expect(alternarDia([], "2026-03-03")).toEqual(["2026-03-03"]);
    expect(alternarDia(["2026-03-02", "2026-03-03"], "2026-03-03")).toEqual(["2026-03-02"]);
  });
});

describe("plegarDias", () => {
  it("pliega los días dados sin repetir los que ya estaban", () => {
    expect(plegarDias(["2026-03-02"], ["2026-03-02", "2026-03-03"], true)).toEqual(["2026-03-02", "2026-03-03"]);
  });

  it("despliega solo los días dados (los de otros filtros u órdenes se conservan)", () => {
    expect(plegarDias(["2026-03-01", "2026-03-02", "2026-03-03"], ["2026-03-02", "2026-03-03"], false)).toEqual(["2026-03-01"]);
  });
});

describe("normalizarPlegados", () => {
  it("acepta solo una lista de fechas", () => {
    expect(normalizarPlegados(["2026-03-03", 5, "x", "2026-03-03"])).toEqual(["2026-03-03"]);
    expect(normalizarPlegados({ a: 1 })).toEqual([]);
    expect(normalizarPlegados(null)).toEqual([]);
  });
});
