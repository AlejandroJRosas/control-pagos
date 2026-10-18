import { expect, it, vi } from "vitest";
import { crearExtractor, nullExtractor } from "./extractor";
import type { OcrEngine, OcrResultado } from "./ocr/types";
import bdvOscuro from "./formatos/__fixtures__/bdv-oscuro.json";
import tasaFixture from "./formatos/__fixtures__/tasa-mariandres.json";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const motor = (r: OcrResultado): OcrEngine => ({ reconocer: async () => r });
const img = new Blob(["x"], { type: "image/png" });
const hoy = () => "2026-10-18";

it("lee un comprobante BDV con el reconocedor que lo detecta", async () => {
  const r = await crearExtractor(motor(bdvOscuro), hoy).extraerDeposito(img);
  expect(r.formato).toBe("bdv-transferencia-terceros");
  expect(r.fields.referencia?.value).toBe("059132331406");
});

it("lee la imagen de tasa", async () => {
  const r = await crearExtractor(motor(tasaFixture), hoy).extraerTasa(img);
  expect(r.formato).toBe("tasa-mariandres");
  expect(r.fields.valor?.value).toBe("880,12");
});

it("no propone nada si ningún formato del tipo pedido coincide", async () => {
  await expect(crearExtractor(motor(bdvOscuro), hoy).extraerTasa(img)).resolves.toEqual({ formato: null, fields: {} });
  await expect(crearExtractor(motor(tasaFixture), hoy).extraerDeposito(img)).resolves.toEqual({ formato: null, fields: {} });
});

it("propaga el error del motor", async () => {
  const error = new Error("x");
  const roto: OcrEngine = { reconocer: async () => Promise.reject(error) };
  await expect(crearExtractor(roto, hoy).extraerDeposito(img)).rejects.toBe(error);
});

it("el extractor nulo no devuelve campos", async () => {
  await expect(nullExtractor.extraerDeposito(img)).resolves.toEqual({ formato: null, fields: {} });
  await expect(nullExtractor.extraerTasa(img)).resolves.toEqual({ formato: null, fields: {} });
});
