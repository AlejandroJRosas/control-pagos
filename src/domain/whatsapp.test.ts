import { describe, expect, it } from "vitest";
import { mensajeEstadoCuenta, numeroWhatsApp, urlWhatsApp } from "./whatsapp";

describe("numeroWhatsApp", () => {
  it("convierte números venezolanos al formato internacional", () => {
    expect(numeroWhatsApp("0414-1234567")).toBe("584141234567");
    expect(numeroWhatsApp("(0424) 123 45 67")).toBe("584241234567");
    expect(numeroWhatsApp("414 1234567")).toBe("584141234567");
    expect(numeroWhatsApp("+58 412 1234567")).toBe("584121234567");
    expect(numeroWhatsApp("584121234567")).toBe("584121234567");
  });

  it("respeta otros números internacionales con +", () => {
    expect(numeroWhatsApp("+1 (305) 555-1234")).toBe("13055551234");
  });

  it("rechaza lo que no parece un teléfono", () => {
    expect(numeroWhatsApp(null)).toBeNull();
    expect(numeroWhatsApp("")).toBeNull();
    expect(numeroWhatsApp("1234")).toBeNull();
    expect(numeroWhatsApp("no tiene")).toBeNull();
  });
});

describe("mensajeEstadoCuenta", () => {
  const base = { gerenteNombre: "Ana Pérez", campanaNombre: "Marzo", fechaCorte: "2026-03-15", asignado: "1000", pagado: "400.5", cantidad: 3 };

  it("resume lo asignado, pagado y restante en formato venezolano", () => {
    expect(mensajeEstadoCuenta({ ...base, restante: "599.5" })).toBe(
      [
        "Hola Ana Pérez, este es tu estado de cuenta de la campaña Marzo al 15/03/2026:",
        "",
        "• Asignado: $ 1.000,00",
        "• Pagado: $ 400,50 (3 depósitos)",
        "• Restante: $ 599,50",
        "",
        "Cualquier diferencia, avísame por aquí. ¡Gracias!",
      ].join("\n"),
    );
  });

  it("indica pago completo o pagado de más", () => {
    expect(mensajeEstadoCuenta({ ...base, pagado: "1000", restante: "0", cantidad: 1 })).toContain("• Pagado: $ 1.000,00 (1 depósito)\n• Saldo completo");
    expect(mensajeEstadoCuenta({ ...base, pagado: "1010", restante: "-10" })).toContain("• Pagado de más: $ 10,00");
  });
});

it("urlWhatsApp arma el enlace wa.me con el texto codificado", () => {
  expect(urlWhatsApp("584141234567", "Hola & adiós\nok")).toBe("https://wa.me/584141234567?text=Hola%20%26%20adi%C3%B3s%0Aok");
});
