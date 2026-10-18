import { beforeEach, expect, it, vi } from "vitest";

const invoke = vi.fn();
const close = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock("@tauri-apps/api/path", () => ({ join: async (...p: string[]) => p.join("\\") }));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: async () => ({
      execute: async () => ({ rowsAffected: 0, lastInsertId: 0 }),
      // user_version alto: migrate no hace nada
      select: async () => [{ user_version: 999 }],
      close: () => close(),
    }),
  },
}));

beforeEach(() => {
  invoke.mockReset();
  close.mockReset();
});

it("no reemplaza los datos si la base de datos no se pudo cerrar", async () => {
  const { getDb } = await import("@/db");
  const { restoreBackup } = await import("./backup");
  await getDb();
  close.mockRejectedValue(new Error("database is locked"));
  await expect(restoreBackup("C:\\r.zip")).rejects.toThrow(/cerrar/);
  expect(invoke).not.toHaveBeenCalledWith("restore_backup", expect.anything());
});

it("restaura cuando la base de datos se cerró bien", async () => {
  const { getDb } = await import("@/db");
  const { restoreBackup } = await import("./backup");
  await getDb();
  close.mockResolvedValue(true);
  invoke.mockResolvedValue(undefined);
  await restoreBackup("C:\\r.zip");
  expect(invoke).toHaveBeenCalledWith("restore_backup", { zipPath: "C:\\r.zip" });
});

it("el respaldo previo a una eliminación va a la carpeta de respaldos", async () => {
  const { respaldoAntesDe } = await import("./backup");
  invoke.mockImplementation(async (cmd: string) => (cmd === "data_paths" ? { backupsDir: "C:\\resp" } : undefined));
  const db = { execute: vi.fn(async () => ({ rowsAffected: 0, lastInsertId: 0 })), select: vi.fn() };
  const dest = await respaldoAntesDe(db, "eliminar");
  expect(dest).toMatch(/^C:\\resp\\antes-de-eliminar-\d+\.zip$/);
  expect(invoke).toHaveBeenCalledWith("create_backup", { snapshotPath: expect.stringMatching(/^C:\\resp\\snapshot-/), destPath: dest });
});
