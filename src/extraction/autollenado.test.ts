import { describe, expect, it } from "vitest";
import { aplicarExtraccion, type Autollenado, autollenadoExistente, autollenadoNuevo, marcarTocado, reemplazarConExtraccion, tasaParaFecha } from "./autollenado";

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

describe("tasaParaFecha", () => {
  const leida = { fecha: p("2026-10-16"), valor: p("880,12") };

  it("baja a ámbar el valor de una imagen de otro día cuando la fecha está fija", () => {
    expect(tasaParaFecha(leida, "2026-10-15", true).valor).toEqual(p("880,12", 0.6));
  });

  it("no cambia nada si la fecha coincide o si el OCR puede cambiarla", () => {
    expect(tasaParaFecha(leida, "2026-10-16", true)).toEqual(leida);
    expect(tasaParaFecha(leida, "2026-10-15", false)).toEqual(leida);
  });
});

describe("reemplazarConExtraccion", () => {
  it("lo leído reemplaza también lo escrito a mano y dice qué cambió", () => {
    const a = marcarTocado<F>(autollenadoNuevo(), "monto");
    const r = reemplazarConExtraccion({ fecha: "2026-10-15", monto: "5" }, a, { fecha: p("2026-10-15"), monto: p("13.186,80", 0.7) });
    expect(r.valores).toEqual({ fecha: "2026-10-15", monto: "13.186,80" });
    expect(r.auto).toEqual({ estado: { fecha: "ocr", monto: "ocr" }, confianza: { fecha: 0.9, monto: 0.7 } });
    expect(r.cambiados).toEqual(["monto"]);
  });

  it("lo que no se leyó queda como estaba", () => {
    const a: Autollenado<F> = { estado: { fecha: "ocr" }, confianza: { fecha: 0.9 } };
    const r = reemplazarConExtraccion({ fecha: "2026-10-15", monto: "5" }, a, {});
    expect(r.valores).toEqual({ fecha: "2026-10-15", monto: "5" });
    expect(r.auto).toEqual(a);
    expect(r.cambiados).toEqual([]);
  });
});
