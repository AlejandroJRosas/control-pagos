import { expect, it } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";
import { buscarActualizacion, buscarEnSegundoPlano, posponerActualizacion } from "@/platform/actualizacion";
import { avisarVersionNueva } from "@/lib/avisoVersionNueva";

it("con una versión nueva aparece el botón Actualizar en la barra lateral y abre el aviso", async () => {
  const { user } = await renderApp("/campanas");
  await screen.findByRole("heading", { name: "Campañas" });
  expect(screen.queryByRole("button", { name: /Actualizar a/ })).not.toBeInTheDocument();

  tauri.update = { version: "0.3.2", currentVersion: "0.3.1", body: "Notas", close: async () => {} };
  await act(() => buscarActualizacion());
  await user.click(await screen.findByRole("button", { name: "Más tarde" }));
  await waitFor(() => expect(screen.queryByText("Hay una versión nueva")).not.toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Actualizar a 0.3.2" }));
  expect(await screen.findByText("Hay una versión nueva")).toBeInTheDocument();
  act(() => posponerActualizacion());
});

it("la búsqueda periódica avisa con un mensaje cuyo botón abre el aviso", async () => {
  const { user } = await renderApp("/campanas");
  await screen.findByRole("heading", { name: "Campañas" });

  tauri.update = { version: "0.3.3", currentVersion: "0.3.1", body: "Notas", close: async () => {} };
  const u = await act(() => buscarEnSegundoPlano());
  act(() => avisarVersionNueva(u!));
  expect(await screen.findByText("Hay una versión nueva (0.3.3)")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Actualizar" }));
  expect(await screen.findByText("Hay una versión nueva")).toBeInTheDocument();
  act(() => posponerActualizacion());
});
