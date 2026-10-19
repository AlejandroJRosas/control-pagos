import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderApp } from "@/testing/renderApp";

it("monta la app y muestra la lista de campañas", async () => {
  await renderApp("/campanas");
  expect(await screen.findByRole("heading", { name: "Campañas" })).toBeInTheDocument();
});
