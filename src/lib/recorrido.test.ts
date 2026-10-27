import { describe, expect, it } from "vitest";
import { conRecorrido, leerRecorrido, vecinos } from "./recorrido";

describe("recorrido", () => {
  it("viaja en el state junto con el volver", () => {
    const state = conRecorrido({ volver: { to: "/asignaciones/1", label: "Ana" } }, [7, 3, 9]);
    expect(state.volver).toEqual({ to: "/asignaciones/1", label: "Ana" });
    expect(leerRecorrido(state)).toEqual([7, 3, 9]);
  });

  it("ignora estados sin una lista de ids válida", () => {
    expect(leerRecorrido(null)).toBeNull();
    expect(leerRecorrido({})).toBeNull();
    expect(leerRecorrido({ recorrido: "1,2" })).toBeNull();
    expect(leerRecorrido({ recorrido: [1, "2"] })).toBeNull();
  });

  it("da el anterior, el siguiente y la posición en el orden de la lista", () => {
    expect(vecinos([7, 3, 9], 3)).toEqual({ anterior: 7, siguiente: 9, posicion: 2, total: 3 });
    expect(vecinos([7, 3, 9], 7)).toEqual({ anterior: null, siguiente: 3, posicion: 1, total: 3 });
    expect(vecinos([7, 3, 9], 9)).toEqual({ anterior: 3, siguiente: null, posicion: 3, total: 3 });
  });

  it("un depósito que no está en la lista no tiene vecinos", () => {
    expect(vecinos([7, 3, 9], 4)).toBeNull();
  });
});
