import { expect, it } from "vitest";
import { borradorDepositoVacio, borradorTasaVacio } from "@/db/repos/cola";
import { borradorDepositoConOcr, borradorTasaConOcr } from "./leerEnBorrador";

it("pone lo leído del comprobante en el borrador sin tocar el gerente ni inventar la fecha", () => {
  const b = borradorDepositoConOcr(borradorDepositoVacio("a:3"), { montoBs: { value: "1.250,00", confidence: 0.9 } });
  expect(b.draft.montoBs).toBe("1.250,00");
  expect(b.draft.fecha).toBe("");
  expect(b.auto).toEqual({ estado: { montoBs: "ocr" }, confianza: { montoBs: 0.9 } });
  expect(b.destino.sel).toBe("a:3");
});

it("sin campos leídos el borrador queda igual", () => {
  const vacio = borradorDepositoVacio("a:3");
  expect(borradorDepositoConOcr(vacio, {})).toEqual(vacio);
  expect(borradorTasaConOcr(borradorTasaVacio(), {})).toEqual(borradorTasaVacio());
});

it("pone fecha y valor de la imagen de tasa", () => {
  const b = borradorTasaConOcr(borradorTasaVacio(), { fecha: { value: "2026-10-16", confidence: 0.9 }, valor: { value: "880,12", confidence: 0.9 } });
  expect(b.draft).toEqual({ fecha: "2026-10-16", valor: "880,12", notas: "" });
  expect(b.auto.estado).toEqual({ fecha: "ocr", valor: "ocr" });
});
