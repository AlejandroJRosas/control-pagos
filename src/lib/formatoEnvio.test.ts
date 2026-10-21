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
  it("arma un nombre de archivo simple con la extensión del formato", () => {
    expect(nombreEstadoCuenta("pdf", "José Pérez", "Julio 2026", "2026-10-21")).toBe("estado-de-cuenta-jose-perez-julio-2026-2026-10-21.pdf");
    expect(nombreEstadoCuenta("excel", "Ana", "Julio", "2026-10-21")).toBe("estado-de-cuenta-ana-julio-2026-10-21.xlsx");
    expect(nombreEstadoCuenta("imagen", "Ana", "Julio", "2026-10-21")).toBe("estado-de-cuenta-ana-julio-2026-10-21.png");
  });
});
