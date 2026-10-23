import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { createTasa } from "@/db/repos/tasas";
import { renderApp } from "@/testing/renderApp";

async function campanaConDosDias() {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const tasaMartes = await createTasa(db, { fecha: "2026-03-03", valor: "36.5", notas: null, imagenPath: null });
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "111", montoBs: "3650", imagenPath: "imagenes/a.png" }));
  await createDeposito(db, s.asignacionId, depositoBase(tasaMartes, { fecha: "2026-03-03", referencia: "222", montoBs: "730" }));
  await createDeposito(db, s.asignacionId, depositoBase(tasaMartes, { fecha: "2026-03-03", referencia: "333", montoBs: "1825" }));
  return { db, s };
}

const filas = () => screen.getAllByRole("row").map((r) => r.textContent ?? "");

it("agrupa los depósitos por día, el más reciente arriba, con la cantidad y los subtotales", async () => {
  const { db, s } = await campanaConDosDias();
  await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  const texto = filas();
  const martes = texto.findIndex((t) => t.includes("Martes 03/03/2026"));
  const lunes = texto.findIndex((t) => t.includes("Lunes 02/03/2026"));
  expect(martes).toBeLessThan(lunes);
  expect(texto[martes]).toContain("2 depósitos");
  expect(texto[martes]).toContain("2.555,00");
  expect(texto[martes]).toContain("70,00");
  // Dentro del día, en el orden en que se registraron.
  expect(texto[martes + 1]).toContain("222");
  expect(texto[martes + 2]).toContain("333");
  expect(texto[lunes]).toContain("1 depósito");
});

it("ordenada por otra columna se ve como lista, sin filas de día", async () => {
  const { db, s } = await campanaConDosDias();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  await user.click(screen.getByRole("button", { name: /Monto Bs/ }));
  expect(screen.queryByText("Martes 03/03/2026")).not.toBeInTheDocument();
  expect(screen.getAllByText("03/03/2026")).toHaveLength(2);
});

it("cuenta destino y tasa arrancan ocultas, y el comprobante es un ícono", async () => {
  const { db, s } = await campanaConDosDias();
  await renderApp(`/campanas/${s.campanaId}`, { db });
  const encabezado = (await screen.findAllByRole("rowgroup"))[0];
  expect(within(encabezado).queryByText("Cuenta destino")).not.toBeInTheDocument();
  expect(within(encabezado).queryByText("Tasa")).not.toBeInTheDocument();
  expect(within(encabezado).getByText("Gerente")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Ver comprobante" })).toHaveLength(1);
});

it("agrupada, la fecha y la tasa van en la fila del día y no como columnas", async () => {
  const { db, s } = await campanaConDosDias();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  const texto = filas();
  expect(texto[texto.findIndex((t) => t.includes("Martes 03/03/2026"))]).toContain("Tasa 36,50");
  const encabezado = () => screen.getAllByRole("rowgroup")[0];
  expect(within(encabezado()).queryByText("Fecha")).not.toBeInTheDocument();
  // Al pasar a lista vuelve la columna de fecha.
  await user.click(screen.getByRole("button", { name: /Monto Bs/ }));
  expect(within(encabezado()).getByText("Fecha")).toBeInTheDocument();
});

it("agrupada se puede ver del día más antiguo al más reciente", async () => {
  const { db, s } = await campanaConDosDias();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  await user.click(screen.getByRole("button", { name: "Recientes primero" }));
  const texto = filas();
  expect(texto.findIndex((t) => t.includes("Lunes 02/03/2026"))).toBeLessThan(texto.findIndex((t) => t.includes("Martes 03/03/2026")));
  expect(screen.getByRole("button", { name: "Antiguos primero" })).toBeInTheDocument();
});

it("el comprobante es la primera columna", async () => {
  const { db, s } = await campanaConDosDias();
  await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  const celdas = within(screen.getAllByRole("row")[1]).getAllByRole("columnheader");
  // Tras la casilla de selección (la primera fila del encabezado es la del contexto).
  expect(celdas[1]).toHaveAccessibleName("Comprobante");
});

it("un día se pliega y se despliega, y se recuerda al volver", async () => {
  const { db, s } = await campanaConDosDias();
  const { user, unmount } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  await user.click(screen.getByRole("button", { name: /Martes 03\/03\/2026/ }));
  expect(screen.queryByText("222")).not.toBeInTheDocument();
  expect(screen.getByText("111")).toBeInTheDocument();
  // Plegado sigue mostrando la cantidad y los subtotales del día, y el total no cambia.
  expect(filas().find((t) => t.includes("Martes 03/03/2026"))).toContain("2.555,00");
  expect(filas()[filas().length - 1]).toContain("Total campaña (3 depósitos)");
  unmount();

  const otra = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  expect(screen.queryByText("222")).not.toBeInTheDocument();
  await otra.user.click(screen.getByRole("button", { name: /Martes 03\/03\/2026/ }));
  expect(screen.getByText("222")).toBeInTheDocument();
});

it("se pueden plegar y desplegar todos los días", async () => {
  const { db, s } = await campanaConDosDias();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  await user.click(screen.getByRole("button", { name: "Plegar todos" }));
  expect(screen.queryByText("111")).not.toBeInTheDocument();
  expect(screen.queryByText("222")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Desplegar todos" }));
  expect(screen.getByText("111")).toBeInTheDocument();
  expect(screen.getByText("333")).toBeInTheDocument();
});

it("al buscar se ven todos los depósitos aunque el día esté plegado", async () => {
  const { db, s } = await campanaConDosDias();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  await user.click(screen.getByRole("button", { name: "Plegar todos" }));
  await user.type(screen.getByPlaceholderText("Referencia, monto, banco…"), "333");
  expect(await screen.findByText("333")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Desplegar todos" })).not.toBeInTheDocument();
});

it("agrupada, el menú de columnas no deja mostrar la fecha ni la tasa", async () => {
  const { db, s } = await campanaConDosDias();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("Martes 03/03/2026");
  await user.click(screen.getByRole("button", { name: /Columnas/ }));
  expect(await screen.findByRole("checkbox", { name: /Fecha/ })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: /Tasa/ })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: /Banco/ })).toBeEnabled();
});
