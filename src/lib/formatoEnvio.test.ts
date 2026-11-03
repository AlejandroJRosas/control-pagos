import { describe, expect, it } from "vitest";
import { nombreEstadoCuenta, normalizarFormato } from "./formatoEnvio";

describe("normalizarFormato", () => {
  it("por defecto la imagen; acepta solo los formatos conocidos", () => {
    expect(normalizarFormato(null)).toBe("imagen");
    expect(normalizarFormato("pdf")).toBe("pdf");
    expect(normalizarFormato("excel")).toBe("excel");
    expect(normalizarFormato("word")).toBe("imagen");
  });
});

describe("nombreEstadoCuenta", () => {
  it("Gerente - Campaña - fecha, con la extensión del formato", () => {
    expect(nombreEstadoCuenta("pdf", "José Pérez", "Julio 2026", "2026-10-21")).toBe("José Pérez - Julio 2026 - 21-10-2026.pdf");
    expect(nombreEstadoCuenta("excel", "Ana", "Julio", "2026-10-21")).toBe("Ana - Julio - 21-10-2026.xlsx");
    expect(nombreEstadoCuenta("imagen", "Ana", "Julio", "2026-10-21")).toBe("Ana - Julio - 21-10-2026.png");
  });
});
