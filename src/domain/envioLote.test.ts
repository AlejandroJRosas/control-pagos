import { expect, it } from "vitest";
import { seleccionInicial } from "./envioLote";

it("marca por defecto a quien debe y tiene un teléfono válido", () => {
  expect(
    seleccionInicial([
      { asignacionId: 1, gerenteNombre: "A", telefono: "0414-1234567", restante: "10" },
      { asignacionId: 2, gerenteNombre: "B", telefono: null, restante: "10" },
      { asignacionId: 3, gerenteNombre: "C", telefono: "0414-1234567", restante: "0" },
      { asignacionId: 4, gerenteNombre: "D", telefono: "0414-1234567", restante: "-5" },
      { asignacionId: 5, gerenteNombre: "E", telefono: "123", restante: "10" },
    ]),
  ).toEqual(new Set([1]));
});
