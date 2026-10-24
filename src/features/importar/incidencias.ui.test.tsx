import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import ExcelJS from "exceljs";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";

/** Un Excel con 5 depósitos: tres de Banesco y dos de un banco que la app no conoce. */
async function excel(): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("CUADRO DE PAGOS");
  ws.getCell("B12").value = "NOMBRE Y APELLIDO:";
  ws.getCell("C12").value = "Ana";
  ws.getRow(22).values = [undefined, "NOMBRE GERENTE", "FECHA DEPOSITO", "BANCO", "REFERENCIA BANCARIA", "CUENTA DESTINO", "Bs.", "TASA DEL DIA", "$"];
  const bancos = ["Banesco", "Banesco", "Banesco", "BANCO XYZ", "BANCO XYZ"];
  bancos.forEach((b, i) => ws.getRow(23 + i).values = [undefined, 0, new Date("2026-03-02T00:00:00.000Z"), b, `10${i}`, "Inv. JD", 730, 36.5]);
  const buffer = await wb.xlsx.writeBuffer();
  const file = new File([buffer], "ana.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  return file;
}

it("filtra las filas con incidencias y marcar todos actúa solo sobre las visibles", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const r = await renderApp(`/campanas/${s.campanaId}/importar`, { db, hoy: "2026-03-02" });
  await screen.findByText("Importar depósitos desde Excel");
  await r.user.upload(r.container.querySelector<HTMLInputElement>('input[type="file"]')!, [await excel()]);

  const chip = await screen.findByRole("button", { name: /Con incidencias/ });
  expect(chip).toHaveTextContent("Con incidencias2");
  expect(screen.getByRole("button", { name: /^Bien/ })).toHaveTextContent("Bien3");
  expect(screen.getAllByRole("checkbox", { name: /^Importar fila/ })).toHaveLength(5);

  await r.user.click(chip);
  const filas = screen.getAllByRole("checkbox", { name: /^Importar fila/ });
  expect(filas).toHaveLength(2);
  filas.forEach((c) => expect(c).toBeDisabled());
  expect(screen.getAllByLabelText(/Incidencias: .*Banco desconocido/)).toHaveLength(2);

  await r.user.click(screen.getByRole("button", { name: /^Bien/ }));
  expect(screen.getAllByRole("checkbox", { name: /^Importar fila/ })).toHaveLength(3);
  const todas = screen.getByRole("checkbox", { name: "Marcar todas" });
  expect(todas).toBeChecked();
  await r.user.click(todas);
  expect(await screen.findByRole("button", { name: "Importar 0 depósito(s)" })).toBeInTheDocument();
  await r.user.click(todas);
  expect(within(document.body).getByRole("button", { name: "Importar 3 depósito(s)" })).toBeInTheDocument();
});
