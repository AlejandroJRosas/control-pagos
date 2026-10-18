import { expect, it } from "vitest";
import { aplicarExtraccion, autollenadoExistente, autollenadoNuevo, marcarTocado } from "./autollenado";

type F = "fecha" | "monto";
const DEFAULTS: Record<F, string> = { fecha: "2026-10-18", monto: "" };
const p = (value: string, confidence = 0.9) => ({ value, confidence });

it("llena la fecha por defecto porque cuenta como sin tocar", () => {
  const r = aplicarExtraccion({ ...DEFAULTS }, autollenadoNuevo<F>(), { fecha: p("2026-10-15") }, DEFAULTS);
  expect(r.valores.fecha).toBe("2026-10-15");
  expect(r.auto.estado.fecha).toBe("ocr");
  expect(r.auto.confianza.fecha).toBe(0.9);
});

it("no pisa un campo tocado", () => {
  const a = marcarTocado(autollenadoNuevo<F>(), "monto");
  const r = aplicarExtraccion({ ...DEFAULTS, monto: "5" }, a, { monto: p("13.186,80") }, DEFAULTS);
  expect(r.valores.monto).toBe("5");
  expect(r.auto.confianza.monto).toBeUndefined();
});

it("en un registro existente solo llena los vacíos", () => {
  const valores = { fecha: "2026-10-01", monto: "" };
  const r = aplicarExtraccion(valores, autollenadoExistente<F>(valores), { fecha: p("2026-10-15"), monto: p("10,00") }, DEFAULTS);
  expect(r.valores).toEqual({ fecha: "2026-10-01", monto: "10,00" });
});

it("reemplazar la imagen limpia lo que puso el OCR y no trae la nueva", () => {
  const r1 = aplicarExtraccion({ ...DEFAULTS }, autollenadoNuevo<F>(), { fecha: p("2026-10-15"), monto: p("10,00") }, DEFAULTS);
  const r2 = aplicarExtraccion(r1.valores, r1.auto, { fecha: p("2026-10-16", 0.7) }, DEFAULTS);
  expect(r2.valores).toEqual({ fecha: "2026-10-16", monto: "" });
  expect(r2.auto).toEqual({ estado: { fecha: "ocr" }, confianza: { fecha: 0.7 } });
});

it("quitar la imagen restaura los valores por defecto de los campos del OCR", () => {
  const r1 = aplicarExtraccion({ ...DEFAULTS }, autollenadoNuevo<F>(), { fecha: p("2026-10-15") }, DEFAULTS);
  const r2 = aplicarExtraccion(r1.valores, r1.auto, {}, DEFAULTS);
  expect(r2.valores.fecha).toBe(DEFAULTS.fecha);
  expect(r2.auto).toEqual({ estado: {}, confianza: {} });
});

it("un campo del OCR que la usuaria editó ya no se limpia", () => {
  const r1 = aplicarExtraccion({ ...DEFAULTS }, autollenadoNuevo<F>(), { monto: p("10,00") }, DEFAULTS);
  const editado = marcarTocado(r1.auto, "monto");
  const r2 = aplicarExtraccion({ ...r1.valores, monto: "11,00" }, editado, {}, DEFAULTS);
  expect(r2.valores.monto).toBe("11,00");
});

it("marcarTocado quita la confianza", () => {
  const r = aplicarExtraccion({ ...DEFAULTS }, autollenadoNuevo<F>(), { fecha: p("2026-10-15") }, DEFAULTS);
  expect(marcarTocado(r.auto, "fecha")).toEqual({ estado: { fecha: "tocado" }, confianza: {} });
});
