import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createTasa, getTasaByFecha } from "@/db/repos/tasas";
import { renderApp } from "@/testing/renderApp";

it("carga varias tasas sin captura en los días que faltan, y Deshacer las quita", async () => {
  const db = await createTestDb();
  await createTasa(db, { fecha: "2026-10-29", valor: "217", notas: null, imagenPath: null });
  const { user } = await renderApp("/tasas", { db, hoy: "2026-11-04" });

  await user.click(await screen.findByRole("button", { name: /Cargar varias/ }));
  const dialogo = await screen.findByRole("dialog");
  // Viernes 30/10, lunes 02/11, martes 03/11 y miércoles 04/11 (sin el fin de semana).
  for (const f of ["30/10/2026", "02/11/2026", "03/11/2026", "04/11/2026"]) expect(within(dialogo).getByLabelText(`Tasa del ${f}`)).toHaveValue("");
  expect(within(dialogo).queryByLabelText("Tasa del 31/10/2026")).not.toBeInTheDocument();
  expect(within(dialogo).getByRole("button", { name: /Guardar/ })).toBeDisabled();

  await user.type(within(dialogo).getByLabelText("Tasa del 30/10/2026"), "218,00");
  await user.type(within(dialogo).getByLabelText("Tasa del 02/11/2026"), "219,45");
  await user.click(within(dialogo).getByRole("button", { name: "Guardar 2 tasas" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect((await getTasaByFecha(db, "2026-10-30"))?.valor).toBe("218");
  expect((await getTasaByFecha(db, "2026-11-02"))?.valor).toBe("219.45");
  expect(await getTasaByFecha(db, "2026-11-03")).toBeNull();

  await user.click(await screen.findByRole("button", { name: "Deshacer" }));
  await waitFor(async () => expect(await getTasaByFecha(db, "2026-10-30")).toBeNull());
  expect(await getTasaByFecha(db, "2026-11-02")).toBeNull();
});

it("agrega otra fecha: si ya tiene tasa la muestra y se puede corregir; un fin de semana da error", async () => {
  const db = await createTestDb();
  await createTasa(db, { fecha: "2026-11-04", valor: "221", notas: null, imagenPath: null });
  await createTasa(db, { fecha: "2026-10-20", valor: "200", notas: null, imagenPath: null });
  const { user } = await renderApp("/tasas", { db, hoy: "2026-11-04" });

  await user.click(await screen.findByRole("button", { name: /Cargar varias/ }));
  const dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByText(/No falta ninguna tasa/)).toBeInTheDocument();

  await user.click(within(dialogo).getByRole("button", { name: "Agregar fecha" }));
  await user.type(within(dialogo).getByLabelText("Fecha de la fila 1"), "20/10/2026");
  const valor = within(dialogo).getByLabelText("Tasa del 20/10/2026");
  expect(valor).toHaveValue("200,00");
  expect(within(dialogo).getByRole("button", { name: /Guardar/ })).toBeDisabled();
  await user.clear(valor);
  await user.type(valor, "201,5");
  expect(within(dialogo).getByText(/antes 200,00/)).toBeInTheDocument();

  await user.click(within(dialogo).getByRole("button", { name: "Agregar fecha" }));
  await user.type(within(dialogo).getByLabelText("Fecha de la fila 2"), "24/10/2026");
  await user.type(within(dialogo).getByLabelText("Tasa del 24/10/2026"), "205");
  expect(within(dialogo).getByText(/Sábado: usa la tasa del lunes 26\/10\/2026/)).toBeInTheDocument();
  expect(within(dialogo).getByRole("button", { name: /Guardar/ })).toBeDisabled();
  await user.click(within(dialogo).getByRole("button", { name: "Quitar la fila del 24/10/2026" }));

  await user.click(within(dialogo).getByRole("button", { name: "Guardar 1 tasa" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect((await getTasaByFecha(db, "2026-10-20"))?.valor).toBe("201.5");
});
