import { describe, expect, it } from "vitest";
import { fechaDesdeDmy, normalizarDeposito, normalizarTasa } from "./normalizar";
import type { CampoCrudo } from "./tipos";

const et = (texto: string): CampoCrudo => ({ texto, certeza: "etiqueta" });
const HOY = "2026-10-18";

describe("fechaDesdeDmy", () => {
  it.each([
    ["15/10/2026", "2026-10-15"],
    ["16 / 10 / 2026", "2026-10-16"],
    ["5/3/2026", "2026-03-05"],
    ["Fecha 15/10/2026 x", "2026-10-15"],
    ["31/02/2026", null],
    ["hola", null],
  ])("%s → %s", (texto, esperado) => {
    expect(fechaDesdeDmy(texto)).toBe(esperado);
  });
});

describe("normalizarDeposito", () => {
  it("convierte los campos de un comprobante leído por etiqueta", () => {
    expect(
      normalizarDeposito(
        {
          montoBs: et("13.186,80 Bs"),
          fecha: et("15/10/2026"),
          referencia: et("059132331406"),
          banco: { texto: "Banco de Venezuela", certeza: "constante" },
          cuentaDestino: et(" M A Colecciones 2006 Ca "),
        },
        HOY,
      ),
    ).toEqual({
      montoBs: { value: "13.186,80", confidence: 0.9 },
      fecha: { value: "2026-10-15", confidence: 0.9 },
      referencia: { value: "059132331406", confidence: 0.9 },
      banco: { value: "Banco de Venezuela", confidence: 0.95 },
      cuentaDestino: { value: "M A Colecciones 2006 Ca", confidence: 0.9 },
    });
  });

  it("un campo hallado por heurística queda en 0,7", () => {
    expect(normalizarDeposito({ montoBs: { texto: "13.186,80", certeza: "heuristica" } }, HOY).montoBs).toEqual({ value: "13.186,80", confidence: 0.7 });
  });

  it("una fecha futura baja a 0,6", () => {
    expect(normalizarDeposito({ fecha: et("20/10/2026") }, HOY).fecha).toEqual({ value: "2026-10-20", confidence: 0.6 });
  });

  it.each([
    ["montoBs", "13.18x,80"],
    ["montoBs", "0,00"],
    ["referencia", "05913A"],
    ["cuentaDestino", "  "],
    ["fecha", "31/02/2026"],
  ] as const)("no propone %s = %j y deja los demás", (campo, texto) => {
    const r = normalizarDeposito({ [campo]: et(texto), banco: { texto: "Banco de Venezuela", certeza: "constante" } }, HOY);
    expect(r[campo]).toBeUndefined();
    expect(r.banco).toBeDefined();
  });
});

describe("normalizarTasa", () => {
  it("convierte valor y fecha", () => {
    expect(normalizarTasa({ valor: et("880,12"), fecha: et("16 / 10 / 2026") }, HOY)).toEqual({
      valor: { value: "880,12", confidence: 0.9 },
      fecha: { value: "2026-10-16", confidence: 0.9 },
    });
  });

  it("un punto único en la tasa es decimal", () => {
    expect(normalizarTasa({ valor: et("880.12") }, HOY).valor?.value).toBe("880,12");
  });

  it("no propone una tasa cero", () => {
    expect(normalizarTasa({ valor: et("0") }, HOY).valor).toBeUndefined();
  });
});
