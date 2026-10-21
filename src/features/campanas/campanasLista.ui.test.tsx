import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderApp } from "@/testing/renderApp";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createCampana, setEstadoCampana } from "@/db/repos/campanas";

const base = { fechaFin: null, notas: null };

it("las activas van arriba y las cerradas quedan tras un divisor que las muestra u oculta", async () => {
  const db = await createTestDb();
  const marzo = await createCampana(db, { ...base, nombre: "Marzo", fechaInicio: "2026-03-01" });
  await createCampana(db, { ...base, nombre: "Abril", fechaInicio: "2026-04-01" });
  const mayo = await createCampana(db, { ...base, nombre: "Mayo", fechaInicio: "2026-05-01" });
  await setEstadoCampana(db, marzo, "cerrada");
  await setEstadoCampana(db, mayo, "cerrada");
  const { user } = await renderApp("/campanas", { db });

  const activas = await screen.findByRole("region", { name: "Activas" });
  expect(within(activas).getByText("Abril")).toBeInTheDocument();
  expect(screen.queryByText("Mayo")).not.toBeInTheDocument();

  const divisor = screen.getByRole("button", { name: /Cerradas \(2\)/ });
  expect(divisor).toHaveAttribute("aria-expanded", "false");
  await user.click(divisor);
  const cerradas = screen.getByRole("region", { name: "Cerradas" });
  expect(within(cerradas).getAllByRole("link").map((l) => l.querySelector('[data-slot="card-title"]')?.textContent)).toEqual(["Mayo", "Marzo"]);

  await user.click(divisor);
  expect(screen.queryByText("Mayo")).not.toBeInTheDocument();
});
