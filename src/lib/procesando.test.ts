import { describe, expect, it } from "vitest";
import { procesando, textoProcesando } from "./procesando";

describe("procesando", () => {
  it("muestra el texto mientras corre y lo quita al terminar", async () => {
    let soltar!: () => void;
    const p = procesando("Abriendo…", () => new Promise<number>((r) => (soltar = () => r(7))));
    expect(textoProcesando()).toBe("Abriendo…");
    await new Promise((r) => setTimeout(r, 5));
    soltar();
    await expect(p).resolves.toBe(7);
    expect(textoProcesando()).toBeNull();
  });

  it("lo quita también si falla", async () => {
    await expect(
      procesando("Leyendo…", async () => {
        throw new Error("mal");
      }),
    ).rejects.toThrow("mal");
    expect(textoProcesando()).toBeNull();
  });

  it("con dos a la vez muestra el último y, al terminar este, vuelve al anterior", async () => {
    let soltarA!: () => void;
    let soltarB!: () => void;
    const a = procesando("A", () => new Promise<void>((r) => (soltarA = r)));
    const b = procesando("B", () => new Promise<void>((r) => (soltarB = r)));
    expect(textoProcesando()).toBe("B");
    await new Promise((r) => setTimeout(r, 5));
    soltarB();
    await b;
    expect(textoProcesando()).toBe("A");
    soltarA();
    await a;
    expect(textoProcesando()).toBeNull();
  });
});
