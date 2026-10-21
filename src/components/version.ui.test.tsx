import { expect, it } from "vitest";
import { act, screen } from "@testing-library/react";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";
import { posponerActualizacion } from "@/platform/actualizacion";

it("la versión está al pie de la barra lateral y un clic la copia", async () => {
  const { user } = await renderApp("/campanas");
  await user.click(await screen.findByRole("button", { name: /Versión 0\.0\.0-test/ }));
  expect(await navigator.clipboard.readText()).toBe("Control de Pagos v0.0.0-test");
  expect(await screen.findByText("Versión copiada")).toBeInTheDocument();
});

it("Configuración dice que está al día después de buscar, o muestra la versión nueva", async () => {
  tauri.invoke.mockImplementation(async (cmd: string) =>
    cmd === "data_paths" ? { dbPath: "db", imagesDir: "img", backupsDir: "resp" } : cmd === "list_backups" ? [] : null,
  );
  const { user } = await renderApp("/configuracion");
  expect(await screen.findByText("Versión instalada: 0.0.0-test")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Buscar actualizaciones" }));
  expect(await screen.findByText("Estás al día")).toBeInTheDocument();
  expect(screen.getByText(/Última comprobación: hoy/)).toBeInTheDocument();

  tauri.update = { version: "0.9.0", currentVersion: "0.0.0-test", body: "Notas", close: async () => {} };
  await user.click(screen.getByRole("button", { name: "Buscar actualizaciones" }));
  expect(await screen.findByText("Hay una versión nueva: 0.9.0")).toBeInTheDocument();
  act(() => posponerActualizacion());
});
