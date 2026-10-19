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

it("mantenimientoAlIniciar precarga los feriados del año", async () => {
  const { createTestDb } = await import("@/db/testing/sqljsDriver");
  const { listFeriados } = await import("@/db/repos/feriados");
  const { mantenimientoAlIniciar } = await import("./backup");
  const db = await createTestDb();
  invoke.mockResolvedValue(null);
  await mantenimientoAlIniciar(db);
  expect((await listFeriados(db)).length).toBeGreaterThan(0);
});

async function dbSinVacuum() {
  const { createTestDb } = await import("@/db/testing/sqljsDriver");
  const real = await createTestDb();
  // VACUUM INTO escribe un archivo: en la prueba no hace falta.
  return { ...real, execute: (sql: string, p?: (string | number | null)[]) => (sql.startsWith("VACUUM") ? Promise.resolve({ lastInsertId: 0, rowsAffected: 0 }) : real.execute(sql, p)) };
}

function invokePorComando(espejo: (args: unknown) => unknown) {
  invoke.mockImplementation(async (cmd: string, args: unknown) => {
    if (cmd === "data_paths") return { dbPath: "C:\\c\\db", imagesDir: "C:\\d\\imagenes", backupsDir: "C:\\d\\respaldos" };
    if (cmd === "auto_backup_path") return "C:\\d\\respaldos\\auto-2026-10-19.zip";
    if (cmd === "auto_backup_path_hoy") return "C:\\d\\respaldos\\auto-2026-10-19.zip";
    if (cmd === "mirror_backup") return espejo(args);
    return null;
  });
}

it("runAutoBackup copia al espejo y guarda el resultado", async () => {
  const { setAjuste, getAjuste } = await import("@/db/repos/ajustes");
  const { runAutoBackup } = await import("./backup");
  const db = await dbSinVacuum();
  await setAjuste(db, "espejo_carpeta", "G:\\Mi unidad\\Respaldos");
  invokePorComando(() => null);
  await runAutoBackup(db);
  expect(invoke).toHaveBeenCalledWith("mirror_backup", { zipPath: "C:\\d\\respaldos\\auto-2026-10-19.zip", dir: "G:\\Mi unidad\\Respaldos" });
  expect(JSON.parse((await getAjuste(db, "espejo_ultimo")) ?? "{}")).toMatchObject({ ok: true, mensaje: null });
  expect(await getAjuste(db, "espejo_ultimo_ok")).toBeTruthy();
});

it("si el espejo falla, el respaldo local queda y se guarda el error sin lanzar", async () => {
  const { setAjuste, getAjuste } = await import("@/db/repos/ajustes");
  const { runAutoBackup } = await import("./backup");
  const db = await dbSinVacuum();
  await setAjuste(db, "espejo_carpeta", "G:\\x");
  invokePorComando(() => {
    throw "La carpeta de Google Drive no está disponible";
  });
  await expect(runAutoBackup(db)).resolves.toBeUndefined();
  expect(invoke).toHaveBeenCalledWith("create_backup", expect.anything());
  expect(JSON.parse((await getAjuste(db, "espejo_ultimo")) ?? "{}")).toMatchObject({ ok: false, mensaje: "La carpeta de Google Drive no está disponible" });
  expect(await getAjuste(db, "espejo_ultimo_ok")).toBeNull();
});

it("sin carpeta espejo no se copia nada", async () => {
  const { runAutoBackup } = await import("./backup");
  const db = await dbSinVacuum();
  invokePorComando(() => null);
  await runAutoBackup(db);
  expect(invoke).not.toHaveBeenCalledWith("mirror_backup", expect.anything());
});

it("runAutoBackup con reemplazar usa la ruta del día aunque exista", async () => {
  const { runAutoBackup } = await import("./backup");
  const db = await dbSinVacuum();
  invokePorComando(() => null);
  await runAutoBackup(db, { reemplazar: true });
  expect(invoke).toHaveBeenCalledWith("auto_backup_path_hoy", expect.anything());
  expect(invoke).not.toHaveBeenCalledWith("auto_backup_path", expect.anything());
});

it("copiarUltimoAlEspejo copia el auto más reciente", async () => {
  const { setAjuste } = await import("@/db/repos/ajustes");
  const { copiarUltimoAlEspejo } = await import("./espejo");
  const db = await dbSinVacuum();
  await setAjuste(db, "espejo_carpeta", "G:/x");
  invoke.mockImplementation(async (cmd: string) =>
    cmd === "list_backups"
      ? [
          { name: "auto-2026-10-18.zip", path: "a18" },
          { name: "antes-de-x-1.zip", path: "ax" },
          { name: "auto-2026-10-19.zip", path: "a19" },
        ]
      : null,
  );
  expect(await copiarUltimoAlEspejo(db)).toMatchObject({ ok: true });
  expect(invoke).toHaveBeenCalledWith("mirror_backup", { zipPath: "a19", dir: "G:/x" });
});
