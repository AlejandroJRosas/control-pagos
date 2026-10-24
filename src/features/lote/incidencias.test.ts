import { expect, it } from "vitest";
import { borradorDepositoVacio, type BorradorDeposito } from "@/db/repos/cola";
import { motivosBorrador, type ContextoIncidencia } from "./incidencias";

const limpio: ContextoIncidencia = { duplicado: false, posibleRepetido: false, faltaTasa: false };

const completo = (): BorradorDeposito => {
  const b = borradorDepositoVacio("a:1");
  return {
    ...b,
    draft: { ...b.draft, fecha: "2026-03-02", banco: "Banesco", referencia: "77", cuentaDestino: "0102", montoBs: "3.650" },
    auto: {
      estado: { fecha: "ocr", banco: "ocr", referencia: "ocr", cuentaDestino: "ocr", montoBs: "ocr" },
      confianza: { fecha: 0.95, banco: 0.95, referencia: 0.95, cuentaDestino: 0.95, montoBs: 0.95 },
    },
  };
};

it("un borrador completo y seguro no tiene motivos", () => {
  expect(motivosBorrador("bdv", completo(), limpio)).toEqual([]);
});

it("sin formato no se reconoció el comprobante", () => {
  expect(motivosBorrador(null, completo(), limpio)).toContain("No se reconoció el comprobante");
});

it("avisa de lo que falta", () => {
  const motivos = motivosBorrador("bdv", borradorDepositoVacio(), limpio);
  expect(motivos).toEqual(["Falta la fecha", "Falta el banco", "Falta la referencia", "Falta el monto", "Falta el gerente"]);
});

it("un campo del OCR con poca confianza se revisa; si lo tocó la usuaria, no", () => {
  const b = completo();
  b.auto = { estado: { ...b.auto.estado, referencia: "ocr" }, confianza: { ...b.auto.confianza, referencia: 0.7 } };
  expect(motivosBorrador("bdv", b, limpio)).toContain("Revisar: referencia");
  b.auto = { estado: { ...b.auto.estado, referencia: "tocado" }, confianza: {} };
  expect(motivosBorrador("bdv", b, limpio)).not.toContain("Revisar: referencia");
});

it("suma duplicado, posible repetido y falta de tasa del contexto", () => {
  expect(motivosBorrador("bdv", completo(), { duplicado: true, posibleRepetido: true, faltaTasa: true })).toEqual([
    "Duplicado",
    "Posible repetido",
    "Falta la tasa",
  ]);
});
