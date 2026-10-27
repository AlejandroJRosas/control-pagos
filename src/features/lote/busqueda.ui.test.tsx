import { expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { borradorDepositoVacio, encolarDeposito } from "@/db/repos/cola";
import { renderApp } from "@/testing/renderApp";

const COLA = [
  { banco: "Banco 1", referencia: "000123456", montoBs: "1.500,00" },
  { banco: "Banco 2", referencia: "987654", montoBs: "12.345,50" },
  { banco: "Banco 3", referencia: "555", montoBs: "800,00" },
];

async function conCola() {
  const db = await createTestDb();
  const s = await seedBasico(db);
  for (const [i, d] of COLA.entries()) {
    const b = borradorDepositoVacio();
    await encolarDeposito(db, s.campanaId, { imagenPath: `imagenes/${i}.png`, nombreArchivo: `${i}.png`, borrador: { ...b, draft: { ...b.draft, ...d } } });
  }
  return { db, s };
}

const visibles = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => li.textContent?.match(/Banco \d/)?.[0])
    .filter(Boolean);

it("busca en la cola por número de referencia o por monto, con o sin separadores", async () => {
  const { db, s } = await conCola();
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText(/Banco 3/);
  const buscar = screen.getByRole("searchbox", { name: "Buscar en la cola" });

  await user.type(buscar, "123456");
  expect(visibles()).toEqual(["Banco 1"]);

  await user.clear(buscar);
  await user.type(buscar, "12345,5");
  expect(visibles()).toEqual(["Banco 2"]);

  await user.clear(buscar);
  await user.type(buscar, "1500");
  expect(visibles()).toEqual(["Banco 1"]);

  await user.clear(buscar);
  await user.type(buscar, "999");
  expect(visibles()).toEqual([]);
  expect(screen.getByText("Ningún comprobante coincide con la búsqueda.")).toBeInTheDocument();

  await user.clear(buscar);
  expect(visibles()).toEqual(["Banco 1", "Banco 2", "Banco 3"]);
});

it("Enter en el buscador abre el primero que coincide", async () => {
  const { db, s } = await conCola();
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText(/Banco 3/);
  const abierto = () => screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "true")?.textContent?.match(/Banco \d/)?.[0];
  expect(abierto()).toBe("Banco 1");

  await user.type(screen.getByRole("searchbox", { name: "Buscar en la cola" }), "800{Enter}");
  expect(abierto()).toBe("Banco 3");
});
