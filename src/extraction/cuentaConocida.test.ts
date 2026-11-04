import { expect, it } from "vitest";
import { ajustarCuentaDestino } from "./cuentaConocida";

const f = { cuentaDestino: { value: "Inversiones Xyz CA", confidence: 0.9 }, montoBs: { value: "10", confidence: 0.9 } };

it("baja a 0,7 una cuenta que no se usó nunca", () => {
  const r = ajustarCuentaDestino(f, ["Inversiones ABC CA"]);
  expect(r.cuentaDestino?.confidence).toBe(0.7);
  expect(r.montoBs?.confidence).toBe(0.9);
});

it("deja igual una conocida (sin mayúsculas, acentos ni espacios)", () => {
  expect(ajustarCuentaDestino(f, ["inversiones  xyz ca"]).cuentaDestino?.confidence).toBe(0.9);
});

it("sin cuentas registradas no cambia nada", () => {
  expect(ajustarCuentaDestino(f, [])).toEqual(f);
});

it("no sube una confianza que ya era menor", () => {
  expect(ajustarCuentaDestino({ cuentaDestino: { value: "x", confidence: 0.6 } }, ["y"]).cuentaDestino?.confidence).toBe(0.6);
});

it("una variante recordada pasa al nombre unificado sin bajar la confianza", () => {
  const alias = new Map([["inversionesxyzca", "Inversiones XYZ, C.A."]]);
  expect(ajustarCuentaDestino(f, ["Inversiones XYZ, C.A."], alias).cuentaDestino).toEqual({ value: "Inversiones XYZ, C.A.", confidence: 0.9 });
});

it("sin cuenta leída no cambia nada", () => {
  expect(ajustarCuentaDestino({ montoBs: { value: "1", confidence: 0.9 } }, ["y"])).toEqual({ montoBs: { value: "1", confidence: 0.9 } });
});

it("una cuenta parecida a una sola conocida (letras de menos o de más) propone la conocida para revisar", () => {
  const conocidas = ["M A Colecciones 2006 Ca", "Inversiones Mariandres CA"];
  // El OCR perdió la "M".
  expect(ajustarCuentaDestino({ cuentaDestino: { value: "A Colecciones 2006 Ca", confidence: 0.9 } }, conocidas).cuentaDestino).toEqual({
    value: "M A Colecciones 2006 Ca",
    confidence: 0.7,
  });
  // Confundió dos letras.
  expect(ajustarCuentaDestino({ cuentaDestino: { value: "Inversiones Mariandrcs CO", confidence: 0.9 } }, conocidas).cuentaDestino?.value).toBe("Inversiones Mariandres CA");
});

it("si se parece a dos conocidas por igual, o la diferencia es grande, no propone ninguna", () => {
  expect(ajustarCuentaDestino({ cuentaDestino: { value: "Cuenta B", confidence: 0.9 } }, ["Cuenta A", "Cuenta C"]).cuentaDestino).toEqual({ value: "Cuenta B", confidence: 0.7 });
  expect(ajustarCuentaDestino(f, ["Inversiones ABC CA"]).cuentaDestino?.value).toBe("Inversiones Xyz CA");
});
