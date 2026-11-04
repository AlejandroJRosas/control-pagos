import { beforeEach, expect, it, vi } from "vitest";

const check = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => check() }));
const pasos: string[] = [];
const respaldoDeCierre = vi.fn(async () => {
  pasos.push("cierre");
});
const setAjuste = vi.fn(async (_db: unknown, _clave: string, _valor: string) => {});
vi.mock("@/db", () => ({ getDb: async () => ({}), closeDb: async () => pasos.push("closeDb") }));
vi.mock("@/db/repos/ajustes", () => ({ setAjuste: (db: unknown, c: string, v: string) => setAjuste(db, c, v) }));
vi.mock("./backup", () => ({
  AJUSTE_ERROR_CIERRE: "error_cierre",
  respaldoAntesDe: async () => (pasos.push("antes"), ""),
  respaldoDeCierre: () => respaldoDeCierre(),
}));

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

it("la búsqueda en segundo plano muestra el botón sin abrir el aviso", async () => {
  const a = await import("./actualizacion");
  check.mockResolvedValue(nueva);
  expect(await a.buscarEnSegundoPlano()).toBe(nueva);
  expect(a.estadoActualizacion()).toEqual({ update: nueva, abierto: false });
});

it("la búsqueda en segundo plano no toca un aviso abierto ni repite la misma versión", async () => {
  const a = await import("./actualizacion");
  check.mockResolvedValue(nueva);
  await a.buscarActualizacion();
  await a.buscarEnSegundoPlano();
  expect(check).toHaveBeenCalledTimes(1);

  a.posponerActualizacion();
  const otraVez = { ...nueva, close: vi.fn(async () => {}) };
  check.mockResolvedValue(otraVez);
  expect(await a.buscarEnSegundoPlano()).toBeNull();
  expect(a.estadoActualizacion().update).toBe(nueva);
  expect(otraVez.close).toHaveBeenCalled();
});

it("busca periódicamente con la app abierta", async () => {
  vi.useFakeTimers();
  try {
    const a = await import("./actualizacion");
    check.mockResolvedValue(null);
    const onNueva = vi.fn();
    const detener = a.buscarPeriodicamente(1000, onNueva);
    await vi.advanceTimersByTimeAsync(2500);
    expect(check).toHaveBeenCalledTimes(2);
    expect(onNueva).not.toHaveBeenCalled();
    check.mockResolvedValue(nueva);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onNueva).toHaveBeenCalledWith(nueva);
    detener();
    await vi.advanceTimersByTimeAsync(5000);
    expect(check).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

it("recuerda cuándo se revisó por última vez (solo si la búsqueda respondió)", async () => {
  const a = await import("./actualizacion");
  expect(a.revisadoEn()).toBeNull();
  check.mockRejectedValue(new Error("sin internet"));
  await expect(a.buscarActualizacion()).rejects.toThrow();
  expect(a.revisadoEn()).toBeNull();
  check.mockResolvedValue(null);
  await a.buscarEnSegundoPlano();
  expect(a.revisadoEn()).toBeInstanceOf(Date);
});

const paraInstalar = () => ({ download: vi.fn(async () => {}), install: vi.fn(async () => void pasos.push("install")) });

it("antes de instalar corre también el respaldo de cierre (el instalador cierra la app sin pasar por el cierre normal)", async () => {
  pasos.length = 0;
  const a = await import("./actualizacion");
  const u = paraInstalar();
  await a.instalarActualizacion(u as never, () => {});
  expect(pasos).toEqual(["antes", "cierre", "closeDb", "install"]);
});

it("si el respaldo de cierre falla, igual instala y lo deja anotado para avisar al abrir", async () => {
  pasos.length = 0;
  setAjuste.mockClear();
  respaldoDeCierre.mockRejectedValueOnce(new Error("disco lleno"));
  const a = await import("./actualizacion");
  await a.instalarActualizacion(paraInstalar() as never, () => {});
  expect(pasos).toEqual(["antes", "closeDb", "install"]);
  expect(setAjuste).toHaveBeenCalledWith(expect.anything(), "error_cierre", expect.stringContaining("disco lleno"));
});
