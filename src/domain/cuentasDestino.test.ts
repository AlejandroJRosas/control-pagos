import { describe, expect, it } from "vitest";
import { cuentaCanonica, cuentasDeCampana, variantesParaRecordar } from "./cuentasDestino";

it("cuentasDeCampana: sin repetidas ni vacías, sin espacios de más y en orden alfabético", () => {
  const depositos = [{ cuentaDestino: "Mercantil 1234" }, { cuentaDestino: " Banesco 5678 " }, { cuentaDestino: "" }, { cuentaDestino: "Banesco 5678" }];
  expect(cuentasDeCampana(depositos)).toEqual(["Banesco 5678", "Mercantil 1234"]);
});

describe("cuentaCanonica", () => {
  const alias = new Map([["myacolecciones2006ca", "M A Colecciones 2006 CA"]]);

  it("una variante recordada pasa al nombre unificado, sin importar mayúsculas, acentos ni espacios", () => {
    expect(cuentaCanonica("MYA Colecciones 2006 ca", alias)).toBe("M A Colecciones 2006 CA");
    expect(cuentaCanonica("  mya colécciones 2006  CA ", alias)).toBe("M A Colecciones 2006 CA");
  });

  it("una cuenta sin variante recordada queda tal cual", () => {
    expect(cuentaCanonica(" Otra Cuenta ", alias)).toBe(" Otra Cuenta ");
  });
});

describe("variantesParaRecordar", () => {
  it("propone los nombres viejos distintos del nuevo, una vez cada uno y con cuántos depósitos lo tienen", () => {
    const viejas = ["MYA Colecciones 2006 ca", "mya colecciones 2006 CA", "M A Colecciones 2006 CA", "", "MA Colecciones"];
    expect(variantesParaRecordar(viejas, "M A Colecciones 2006 CA", new Map())).toEqual([
      { variante: "MA Colecciones", depositos: 1, unificada: false },
      { variante: "MYA Colecciones 2006 ca", depositos: 2, unificada: false },
    ]);
  });

  it("no propone una variante que ya apunta a la cuenta nueva", () => {
    const alias = new Map([["myacolecciones2006ca", "M A Colecciones 2006 CA"]]);
    expect(variantesParaRecordar(["MYA Colecciones 2006 ca"], "M A Colecciones 2006 CA", alias)).toEqual([]);
  });

  it("compara con el nombre unificado de la cuenta nueva si esta es una variante", () => {
    const alias = new Map([["myacolecciones2006ca", "M A Colecciones 2006 CA"]]);
    expect(variantesParaRecordar(["M A Colecciones 2006 CA"], "MYA Colecciones 2006 ca", alias)).toEqual([]);
  });

  it("marca como unificada la que ya es el nombre unificado de otras variantes (probablemente una corrección)", () => {
    const alias = new Map([["inversionesxyz", "Inversiones XYZ CA"]]);
    expect(variantesParaRecordar(["Inversiones XYZ CA"], "M A Colecciones 2006 CA", alias)).toEqual([
      { variante: "Inversiones XYZ CA", depositos: 1, unificada: true },
    ]);
  });
});
