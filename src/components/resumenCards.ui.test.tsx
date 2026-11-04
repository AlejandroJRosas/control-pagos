import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { renderApp } from "@/testing/renderApp";

it("un clic en un indicador copia su valor", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  // 1.825 Bs a 36,5 = 50 USD de 100 asignados.
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { montoBs: "1825" }));
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-10-19" });

  await user.click(await screen.findByRole("button", { name: "Copiar Saldo general: $ 100,00" }));
  expect(await navigator.clipboard.readText()).toBe("$ 100,00");
  expect(await screen.findByText("Saldo general copiado")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Copiar Pagado: $ 50,00" }));
  expect(await navigator.clipboard.readText()).toBe("$ 50,00");
  await user.click(screen.getByRole("button", { name: "Copiar Restante: $ 50,00" }));
  expect(await navigator.clipboard.readText()).toBe("$ 50,00");
  await user.click(screen.getByRole("button", { name: /^Copiar Avance: 50/ }));
  expect(await navigator.clipboard.readText()).toMatch(/^50/);
});
