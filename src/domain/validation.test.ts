import { describe, expect, it } from "vitest";
import { validateCampana, validateDeposito, validateGerente, validateSaldo, validateTasa, type DepositoDraft } from "./validation";

const draft = (o: Partial<DepositoDraft> = {}): DepositoDraft => ({
  fecha: "2026-03-02",
  banco: " Banesco ",
  referencia: " 0012345 ",
  cuentaDestino: "0102-0000-00-0000000000",
  montoBs: "3.650,00",
  tasaId: 7,
  observaciones: "  ",
  ...o,
});

describe("validateDeposito", () => {
  it("normaliza un borrador válido", () => {
    expect(validateDeposito(draft())).toEqual({
      ok: true,
      value: {
        fecha: "2026-03-02",
        banco: "Banesco",
        referencia: "0012345",
        cuentaDestino: "0102-0000-00-0000000000",
        montoBs: "3650",
        tasaId: 7,
        observaciones: null,
      },
    });
  });

  it("reporta cada campo inválido", () => {
    const r = validateDeposito(draft({ fecha: "", banco: "", referencia: " ", cuentaDestino: "", montoBs: "0", tasaId: null }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["banco", "cuentaDestino", "fecha", "montoBs", "referencia", "tasaId"]);
  });
});

describe("validateTasa", () => {
  it("acepta y normaliza", () => {
    expect(validateTasa({ fecha: "2026-03-02", valor: "36,50", notas: "" })).toEqual({
      ok: true,
      value: { fecha: "2026-03-02", valor: "36.5", notas: null },
    });
  });
  it("un punto solo en la tasa es decimal: 36.500 es 36,5 y no 36.500", () => {
    expect(validateTasa({ fecha: "2026-03-02", valor: "36.500", notas: "" })).toMatchObject({ ok: true, value: { valor: "36.5" } });
  });
  it("rechaza valor 0 y fecha inválida", () => {
    const r = validateTasa({ fecha: "x", valor: "0", notas: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["fecha", "valor"]);
  });
});

describe("validateSaldo", () => {
  it("acepta positivos y rechaza 0 o texto", () => {
    expect(validateSaldo("1.500,50")).toEqual({ ok: true, value: "1500.5" });
    expect(validateSaldo("0").ok).toBe(false);
    expect(validateSaldo("abc").ok).toBe(false);
  });
});

describe("validateCampana", () => {
  it("acepta sin fecha fin", () => {
    expect(validateCampana({ nombre: " Marzo ", fechaInicio: "2026-03-01", fechaFin: "", notas: "" })).toEqual({
      ok: true,
      value: { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null },
    });
  });
  it("rechaza fin anterior al inicio y nombre vacío", () => {
    const r = validateCampana({ nombre: "", fechaInicio: "2026-03-10", fechaFin: "2026-03-01", notas: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["fechaFin", "nombre"]);
  });
});

describe("validateGerente", () => {
  it("requiere nombre", () => {
    expect(validateGerente({ nombre: " Ana ", telefono: "" })).toEqual({ ok: true, value: { nombre: "Ana", telefono: null } });
    expect(validateGerente({ nombre: " ", telefono: "" }).ok).toBe(false);
  });
});
