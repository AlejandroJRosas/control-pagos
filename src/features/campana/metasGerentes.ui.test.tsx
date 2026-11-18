import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { createMeta } from "@/db/repos/metas";
import { renderApp } from "@/testing/renderApp";

/** Ana al 70 % y Luis al 30 % (100 USD cada uno), con una meta de 60 % para el 20/03. */
async function campanaConMeta({ porcentaje = true } = {}) {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const luis = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: await createGerente(db, { nombre: "Luis", telefono: null }), saldoUsd: "100" });
  // 36,5 Bs por USD: 2.555 Bs = 70 USD, 1.095 Bs = 30 USD.
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { montoBs: "2555", referencia: "1" }));
  await createDeposito(db, luis, depositoBase(s.tasaId, { montoBs: "1095", referencia: "2" }));
  const metaId = porcentaje
    ? await createMeta(db, s.campanaId, { porcentaje: "60", montoUsd: null, fecha: "2026-03-20", nota: null })
    : await createMeta(db, s.campanaId, { porcentaje: null, montoUsd: "120", fecha: "2026-03-20", nota: null });
  return { db, s, luis, metaId };
}

const fila = (nombre: string) => screen.getByText(nombre, { selector: "[data-gerente]" }).closest("tr")!;

it("Por gerente muestra quiénes cumplen la meta por porcentaje y filtra a los que no", async () => {
  const { db, s } = await campanaConMeta();
  const { user } = await renderApp(`/campanas/${s.campanaId}?tab=gerentes`, { db, hoy: "2026-03-05" });

  expect(await screen.findByLabelText("Meta")).toHaveValue("60,0 % · 20/03/2026");
  expect(screen.getByRole("columnheader", { name: /Meta 60,0 %/ })).toBeInTheDocument();
  expect(within(fila("Ana")).getByText("Cumplida")).toBeInTheDocument();
  expect(within(fila("Luis")).getByText("Faltan $ 30,00")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /^No cumplieron\s*1$/ }));
  await waitFor(() => expect(screen.queryByText("Ana", { selector: "td *, td" })).not.toBeInTheDocument());
  expect(screen.getByText("Luis")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Cumplieron\s*1$/ })).toBeInTheDocument();
});

it("una meta de la URL que no existe cae a la meta por defecto", async () => {
  const { db, s } = await campanaConMeta();
  await renderApp(`/campanas/${s.campanaId}?tab=gerentes&meta=999`, { db, hoy: "2026-03-05" });
  expect(await screen.findByLabelText("Meta")).toHaveValue("60,0 % · 20/03/2026");
});

it("sin metas por porcentaje no hay selector, chips ni columna de meta", async () => {
  const { db, s } = await campanaConMeta({ porcentaje: false });
  await renderApp(`/campanas/${s.campanaId}?tab=gerentes`, { db, hoy: "2026-03-05" });
  await screen.findByText("Luis", { selector: "[data-gerente]" });
  expect(screen.queryByLabelText("Meta")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Cumplieron/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: /^Meta/ })).not.toBeInTheDocument();
});

it("la casilla de la meta dice cuántos gerentes la cumplen y lleva a Por gerente con esa meta", async () => {
  const { db, s, metaId } = await campanaConMeta();
  const { user, router } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-05" });
  const avance = await screen.findByRole("region", { name: "Avance de la campaña" });
  // Campaña: 60 % de 200 = 120; pagado 100.
  await user.hover(within(avance).getByRole("button", { name: /Meta 60,0 % \(\$ 120,00\) para el 20\/03\/2026 · faltan \$ 20,00/ }));
  const casilla = within(avance).getByRole("tooltip");
  expect(casilla).toHaveTextContent("1 de 2 gerentes la cumplen");

  await user.click(within(casilla).getByRole("button", { name: "Ver gerentes" }));
  expect(await screen.findByLabelText("Meta")).toHaveValue("60,0 % · 20/03/2026");
  expect(screen.getByText("Luis", { selector: "[data-gerente]" })).toBeInTheDocument();
  expect(router.state.location.search).toContain(`meta=${metaId}`);
});

it("el gerente en la campaña ve su avance en grande con las metas por porcentaje sobre su saldo (no las de monto)", async () => {
  const { db, s, luis } = await campanaConMeta();
  await createMeta(db, s.campanaId, { porcentaje: null, montoUsd: "150", fecha: "2026-03-25", nota: null });
  const { user } = await renderApp(`/asignaciones/${luis}`, { db, hoy: "2026-03-05" });
  const avance = await screen.findByRole("region", { name: "Avance de Luis" });
  const meta = within(avance).getByRole("button", { name: /Meta 60,0 % \(\$ 60,00\) para el 20\/03\/2026 · faltan \$ 30,00/ });
  expect(within(avance).queryByRole("button", { name: /Meta \$ 150,00/ })).not.toBeInTheDocument();
  expect(within(avance).getByText(/Próxima meta/)).toHaveTextContent("faltan $ 30,00");
  // Las metas son de la campaña: aquí no se agregan ni se editan, y la casilla no cuenta gerentes.
  expect(within(avance).queryByRole("button", { name: /Agregar meta/ })).not.toBeInTheDocument();
  await user.hover(meta);
  expect(within(avance).getByRole("tooltip")).not.toHaveTextContent("gerentes");
  await user.click(meta);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("sin metas por porcentaje el gerente sigue con la tarjeta de Avance", async () => {
  const { db, luis } = await campanaConMeta({ porcentaje: false });
  await renderApp(`/asignaciones/${luis}`, { db, hoy: "2026-03-05" });
  await screen.findByText("Luis", { selector: "h1, h1 *" });
  expect(screen.queryByRole("region", { name: "Avance de Luis" })).not.toBeInTheDocument();
});

it("un gerente sin saldo asignado no lleva marcas de metas por porcentaje en su barra", async () => {
  const { db, s } = await campanaConMeta();
  const pedro = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: await createGerente(db, { nombre: "Pedro", telefono: null }), saldoUsd: "0" });
  await renderApp(`/asignaciones/${pedro}`, { db, hoy: "2026-03-05" });
  await screen.findByText("Pedro", { selector: "h1, h1 *" });
  expect(screen.queryByRole("img", { name: /Meta/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Avance de Pedro" })).not.toBeInTheDocument();
});

it("la campaña sin saldo asignado dice que la meta por porcentaje no tiene saldo, no lo que falta", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createAsignacion(db, { campanaId: s.campanaId, gerenteId: await createGerente(db, { nombre: "Luis", telefono: null }), saldoUsd: "0" });
  await db.execute("UPDATE asignaciones SET saldo_usd = '0' WHERE id = ?", [s.asignacionId]);
  await createMeta(db, s.campanaId, { porcentaje: "60", montoUsd: null, fecha: "2026-03-20", nota: null });
  await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-05" });
  const avance = await screen.findByRole("region", { name: "Avance de la campaña" });
  expect(within(avance).getByRole("button", { name: /Meta 60,0 % \(\$ 0,00\) para el 20\/03\/2026 · sin saldo asignado/ })).toBeInTheDocument();
  expect(within(avance).getByText(/Próxima meta/).textContent).not.toContain("faltan");
});
