import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import ExcelJS from "exceljs";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";

/** Un Excel mínimo con la hoja CUADRO DE PAGOS de Ana y un pago del Provincial del 02/03/2026 con la cédula dada. */
async function excel(nombre: string, cedula: string): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("CUADRO DE PAGOS");
  ws.getCell("B12").value = "NOMBRE Y APELLIDO:";
  ws.getCell("C12").value = "Ana";
  ws.getRow(22).values = [undefined, "NOMBRE GERENTE", "FECHA DEPOSITO", "BANCO", "REFERENCIA BANCARIA", "CUENTA DESTINO", "Bs.", "TASA DEL DIA", "$"];
  ws.getRow(23).values = [undefined, 0, new Date("2026-03-02T00:00:00.000Z"), "Provincial", cedula, "Inv. JD", 730, 36.5];
  const buffer = await wb.xlsx.writeBuffer();
  const file = new File([buffer], nombre);
  Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  return file;
}

it("tras importar un archivo, el pago del Provincial que el otro archivo también trae se desmarca (no entra dos veces)", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const r = await renderApp(`/campanas/${s.campanaId}/importar`, { db, hoy: "2026-03-02" });
  await screen.findByText("Importar depósitos desde Excel");
  await r.user.upload(r.container.querySelector<HTMLInputElement>('input[type="file"]')!, [
    await excel("uno.xlsx", "V-12.345.678"),
    await excel("dos.xlsx", "12345678"),
  ]);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Importar 1 depósito(s)" })).toHaveLength(2));

  await r.user.click(screen.getAllByRole("button", { name: "Importar 1 depósito(s)" })[0]);
  await waitFor(() => expect(screen.getByText("Importar 0 depósito(s)")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Importar 1 depósito(s)" })).not.toBeInTheDocument();
  expect((await db.select("SELECT id FROM depositos WHERE banco = 'Provincial'")).length).toBe(1);
});
