import { expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { crearDuplicado, depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { renderApp } from "@/testing/renderApp";

const { save } = vi.hoisted(() => ({ save: vi.fn(async (_opciones: { defaultPath?: string }) => null) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: async () => null, save }));

it("exporta el Excel del gerente con su nombre y el de la campaña", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123" }));
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-10-19" });

  await user.click(await screen.findByRole("button", { name: /Exportar Excel/ }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(save.mock.calls[0][0].defaultPath).toMatch(/\.xlsx$/);
});

it("con un depósito suyo duplicado no deja exportar", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123" }));
  await crearDuplicado(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "0123" }));
  await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-10-19" });

  expect(await screen.findByRole("button", { name: /Exportar Excel/ })).toBeDisabled();
});
