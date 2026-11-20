import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import ExcelJS from "exceljs";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";

/** Un Excel de Ana con 4 depósitos de Banesco: la referencia 101 va tres veces (las dos últimas son repetidas en el archivo). */
async function excel(): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("CUADRO DE PAGOS");
  ws.getCell("B12").value = "NOMBRE Y APELLIDO:";
  ws.getCell("C12").value = "Ana";
  ws.getRow(22).values = [undefined, "NOMBRE GERENTE", "FECHA DEPOSITO", "BANCO", "REFERENCIA BANCARIA", "CUENTA DESTINO", "Bs.", "TASA DEL DIA", "$"];
  ["100", "101", "101", "0101"].forEach((ref, i) => (ws.getRow(23 + i).values = [undefined, 0, new Date("2026-03-02T00:00:00.000Z"), "Banesco", ref, "Inv. JD", 730, 36.5]));
  const buffer = await wb.xlsx.writeBuffer();
  const file = new File([buffer], "ana.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  return file;
}

it("quita los duplicados de la lista y se pueden volver a mostrar", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const r = await renderApp(`/campanas/${s.campanaId}/importar`, { db, hoy: "2026-03-02" });
  await screen.findByText("Importar depósitos desde Excel");
  await r.user.upload(r.container.querySelector<HTMLInputElement>('input[type="file"]')!, [await excel()]);

  await r.user.click(await screen.findByRole("button", { name: "Quitar 2 duplicado(s)" }));
  expect(screen.getAllByRole("checkbox", { name: /^Importar fila/ })).toHaveLength(2);
  expect(screen.getByText(/2 duplicado\(s\) quitado\(s\)/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Quitar .* duplicado/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Todas/ })).toHaveTextContent("Todas2");

  await r.user.click(screen.getByRole("button", { name: "Volver a mostrar" }));
  expect(screen.getAllByRole("checkbox", { name: /^Importar fila/ })).toHaveLength(4);

  await r.user.click(screen.getByRole("button", { name: "Quitar 2 duplicado(s)" }));
  await r.user.click(screen.getByRole("button", { name: "Importar 2 depósito(s)" }));
  await waitFor(async () => expect((await db.select("SELECT id FROM depositos WHERE referencia IN ('100', '101')")).length).toBe(2));
});
