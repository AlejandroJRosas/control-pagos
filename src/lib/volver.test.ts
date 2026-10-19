import { describe, expect, it } from "vitest";
import { conVolver, leerVolver } from "./volver";

describe("volver", () => {
  it("lee el destino que dejó la pantalla de origen", () => {
    const state = conVolver({ pathname: "/campanas/3", search: "?banco=BDV" }, "Campaña 1");
    expect(leerVolver(state)).toEqual({ to: "/campanas/3?banco=BDV", label: "Campaña 1" });
  });

  it("ignora estados que no traen un destino válido", () => {
    expect(leerVolver(null)).toBeNull();
    expect(leerVolver(undefined)).toBeNull();
    expect(leerVolver({})).toBeNull();
    expect(leerVolver({ volver: { to: 5, label: "x" } })).toBeNull();
    expect(leerVolver({ volver: { to: "", label: "x" } })).toBeNull();
    expect(leerVolver({ volver: { to: "https://otro.sitio", label: "x" } })).toBeNull();
  });
});
