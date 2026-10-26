import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { createGerente, setGerenteActivo } from "@/db/repos/gerentes";
import { setEstadoCampana } from "@/db/repos/campanas";
import { borradorTasaVacio, encolarTasa } from "@/db/repos/cola";
import { renderApp } from "@/testing/renderApp";

it("cerrar el diálogo de un gerente con cambios pregunta antes de descartarlos", async () => {
  const db = await createTestDb();
  await createGerente(db, { nombre: "Luis", telefono: null });
  const { user } = await renderApp("/gerentes", { db });
  await user.click(await screen.findByRole("button", { name: "Nuevo gerente" }));
  await user.keyboard("{Escape}");
  // Sin cambios se cierra sin preguntar.
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Nuevo gerente" }));
  await user.type(await screen.findByLabelText("Nombre"), "Ana");
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  const aviso = await screen.findByRole("alertdialog");
  expect(within(aviso).getByText("Cambios sin guardar")).toBeInTheDocument();
  // Seguir editando: el formulario queda con lo escrito.
  await user.click(within(aviso).getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Nombre")).toHaveValue("Ana");

  await user.keyboard("{Escape}");
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Descartar cambios" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("la pestaña y Ver inactivos de Gerentes quedan en la URL y se recuerdan", async () => {
  const db = await createTestDb();
  await setGerenteActivo(db, await createGerente(db, { nombre: "Luis", telefono: null }), false);
  const { user, router } = await renderApp("/gerentes", { db });
  await user.click(await screen.findByLabelText("Ver inactivos"));
  expect(await screen.findByText("Luis")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Cumpleaños" }));
  expect(router.state.location.search).toContain("tab=cumpleanos");

  await router.navigate("/tasas");
  await screen.findByRole("heading", { name: "Tasas" });
  await router.navigate("/gerentes");
  expect(await screen.findByText("Luis")).toBeInTheDocument();
});

it("la tabla de un gerente en la campaña se puede buscar", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "111" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "222" }));
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}`, { db });
  await screen.findByText("111");
  await user.type(screen.getByLabelText("Buscar"), "222");
  await waitFor(() => expect(screen.queryByText("111")).not.toBeInTheDocument());
  expect(screen.getByText("222")).toBeInTheDocument();
});

it("con la campaña cerrada los botones deshabilitados dicen por qué", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await setEstadoCampana(db, s.campanaId, "cerrada");
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db });
  const agregar = await screen.findByRole("button", { name: "Agregar gerentes" });
  expect(agregar).toBeDisabled();
  await user.hover(agregar.parentElement!);
  expect(await screen.findByText("La campaña está cerrada: reábrela para hacer cambios")).toBeInTheDocument();
});

it("en la revisión de tasas Ctrl+D pide descartar la captura, como en la de comprobantes", async () => {
  const db = await createTestDb();
  await encolarTasa(db, { imagenPath: "imagenes/t.png", nombreArchivo: "t.png", borrador: borradorTasaVacio() });
  const { user } = await renderApp("/tasas/revision", { db });
  await screen.findByRole("button", { name: "Descartar" });
  await user.keyboard("{Control>}d{/Control}");
  expect(within(await screen.findByRole("alertdialog")).getByText("Descartar imagen de tasa")).toBeInTheDocument();
});
