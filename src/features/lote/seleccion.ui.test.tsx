import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { borradorDepositoVacio, encolarDeposito, listColaDepositos, marcarDepositoHecho } from "@/db/repos/cola";
import { createDeposito } from "@/db/repos/depositos";
import { depositoBase } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";

async function conCola(n: number) {
  const db = await createTestDb();
  const s = await seedBasico(db); // Ana en Marzo
  for (let i = 1; i <= n; i++) {
    const b = borradorDepositoVacio();
    await encolarDeposito(db, s.campanaId, { imagenPath: `imagenes/${i}.png`, nombreArchivo: `${i}.png`, borrador: { ...b, draft: { ...b.draft, banco: `Banco ${i}` } } });
  }
  return { db, s };
}

const fila = (n: number) => screen.getByText(`Banco ${n}`).closest("button") as HTMLElement;
const marcadas = () => screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-selected") === "true").map((li) => li.textContent?.match(/Banco \d/)?.[0]);

it("marca como en Windows: clic, Shift+clic para el rango y Ctrl+clic para uno más; luego asigna el gerente a todos", async () => {
  const { db, s } = await conCola(5);
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText("Banco 5");

  await user.click(fila(2));
  expect(marcadas()).toEqual(["Banco 2"]);
  await user.keyboard("{Shift>}");
  await user.click(fila(4));
  await user.keyboard("{/Shift}");
  expect(marcadas()).toEqual(["Banco 2", "Banco 3", "Banco 4"]);
  await user.keyboard("{Control>}");
  await user.click(fila(5));
  await user.click(fila(3));
  await user.keyboard("{/Control}");
  expect(marcadas()).toEqual(["Banco 2", "Banco 4", "Banco 5"]);

  await user.click(screen.getByPlaceholderText("Gerente para los marcados…"));
  await user.click(await screen.findByRole("option", { name: "Ana" }));
  await user.click(screen.getByRole("button", { name: "Asignar gerente a marcados (3)" }));
  await screen.findByText("Gerente asignado a 3 comprobante(s)");
  await waitFor(async () => {
    const cola = await listColaDepositos(db, s.campanaId);
    expect(cola.filter((i) => i.borrador.destino.sel === `a:${s.asignacionId}`).map((i) => i.borrador.draft.banco).sort()).toEqual(["Banco 2", "Banco 4", "Banco 5"]);
  });
});

it("Marcar todos y Ctrl+A marcan todos los pendientes; otra vez, los desmarcan", async () => {
  const { db, s } = await conCola(3);
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText("Banco 3");

  await user.click(screen.getByRole("checkbox", { name: "Marcar todos" }));
  expect(marcadas()).toEqual(["Banco 1", "Banco 2", "Banco 3"]);
  expect(screen.getByText("3 de 3 marcados")).toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "Marcar todos" }));
  expect(marcadas()).toEqual([]);

  (document.activeElement as HTMLElement | null)?.blur();
  await user.keyboard("{Control>}a{/Control}");
  expect(marcadas()).toEqual(["Banco 1", "Banco 2", "Banco 3"]);
});

it("las flechas ↑ y ↓ abren el comprobante anterior o el siguiente de la lista", async () => {
  const { db, s } = await conCola(3);
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText("Banco 3");
  const abierto = () => screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "true")?.textContent?.match(/Banco \d/)?.[0];

  expect(abierto()).toBe("Banco 1");
  (document.activeElement as HTMLElement | null)?.blur();
  await user.keyboard("{ArrowDown}");
  expect(abierto()).toBe("Banco 2");
  await user.keyboard("{ArrowDown}{ArrowDown}");
  expect(abierto()).toBe("Banco 3");
  await user.keyboard("{ArrowUp}");
  expect(abierto()).toBe("Banco 2");
  expect(marcadas()).toEqual(["Banco 2"]);
});

it("descarta los marcados de una vez, incluido el abierto", async () => {
  const { db, s } = await conCola(4);
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText("Banco 4");

  await user.click(fila(1));
  await user.keyboard("{Control>}");
  await user.click(fila(3));
  await user.keyboard("{/Control}");
  await user.click(screen.getByRole("button", { name: "Descartar marcados (2)" }));
  await user.click(await screen.findByRole("button", { name: "Descartar" }));
  await screen.findByText("2 comprobante(s) descartados");
  await waitFor(async () => expect((await listColaDepositos(db, s.campanaId)).map((i) => i.borrador.draft.banco)).toEqual(["Banco 2", "Banco 4"]));
  await waitFor(() => expect(screen.queryByText("Banco 1")).not.toBeInTheDocument());
});

it("quita un hecho de la cola desde su fila", async () => {
  const { db, s } = await conCola(2);
  const [primero] = await listColaDepositos(db, s.campanaId);
  await marcarDepositoHecho(db, primero.id, await createDeposito(db, s.asignacionId, depositoBase(s.tasaId)));
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText("Banco 2");

  await user.click(screen.getByRole("button", { name: /^Todos/ }));
  await user.click(screen.getByRole("button", { name: "Quitar Banco 1 de la cola" }));
  await waitFor(async () => expect((await listColaDepositos(db, s.campanaId)).map((i) => i.borrador.draft.banco)).toEqual(["Banco 2"]));
  // El depósito registrado queda.
  expect((await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos"))[0].n).toBeGreaterThan(0);
});
