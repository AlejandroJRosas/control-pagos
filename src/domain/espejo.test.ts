import { expect, it } from "vitest";
import { avisoEspejo } from "./espejo";

const ahora = "2026-10-19T12:00:00.000Z";

it("sin carpeta no hay aviso", () => {
  expect(avisoEspejo(null, { ok: false, fecha: ahora, mensaje: "x" }, null, ahora)).toBeNull();
});

it("avisa el error de la última copia", () => {
  const a = avisoEspejo("G:\\x", { ok: false, fecha: "2026-10-19T08:00:00.000Z", mensaje: "no está" }, "2026-10-18T08:00:00.000Z", ahora);
  expect(a?.tipo).toBe("error");
  expect(a?.mensaje).toContain("no está");
});

it("avisa si pasan más de 3 días sin una copia exitosa", () => {
  expect(avisoEspejo("G:\\x", { ok: true, fecha: "2026-10-15T08:00:00.000Z", mensaje: null }, "2026-10-15T08:00:00.000Z", ahora)?.tipo).toBe("sinCopia");
  expect(avisoEspejo("G:\\x", null, null, ahora)?.tipo).toBe("sinCopia");
});

it("con una copia reciente no avisa", () => {
  expect(avisoEspejo("G:\\x", { ok: true, fecha: "2026-10-17T08:00:00.000Z", mensaje: null }, "2026-10-17T08:00:00.000Z", ahora)).toBeNull();
});
