import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { borradorDepositoVacio, encolarDeposito, listColaDepositos } from "@/db/repos/cola";
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
