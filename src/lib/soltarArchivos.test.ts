import { afterEach, expect, it, vi } from "vitest";
import { entregarArchivos, receptorActual, registrarReceptor, tomarArchivos, type Receptor } from "./soltarArchivos";

const archivo = (n: string) => new File(["x"], n, { type: "image/png" });
const receptor = (texto: string): Receptor => ({ destino: () => texto, recibir: () => {} });

afterEach(() => {
  vi.useRealTimers();
  tomarArchivos("");
});

it("manda el receptor registrado más reciente y vuelve al anterior al quitarlo", () => {
  expect(receptorActual()).toBeNull();
  const quitarA = registrarReceptor(receptor("A"));
  const quitarB = registrarReceptor(receptor("B"));
  expect(receptorActual()?.destino(1)).toBe("B");
  quitarB();
  expect(receptorActual()?.destino(1)).toBe("A");
  quitarA();
  expect(receptorActual()).toBeNull();
});

it("los archivos entregados solo los toma la pantalla de destino, una vez", () => {
  const files = [archivo("1.png"), archivo("2.png")];
  entregarArchivos("/campanas/1/lote", files);
  expect(tomarArchivos("/campanas/2/lote")).toEqual([]);
  entregarArchivos("/campanas/1/lote", files);
  expect(tomarArchivos("/campanas/1/lote")).toEqual(files);
  expect(tomarArchivos("/campanas/1/lote")).toEqual([]);
});

it("una entrega que nadie tomó a tiempo se descarta", () => {
  vi.useFakeTimers();
  entregarArchivos("/tasas/lote", [archivo("t.png")]);
  vi.advanceTimersByTime(30_001);
  expect(tomarArchivos("/tasas/lote")).toEqual([]);
});
