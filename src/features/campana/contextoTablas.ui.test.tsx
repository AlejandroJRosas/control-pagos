import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { renderApp } from "@/testing/renderApp";

// Ana debe 100 y paga 100 + 20; Luis debe 50 y no paga.
async function campana() {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const luisId = await createGerente(db, { nombre: "Luis", telefono: null });
  await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luisId, saldoUsd: "50" });
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "111", montoBs: "3650" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "222", montoBs: "730" }));
  return { db, s };
}

const encabezado = () => screen.getAllByRole("rowgroup")[0];
const pie = () => {
  const grupos = screen.getAllByRole("rowgroup");
  return grupos[grupos.length - 1];
};

it("en la campaña, la tabla dice que son todos los depósitos, con el saldo general y el total de la campaña", async () => {
  const { db, s } = await campana();
  await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText("111");
  const contexto = within(encabezado()).getByTestId("contexto-tabla");
  expect(contexto).toHaveTextContent("Marzo·Todos los depósitos");
  expect(contexto).toHaveTextContent("Saldo general restante$ 30,00");
  expect(pie()).toHaveTextContent("Total campaña (2 depósitos)");
});

it("en un gerente, la tabla dice de quién es, con su saldo (en rojo si pagó de más) y su total", async () => {
  const { db, s } = await campana();
  await renderApp(`/asignaciones/${s.asignacionId}`, { db });
  await screen.findByText("111");
  const contexto = within(encabezado()).getByTestId("contexto-tabla");
  expect(contexto).toHaveTextContent("Marzo›Ana");
  expect(within(contexto).getByText("-$ 20,00")).toHaveClass("text-destructive");
  expect(pie()).toHaveTextContent("Total Ana (2 depósitos)");
});

it("Por gerente lleva un pie con los totales de los gerentes que se ven", async () => {
  const { db, s } = await campana();
  const { user } = await renderApp(`/campanas/${s.campanaId}?tab=gerentes`, { db });
  await screen.findByText("Luis");
  const total = pie();
  expect(total).toHaveTextContent("Total (2 gerentes)");
  expect(total).toHaveTextContent("$ 150,00");
  expect(total).toHaveTextContent("$ 120,00");
  expect(total).toHaveTextContent("$ 30,00");
  expect(total).toHaveTextContent("80,0 %");
  // Filtrado, suma solo los que quedan.
  await user.type(screen.getByRole("searchbox", { name: "Buscar gerente" }), "Luis");
  expect(pie()).toHaveTextContent("Total (1 gerente)");
  expect(pie()).toHaveTextContent("$ 50,00");
});
