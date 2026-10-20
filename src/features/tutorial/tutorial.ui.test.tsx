import { beforeEach, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "@/testing/renderApp";
import { setTutorialActivado } from "@/lib/tutorial";
import { tauri } from "@/testing/tauri";
import { PASOS } from "./pasos";

// Configuración pide las rutas y la lista de respaldos.
beforeEach(() => {
  tauri.invoke.mockImplementation(async (cmd) =>
    cmd === "data_paths" ? { dbPath: "db", imagesDir: "img", backupsDir: "resp" } : cmd === "list_backups" ? [] : null,
  );
});

const tarjeta = () => screen.getByRole("dialog", { name: /./ });

it("activado, se abre solo, recorre las pantallas y al terminar se desactiva y vuelve al inicio", async () => {
  setTutorialActivado(true);
  const { user, router } = await renderApp("/gerentes");
  expect(await screen.findByRole("heading", { name: "Bienvenido a Control de Pagos" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  await user.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(screen.getByRole("heading", { name: "Campañas", level: 2 })).toBeInTheDocument();
  await waitFor(() => expect(router.state.location.pathname).toBe("/campanas"));

  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("heading", { name: "Buscar en toda la app" })).toBeInTheDocument();

  for (let i = 2; i < PASOS.length - 1; i++) await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("heading", { name: "¡Listo!" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Terminar" }));

  expect(screen.queryByRole("heading", { name: "¡Listo!" })).not.toBeInTheDocument();
  await waitFor(() => expect(router.state.location.pathname).toBe("/gerentes"));
  expect(localStorage.getItem("control-pagos:tutorial")).toBe("desactivado");
});

it("Esc lo cierra sin desactivarlo; desmarcar «Mostrar al abrir la app» sí", async () => {
  setTutorialActivado(true);
  const { user } = await renderApp("/campanas");
  await screen.findByRole("heading", { name: "Bienvenido a Control de Pagos" });
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("heading", { name: "Bienvenido a Control de Pagos" })).not.toBeInTheDocument();
  expect(localStorage.getItem("control-pagos:tutorial")).toBeNull();

  await user.click(screen.getByRole("button", { name: /Tutorial/ }));
  await user.click(within(tarjeta()).getByRole("checkbox", { name: "Mostrar al abrir la app" }));
  expect(localStorage.getItem("control-pagos:tutorial")).toBe("desactivado");
});

it("desactivado no se abre; se activa y se abre desde Configuración", async () => {
  const { user } = await renderApp("/configuracion");
  const casilla = await screen.findByRole("checkbox", { name: "Mostrar el tutorial al abrir la app" });
  expect(screen.queryByRole("heading", { name: "Bienvenido a Control de Pagos" })).not.toBeInTheDocument();
  expect(casilla).not.toBeChecked();

  await user.click(casilla);
  expect(localStorage.getItem("control-pagos:tutorial")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Ver el tutorial ahora" }));
  expect(screen.getByRole("heading", { name: "Bienvenido a Control de Pagos" })).toBeInTheDocument();
});
