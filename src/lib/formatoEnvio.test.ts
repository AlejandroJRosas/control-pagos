import { describe, expect, it } from "vitest";
import { archivosDeFormato, nombreEstadoCuenta, normalizarFormato } from "./formatoEnvio";

describe("normalizarFormato", () => {
  it("por defecto la imagen; acepta solo los formatos conocidos", () => {
    expect(normalizarFormato(null)).toBe("imagen");
    expect(normalizarFormato("pdf")).toBe("pdf");
    expect(normalizarFormato("excel")).toBe("excel");
    expect(normalizarFormato("pdf-excel")).toBe("pdf-excel");
    expect(normalizarFormato("word")).toBe("imagen");
  });
});

describe("archivosDeFormato", () => {
  it("PDF y Excel son dos archivos; los demás, uno", () => {
    expect(archivosDeFormato("pdf-excel")).toEqual(["pdf", "excel"]);
    expect(archivosDeFormato("imagen")).toEqual(["imagen"]);
    expect(archivosDeFormato("excel")).toEqual(["excel"]);
  });
});

describe("nombreEstadoCuenta", () => {
  it("Gerente - Campaña - fecha, con la extensión del formato", () => {
    expect(nombreEstadoCuenta("pdf", "José Pérez", "Julio 2026", "2026-10-21")).toBe("José Pérez - Julio 2026 - 21-10-2026.pdf");
    expect(nombreEstadoCuenta("excel", "Ana", "Julio", "2026-10-21")).toBe("Ana - Julio - 21-10-2026.xlsx");
    expect(nombreEstadoCuenta("imagen", "Ana", "Julio", "2026-10-21")).toBe("Ana - Julio - 21-10-2026.png");
  });
});
