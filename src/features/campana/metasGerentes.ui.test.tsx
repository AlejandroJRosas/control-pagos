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
