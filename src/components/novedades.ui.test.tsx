import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "@/testing/renderApp";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { tauri } from "@/testing/tauri";
import { createCampana } from "@/db/repos/campanas";
import { KEY_NOVEDADES_VISTAS } from "@/lib/novedades";

// Configuración pide las rutas y la lista de respaldos.
const conConfiguracion = () =>
  tauri.invoke.mockImplementation(async (cmd: string) =>
    cmd === "data_paths" ? { dbPath: "db", imagesDir: "img", backupsDir: "resp" } : cmd === "list_backups" ? [] : null,
  );

it("al abrir una versión nueva muestra sus novedades una sola vez y lleva al historial", async () => {
  conConfiguracion();
  localStorage.removeItem(KEY_NOVEDADES_VISTAS);
  const db = await createTestDb();
  await createCampana(db, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  const { user, router } = await renderApp("/campanas", { db });
  const dialogo = await screen.findByRole("dialog", { name: "Novedades de la versión 0.0.0-test" });
  expect(within(dialogo).getByText("Novedad de prueba.")).toBeInTheDocument();
  expect(within(dialogo).queryByText("Cambio viejo.")).not.toBeInTheDocument();

  await user.click(within(dialogo).getByRole("button", { name: "Ver todo el historial" }));
  await waitFor(() => expect(router.state.location.search).toBe("?tab=acerca"));
  expect(localStorage.getItem(KEY_NOVEDADES_VISTAS)).toBe("0.0.0-test");
  const historial = await screen.findByRole("region", { name: "Versión 0.0.0-test" });
  expect(within(historial).getByText("Instalada")).toBeInTheDocument();
  expect(screen.getByText("Cambio viejo.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("en una instalación nueva (sin versión vista ni campañas) no sale", async () => {
  localStorage.removeItem(KEY_NOVEDADES_VISTAS);
  await renderApp("/campanas", { db: await createTestDb() });
  await waitFor(() => expect(localStorage.getItem(KEY_NOVEDADES_VISTAS)).toBe("0.0.0-test"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("Configuración va por secciones y la elegida queda en la dirección", async () => {
  conConfiguracion();
  const { user, router } = await renderApp("/configuracion");
  expect(await screen.findByText("Apariencia")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Crear respaldo…" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Datos y respaldos" }));
  expect(await screen.findByRole("button", { name: "Crear respaldo…" })).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.search).toBe("?tab=datos"));
});
