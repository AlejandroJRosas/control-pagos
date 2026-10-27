import { expect, it } from "vitest";
import { borradorDepositoVacio, borradorTasaVacio } from "@/db/repos/cola";
import { borradorDepositoConOcr, borradorTasaConOcr, releerBorradorDeposito, releerBorradorTasa } from "./leerEnBorrador";

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

it("volver a leer reemplaza lo escrito a mano y deja el gerente y las observaciones", () => {
  const vacio = borradorDepositoVacio("a:3");
  const b = { ...vacio, draft: { ...vacio.draft, montoBs: "5", observaciones: "ojo" }, auto: { estado: { montoBs: "tocado" as const }, confianza: {} } };
  const r = releerBorradorDeposito(b, { montoBs: { value: "1.250,00", confidence: 0.9 }, banco: { value: "Banesco", confidence: 0.9 } });
  expect(r.borrador.draft).toMatchObject({ montoBs: "1.250,00", banco: "Banesco", observaciones: "ojo" });
  expect(r.borrador.destino.sel).toBe("a:3");
  expect(r.cambiados.sort()).toEqual(["banco", "montoBs"]);
});

it("volver a leer una tasa sin nada leído no cambia nada", () => {
  const b = { ...borradorTasaVacio(), draft: { fecha: "2026-10-16", valor: "880,12", notas: "" } };
  expect(releerBorradorTasa(b, {})).toEqual({ borrador: b, cambiados: [] });
});
