import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { borradorDepositoVacio, encolarDeposito } from "@/db/repos/cola";
import { renderApp } from "@/testing/renderApp";

const contar = async (db: Awaited<ReturnType<typeof createTestDb>>) => (await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos"))[0].n;

it("Ctrl+Enter no da Hecho con un diálogo abierto; cerrado, sí", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const b = borradorDepositoVacio(`a:${s.asignacionId}`);
  await encolarDeposito(db, s.campanaId, {
    imagenPath: "imagenes/x.png",
    nombreArchivo: "x.png",
    borrador: { ...b, draft: { ...b.draft, fecha: "2026-03-02", banco: "Banesco", referencia: "77", cuentaDestino: "0102", montoBs: "3.650" } },
  });
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);

  await user.click(screen.getByRole("button", { name: "Descartar" }));
  await screen.findByRole("alertdialog");
  await user.keyboard("{Control>}{Enter}{/Control}");
  await new Promise((r) => setTimeout(r, 200));
  expect(await contar(db)).toBe(0);

  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  await user.keyboard("{Control>}{Enter}{/Control}");
  await waitFor(async () => expect(await contar(db)).toBe(1));
});
