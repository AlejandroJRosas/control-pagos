import { describe, expect, it } from "vitest";
import { esPaquete } from "./paquete";

describe("esPaquete", () => {
  it("reconoce .cpagos sin importar mayúsculas", () => {
    expect(esPaquete({ name: "A.CPAGOS" })).toBe(true);
    expect(esPaquete({ name: "campana.cpagos" })).toBe(true);
  });
  it("rechaza otras extensiones", () => {
    expect(esPaquete({ name: "a.zip" })).toBe(false);
  });
});
