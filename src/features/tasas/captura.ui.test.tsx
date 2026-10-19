import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createTasa } from "@/db/repos/tasas";
import { renderApp } from "@/testing/renderApp";

it("el calendario de tasas muestra la captura de una tasa que la tiene", async () => {
  const db = await createTestDb();
  await createTasa(db, { fecha: "2026-10-15", valor: "40", notas: null, imagenPath: "imagenes/tasa.png" });
  await createTasa(db, { fecha: "2026-10-16", valor: "41", notas: null, imagenPath: null });
  const { user } = await renderApp("/tasas", { db, hoy: "2026-10-19" });
  await user.click(await screen.findByRole("button", { name: "Ver la captura de la tasa del 15/10/2026" }));
  expect(await screen.findByRole("dialog", { name: "Comprobante" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ver la captura de la tasa del 16/10/2026" })).not.toBeInTheDocument();
});
