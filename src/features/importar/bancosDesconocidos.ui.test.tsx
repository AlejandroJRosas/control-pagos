import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import ExcelJS from "exceljs";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";

/** Un Excel mínimo con la hoja CUADRO DE PAGOS de Ana y un depósito del 02/03/2026 en el banco dado. */
async function excel(nombre: string, banco: string, referencia: string): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("CUADRO DE PAGOS");
  ws.getCell("B12").value = "NOMBRE Y APELLIDO:";
  ws.getCell("C12").value = "Ana";
  ws.getRow(22).values = [undefined, "NOMBRE GERENTE", "FECHA DEPOSITO", "BANCO", "REFERENCIA BANCARIA", "CUENTA DESTINO", "Bs.", "TASA DEL DIA", "$"];
  ws.getRow(23).values = [undefined, 0, new Date("2026-03-02T00:00:00.000Z"), banco, referencia, "Inv. JD", 730, 36.5];
  const buffer = await wb.xlsx.writeBuffer();
  const file = new File([buffer], nombre);
  Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  return file;
}

async function abrir(db: Awaited<ReturnType<typeof createTestDb>>, campanaId: number) {
  const r = await renderApp(`/campanas/${campanaId}/importar`, { db, hoy: "2026-03-02" });
  await screen.findByText("Importar depósitos desde Excel");
  return r;
}

const subir = async (r: Awaited<ReturnType<typeof abrir>>, ...files: File[]) => {
  await r.user.upload(r.container.querySelector<HTMLInputElement>('input[type="file"]')!, files);
};

const aliasGuardados = async (db: Awaited<ReturnType<typeof createTestDb>>) =>
  db.select<{ alias: string; banco: string }>("SELECT alias, banco FROM bancos_alias");

it("pregunta una sola vez por un banco que está en dos archivos y lo aplica a todas las filas", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const r = await abrir(db, s.campanaId);
  await subir(r, await excel("uno.xlsx", "BANCO XYZ", "111"), await excel("dos.xlsx", "BANCO XYZ", "222"));

  await screen.findByText("Bancos del archivo que no conozco");
  expect(screen.getAllByText("BANCO XYZ es…")).toHaveLength(1);
  await waitFor(() => expect(screen.getAllByText("Importar 0 depósito(s)")).toHaveLength(2));

  await r.user.type(screen.getByPlaceholderText("Elegir banco…"), "bancamiga");
  await r.user.click(await screen.findByRole("option", { name: "Bancamiga" }));

  await waitFor(() => expect(screen.queryByText("Bancos del archivo que no conozco")).not.toBeInTheDocument());
  expect(await screen.findAllByText("Importar 1 depósito(s)")).toHaveLength(2);
  expect(screen.getAllByText("Bancamiga")).toHaveLength(2);
  expect(await aliasGuardados(db)).toEqual([{ alias: "bancoxyz", banco: "Bancamiga" }]);

  await r.user.click(screen.getAllByRole("button", { name: "Importar 1 depósito(s)" })[0]);
  await waitFor(async () => expect((await db.select("SELECT id FROM depositos WHERE banco = 'Bancamiga'")).length).toBe(1));
});

it("una importación posterior con el mismo nombre ya no pregunta", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const r = await abrir(db, s.campanaId);
  await subir(r, await excel("uno.xlsx", "BANCO XYZ", "111"));
  await r.user.type(await screen.findByPlaceholderText("Elegir banco…"), "bancamiga");
  await r.user.click(await screen.findByRole("option", { name: "Bancamiga" }));
  await r.user.click(await screen.findByRole("button", { name: "Importar 1 depósito(s)" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Importar 1 depósito(s)" })).not.toBeInTheDocument());

  await subir(r, await excel("tres.xlsx", "BANCO XYZ", "333"));
  expect(await screen.findByRole("button", { name: "Importar 1 depósito(s)" })).toBeInTheDocument();
  expect(screen.queryByText("Bancos del archivo que no conozco")).not.toBeInTheDocument();
});

it("\"Es un banco nuevo\" deja el nombre del archivo y tampoco vuelve a preguntar", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const r = await abrir(db, s.campanaId);
  await subir(r, await excel("uno.xlsx", "BANCO XYZ", "111"));
  await r.user.click(await screen.findByPlaceholderText("Elegir banco…"));
  await r.user.click(await screen.findByRole("option", { name: "Es un banco nuevo: dejar este nombre" }));

  expect(await screen.findByRole("button", { name: "Importar 1 depósito(s)" })).toBeInTheDocument();
  expect(screen.queryByText("Bancos del archivo que no conozco")).not.toBeInTheDocument();
  expect(await aliasGuardados(db)).toEqual([{ alias: "bancoxyz", banco: "BANCO XYZ" }]);

  await r.user.click(screen.getByRole("button", { name: "Importar 1 depósito(s)" }));
  await waitFor(async () => expect((await db.select("SELECT id FROM depositos WHERE banco = 'BANCO XYZ'")).length).toBe(1));

  await subir(r, await excel("dos.xlsx", "banco xyz", "222"));
  expect(await screen.findByRole("button", { name: "Importar 1 depósito(s)" })).toBeInTheDocument();
  expect(screen.queryByText("Bancos del archivo que no conozco")).not.toBeInTheDocument();
});
