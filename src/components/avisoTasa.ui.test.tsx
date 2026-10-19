import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderApp } from "@/testing/renderApp";

it("avisa que falta la tasa de hoy y desaparece al registrarla", async () => {
  const { user } = await renderApp("/campanas", { hoy: "2026-10-19" });
  expect(await screen.findByText("Falta la tasa de hoy (lunes 19/10/2026)")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Registrar tasa" }));
  const dialogo = await screen.findByRole("dialog");
  await user.type(within(dialogo).getByLabelText("Bs por USD"), "40,5");
  await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(screen.queryByText(/Falta la tasa de hoy/)).not.toBeInTheDocument());
});

it("en fin de semana no avisa", async () => {
  await renderApp("/campanas", { hoy: "2026-10-18" });
  await screen.findByRole("heading", { name: "Campañas" });
  await new Promise((r) => setTimeout(r, 100));
  expect(screen.queryByText(/Falta la tasa de hoy/)).not.toBeInTheDocument();
});
