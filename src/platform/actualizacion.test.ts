import { beforeEach, expect, it, vi } from "vitest";

const check = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => check() }));
vi.mock("@/db", () => ({ getDb: async () => ({}), closeDb: async () => {} }));
vi.mock("./backup", () => ({ respaldoAntesDe: async () => "" }));

const nueva = { version: "0.3.2", currentVersion: "0.3.1", close: vi.fn(async () => {}) };

beforeEach(() => {
  vi.resetModules();
  check.mockReset();
});

it("al encontrar una versión nueva queda disponible y se abre el aviso", async () => {
  const a = await import("./actualizacion");
  check.mockResolvedValue(nueva);
  await a.buscarActualizacion();
  expect(a.estadoActualizacion()).toEqual({ update: nueva, abierto: true });
});

it("'Más tarde' cierra el aviso pero la versión sigue disponible para el botón", async () => {
  const a = await import("./actualizacion");
  check.mockResolvedValue(nueva);
  await a.buscarActualizacion();
  a.posponerActualizacion();
  expect(a.estadoActualizacion()).toEqual({ update: nueva, abierto: false });
  a.abrirAvisoActualizacion();
  expect(a.estadoActualizacion()).toEqual({ update: nueva, abierto: true });
});

it("sin versión nueva no hay nada que ofrecer", async () => {
  const a = await import("./actualizacion");
  check.mockResolvedValue(null);
  await a.buscarActualizacion();
  a.abrirAvisoActualizacion();
  expect(a.estadoActualizacion()).toEqual({ update: null, abierto: false });
});
