import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createGerente } from "@/db/repos/gerentes";
import { createEtiqueta, etiquetasDeGerente, setEtiquetasGerente } from "@/db/repos/etiquetas";
import { renderApp } from "@/testing/renderApp";

it("crea una etiqueta con nombre y color y la asigna a un gerente", async () => {
  const db = await createTestDb();
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  const { user } = await renderApp("/gerentes", { db });
  await user.click(await screen.findByRole("button", { name: "Etiquetas" }));
  const dialogo = await screen.findByRole("dialog");
  await user.type(within(dialogo).getByLabelText("Nueva etiqueta"), "VIP");
  await user.click(within(dialogo).getByRole("radio", { name: "Verde" }));
  await user.click(within(dialogo).getByRole("button", { name: "Crear" }));
  expect(await within(dialogo).findByText("0 gerentes")).toBeInTheDocument();
  await user.keyboard("{Escape}");

  const fila = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
  await user.click(within(fila).getByRole("button", { name: "Editar" }));
  await user.click(await screen.findByRole("button", { name: "VIP", pressed: false }));
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  await screen.findByText("Gerente actualizado");
  const [vip] = await etiquetasDeGerente(db, ana);
  expect(vip).toBeGreaterThan(0);
});

it("filtra la lista con los chips de etiquetas", async () => {
  const db = await createTestDb();
  const norte = await createEtiqueta(db, { nombre: "Norte", color: "azul" });
  const sur = await createEtiqueta(db, { nombre: "Sur", color: "rojo" });
  await setEtiquetasGerente(db, await createGerente(db, { nombre: "Ana", telefono: null }), [norte]);
  await setEtiquetasGerente(db, await createGerente(db, { nombre: "Luis", telefono: null }), [sur]);
  await createGerente(db, { nombre: "Pedro", telefono: null });
  const { user } = await renderApp("/gerentes", { db });
  await screen.findByText("Pedro");
  const filtro = screen.getByRole("group", { name: "Filtrar por etiqueta" });

  await user.click(within(filtro).getByRole("button", { name: "Norte" }));
  expect(screen.getByText("Ana")).toBeInTheDocument();
  expect(screen.queryByText("Luis")).not.toBeInTheDocument();
  expect(screen.queryByText("Pedro")).not.toBeInTheDocument();

  await user.click(within(filtro).getByRole("button", { name: "Sur" }));
  expect(screen.getByText("Luis")).toBeInTheDocument();
  expect(screen.queryByText("Pedro")).not.toBeInTheDocument();

  await user.click(within(filtro).getByRole("button", { name: "Quitar filtro" }));
  expect(screen.getByText("Pedro")).toBeInTheDocument();
});
