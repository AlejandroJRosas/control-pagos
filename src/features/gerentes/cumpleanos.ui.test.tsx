import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createGerente, getGerente } from "@/db/repos/gerentes";
import { getAjuste } from "@/db/repos/ajustes";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";

it("guarda la fecha de nacimiento desde el formulario del gerente", async () => {
  const db = await createTestDb();
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  const { user } = await renderApp("/gerentes", { db, hoy: "2026-10-20" });
  const fila = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
  await user.click(within(fila).getByRole("button", { name: "Editar" }));
  await user.type(await screen.findByLabelText("Fecha de nacimiento (opcional)"), "23101990");
  await user.click(screen.getByRole("button", { name: "Guardar" }));
  await screen.findByText("Gerente actualizado");
  expect(await getGerente(db, ana)).toMatchObject({ nacimiento: "1990-10-23" });
});

it("avisa el cumpleaños que se acerca con la edad y se puede cerrar por hoy", async () => {
  const db = await createTestDb();
  await createGerente(db, { nombre: "Ana", telefono: null, nacimiento: "1990-10-23" });
  const { user } = await renderApp("/campanas", { db, hoy: "2026-10-20" });
  const aviso = await screen.findByRole("status", { name: "Cumpleaños" });
  expect(aviso).toHaveTextContent("Ana cumple 36 años en 3 días (viernes 23/10)");
  await user.click(within(aviso).getByRole("button", { name: "Cerrar por hoy" }));
  await waitFor(() => expect(screen.queryByRole("status", { name: "Cumpleaños" })).not.toBeInTheDocument());
});

it("el día del cumpleaños lo anuncia aunque se haya cerrado antes", async () => {
  const db = await createTestDb();
  await createGerente(db, { nombre: "Ana", telefono: null, nacimiento: "1990-10-20" });
  localStorage.setItem("cumpleanos-cerrado", "2026-10-19");
  await renderApp("/campanas", { db, hoy: "2026-10-20" });
  const aviso = await screen.findByRole("status", { name: "Cumpleaños" });
  expect(aviso).toHaveTextContent("¡Hoy cumple 36 años Ana!");
});

it("muestra el calendario de cumpleaños en Gerentes", async () => {
  const db = await createTestDb();
  await createGerente(db, { nombre: "Ana", telefono: null, nacimiento: "1990-10-23" });
  await createGerente(db, { nombre: "Luis", telefono: null, nacimiento: "1980-11-02" });
  const { user } = await renderApp("/gerentes", { db, hoy: "2026-10-20" });
  await user.click(await screen.findByRole("tab", { name: "Cumpleaños" }));
  const calendario = await screen.findByRole("group", { name: "Cumpleaños de octubre de 2026" });
  expect(within(calendario).getByRole("link", { name: "Ana (36)" })).toBeInTheDocument();
  expect(screen.getByText("1 cumpleaños este mes")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Mes siguiente" }));
  expect(await screen.findByRole("link", { name: "Luis (46)" })).toBeInTheDocument();
});

it("cambia los días de antelación en Configuración", async () => {
  const db = await createTestDb();
  tauri.invoke.mockImplementation(async (cmd: string) =>
    cmd === "data_paths" ? { dbPath: "db", imagesDir: "img", backupsDir: "resp" } : cmd === "list_backups" ? [] : null,
  );
  const { user } = await renderApp("/configuracion", { db });
  const campo = await screen.findByLabelText("Días de antelación");
  expect(campo).toHaveValue(3);
  await user.clear(campo);
  await user.type(campo, "7");
  await user.click(screen.getByRole("button", { name: "Guardar antelación" }));
  await waitFor(async () => expect(await getAjuste(db, "cumple_antelacion")).toBe("7"));
});
