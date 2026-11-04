import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { setEstadoCampana, updateCampana } from "@/db/repos/campanas";
import { createMeta, listMetas } from "@/db/repos/metas";
import { renderApp } from "@/testing/renderApp";

async function campanaConPagos() {
  const db = await createTestDb();
  const s = await seedBasico(db);
  // 1.825 Bs a 36,5 = 50 USD de 100.
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { montoBs: "1825" }));
  return { db, s };
}

it("agrega una meta, la marca en la barra con lo que falta, y se edita y elimina desde su marca", async () => {
  const { db, s } = await campanaConPagos();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-05" });

  const avance = await screen.findByRole("region", { name: "Avance de la campaña" });
  expect(within(avance).getByText("50,0 %")).toBeInTheDocument();
  expect(within(avance).getByText(/Sin metas/)).toBeInTheDocument();
  // Lo pagado va sobre la barra, en la punta del progreso.
  const actual = within(avance).getByText("$ 50,00");
  expect(actual.closest("[data-pagado-actual]")).toHaveStyle({ left: "50%" });

  await user.click(within(avance).getByRole("button", { name: "Agregar meta" }));
  let dialogo = await screen.findByRole("dialog");
  await user.type(within(dialogo).getByLabelText("Monto a pagar (USD)"), "80");
  const fecha = within(dialogo).getByLabelText("Para el");
  await user.clear(fecha);
  await user.type(fecha, "20/03/2026");
  expect(within(dialogo).getByText(/80,0 % del saldo general/)).toBeInTheDocument();
  await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  const marca = await within(avance).findByRole("button", { name: /Meta \$ 80,00 para el 20\/03\/2026 · faltan \$ 30,00/ });
  expect(within(avance).getByText(/Próxima meta/)).toBeInTheDocument();
  expect(within(avance).getByText(/en 15 días/)).toBeInTheDocument();

  await user.click(marca);
  dialogo = await screen.findByRole("dialog");
  await user.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
  const confirmar = await screen.findByRole("alertdialog");
  await user.click(within(confirmar).getByRole("button", { name: "Eliminar" }));
  await waitFor(async () => expect(await listMetas(db, s.campanaId)).toEqual([]));
  expect(await within(avance).findByText(/Sin metas/)).toBeInTheDocument();
});

it("al 100 % muestra la fecha final de la campaña; una meta cumplida y una vencida se distinguen", async () => {
  const { db, s } = await campanaConPagos();
  await updateCampana(db, s.campanaId, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: "2026-03-31", notas: null });
  await createMeta(db, s.campanaId, { montoUsd: "40", fecha: "2026-03-10", nota: null });
  await createMeta(db, s.campanaId, { montoUsd: "70", fecha: "2026-03-03", nota: null });
  await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-05" });

  const avance = await screen.findByRole("region", { name: "Avance de la campaña" });
  expect(within(avance).getByText("31/03/2026")).toBeInTheDocument();
  expect(within(avance).getByRole("button", { name: /Meta \$ 40,00 para el 10\/03\/2026 · cumplida/ })).toBeInTheDocument();
  expect(within(avance).getByRole("button", { name: /Meta \$ 70,00 para el 03\/03\/2026 · vencida · faltan \$ 20,00/ })).toBeInTheDocument();
});

it("al pasar sobre una meta marca el trayecto desde lo pagado, atenúa las demás y dice solo lo que falta, la fecha y los días", async () => {
  const { db, s } = await campanaConPagos();
  await createMeta(db, s.campanaId, { montoUsd: "40", fecha: "2026-03-10", nota: null });
  await createMeta(db, s.campanaId, { montoUsd: "70", fecha: "2026-03-20", nota: null });
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-05" });

  const avance = await screen.findByRole("region", { name: "Avance de la campaña" });
  const meta70 = within(avance).getByRole("button", { name: /Meta \$ 70,00/ });
  const meta40 = within(avance).getByRole("button", { name: /Meta \$ 40,00/ });
  // Sin el aviso del sistema con todo el texto.
  expect(meta70).not.toHaveAttribute("title");
  expect(within(avance).queryByRole("tooltip")).not.toBeInTheDocument();

  await user.hover(meta70);
  const casilla = within(avance).getByRole("tooltip");
  expect(casilla).toHaveTextContent("Faltan $ 20,00");
  expect(casilla).toHaveTextContent("20/03/2026");
  expect(casilla).toHaveTextContent("en 15 días");
  expect(casilla).not.toHaveTextContent("Meta");
  // Trayecto de 50 % (lo pagado) a 70 % (la meta).
  expect(avance.querySelector("[data-trayecto]")).toHaveStyle({ left: "50%", width: "20%" });
  expect(meta40).toHaveAttribute("data-atenuada");
  expect(meta70).not.toHaveAttribute("data-atenuada");

  await user.unhover(meta70);
  expect(within(avance).queryByRole("tooltip")).not.toBeInTheDocument();
  expect(avance.querySelector("[data-trayecto]")).toBeNull();
  expect(meta40).not.toHaveAttribute("data-atenuada");

  // Una meta cumplida lo dice, sin trayecto.
  await user.hover(meta40);
  expect(within(avance).getByRole("tooltip")).toHaveTextContent("Cumplida");
  expect(avance.querySelector("[data-trayecto]")).toBeNull();
});

it("con la campaña cerrada no se agregan metas", async () => {
  const { db, s } = await campanaConPagos();
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-05" });
  const avance = await screen.findByRole("region", { name: "Avance de la campaña" });
  expect(within(avance).getByRole("button", { name: "Agregar meta" })).toBeDisabled();
});

it("la lista de Campañas marca las metas en la barra de avance", async () => {
  const { db, s } = await campanaConPagos();
  await createMeta(db, s.campanaId, { montoUsd: "80", fecha: "2026-03-20", nota: null });
  await renderApp("/campanas", { db, hoy: "2026-03-05" });
  expect(await screen.findByRole("img", { name: /Meta \$ 80,00 para el 20\/03\/2026 · faltan \$ 30,00/ })).toBeInTheDocument();
});

it("el Resumen marca las metas de cada campaña activa", async () => {
  const { db, s } = await campanaConPagos();
  await createMeta(db, s.campanaId, { montoUsd: "40", fecha: "2026-03-20", nota: null });
  await renderApp("/resumen", { db, hoy: "2026-03-05" });
  expect(await screen.findByRole("img", { name: /Meta \$ 40,00 para el 20\/03\/2026 · cumplida/ })).toBeInTheDocument();
});
