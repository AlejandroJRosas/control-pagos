import { afterEach, expect, it, vi } from "vitest";
import { pedirCierre, registrarBloqueador } from "./cierre";

const quitar: (() => void)[] = [];
const bloqueador = (b: () => Promise<boolean>) => quitar.push(registrarBloqueador(b));
afterEach(() => {
  quitar.splice(0).forEach((q) => q());
  vi.useRealTimers();
});

it("cierre: bloqueador cancela antes del respaldo", async () => {
  const respaldar = vi.fn(async () => {});
  const destruir = vi.fn(async () => {});
  bloqueador(async () => false);
  expect(await pedirCierre({ respaldar, destruir, guardarError: vi.fn(async () => {}) })).toBe("cancelado");
  expect(respaldar).not.toHaveBeenCalled();
  expect(destruir).not.toHaveBeenCalled();
});

it("corre los bloqueadores, respalda y luego destruye", async () => {
  const orden: string[] = [];
  bloqueador(async () => {
    orden.push("bloqueador");
    return true;
  });
  const r = await pedirCierre({
    respaldar: async () => void orden.push("respaldar"),
    destruir: async () => void orden.push("destruir"),
    guardarError: async () => void orden.push("error"),
  });
  expect(r).toBe("cerrado");
  expect(orden).toEqual(["bloqueador", "respaldar", "destruir"]);
});

it("quitar un bloqueador deja de consultarlo", async () => {
  const b = vi.fn(async () => false);
  const q = registrarBloqueador(b);
  q();
  expect(await pedirCierre({ respaldar: async () => {}, destruir: async () => {}, guardarError: async () => {} })).toBe("cerrado");
  expect(b).not.toHaveBeenCalled();
});

it("si el respaldo falla, guarda el error y cierra igual", async () => {
  const guardarError = vi.fn(async () => {});
  const destruir = vi.fn(async () => {});
  const r = await pedirCierre({ respaldar: async () => Promise.reject(new Error("disco lleno")), destruir, guardarError });
  expect(r).toBe("cerrado");
  expect(guardarError).toHaveBeenCalledWith(expect.objectContaining({ message: "disco lleno" }));
  expect(destruir).toHaveBeenCalled();
});

it("si el respaldo pasa del tope, guarda el error y cierra", async () => {
  vi.useFakeTimers();
  const guardarError = vi.fn(async () => {});
  const destruir = vi.fn(async () => {});
  const p = pedirCierre({ respaldar: () => new Promise<void>(() => {}), destruir, guardarError, timeoutMs: 20_000 });
  await vi.advanceTimersByTimeAsync(19_999);
  expect(destruir).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await p).toBe("cerrado");
  expect(guardarError).toHaveBeenCalled();
  expect(destruir).toHaveBeenCalled();
});

it("avisa mientras respalda", async () => {
  const estados: boolean[] = [];
  await pedirCierre({ respaldar: async () => {}, destruir: async () => {}, guardarError: async () => {}, onRespaldando: (v) => estados.push(v) });
  expect(estados).toEqual([true, false]);
});

it("un segundo pedido mientras se cierra no repite el respaldo", async () => {
  let soltar!: () => void;
  const respaldar = vi.fn(() => new Promise<void>((r) => (soltar = r)));
  const deps = { respaldar, destruir: async () => {}, guardarError: async () => {} };
  const a = pedirCierre(deps);
  await Promise.resolve();
  const b = pedirCierre(deps);
  soltar();
  expect(await a).toBe("cerrado");
  expect(await b).toBe("cerrado");
  expect(respaldar).toHaveBeenCalledTimes(1);
});
