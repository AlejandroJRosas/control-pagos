import { expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { crearDuplicado, depositoBase } from "@/db/testing/fixtures";
import { createCampana } from "@/db/repos/campanas";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion, setJefeAsignacion } from "@/db/repos/asignaciones";
import { createDeposito } from "@/db/repos/depositos";
import { createTasa } from "@/db/repos/tasas";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";

// pdfmake con sus fuentes es lento en jsdom: aquí basta con que el PDF llegue al portapapeles.
vi.mock("@/export/savePdf", () => ({ pdfBytes: async () => new Uint8Array([37, 80, 68, 70]), precargarPdfMake: async () => {}, savePdf: async () => false }));

/** Ana (con teléfono) es jefa de Beto (sin teléfono) y Caro (con teléfono); Dani va aparte, sin teléfono. */
async function campanaConEstructura() {
  const db = await createTestDb();
  const campanaId = await createCampana(db, { nombre: "Octubre", fechaInicio: "2026-10-01", fechaFin: null, notas: null });
  const ana = await createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre: "Ana", telefono: "0414-1234567" }), saldoUsd: "100" });
  const beto = await createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre: "Beto", telefono: null }), saldoUsd: "100" });
  const caro = await createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre: "Caro", telefono: "0414-7654321" }), saldoUsd: "100" });
  const dani = await createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre: "Dani", telefono: null }), saldoUsd: "100" });
  await setJefeAsignacion(db, beto, ana);
  await setJefeAsignacion(db, caro, ana);
  return { db, campanaId, ana, beto, caro, dani };
}

async function abrir(campanaId: number, db: Awaited<ReturnType<typeof createTestDb>>) {
  const r = await renderApp(`/campanas/${campanaId}`, { db, hoy: "2026-10-19" });
  await r.user.click(await screen.findByRole("button", { name: /Campaña/ }));
  await r.user.click(await screen.findByRole("menuitem", { name: "Enviar estados de cuenta" }));
  await screen.findByRole("checkbox", { name: /Ana/ });
  return r;
}

const copiadosJuntos = () => tauri.invoke.mock.calls.filter(([cmd]) => cmd === "copiar_envios").map(([, args]) => (args as { nombres: string[] }).nombres);

it("marca al inicio a quien debe y tiene teléfono, pero deja marcar a quien no lo tiene", async () => {
  const { db, campanaId } = await campanaConEstructura();
  const { user } = await abrir(campanaId, db);
  const beto = screen.getByRole("checkbox", { name: /Beto/ });
  expect(screen.getByRole("checkbox", { name: /Caro/ })).toBeChecked();
  expect(beto).not.toBeChecked();
  expect(beto).toBeEnabled();
  expect(screen.getByRole("button", { name: "Empezar (2 con teléfono)" })).toBeEnabled();
  await user.click(beto);
  expect(beto).toBeChecked();
  // Beto no tiene teléfono: no entra en el recorrido por WhatsApp, pero sí en Copiar y Descargar.
  expect(screen.getByRole("button", { name: "Empezar (2 con teléfono)" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Copiar (3)" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Descargar (3)" })).toBeEnabled();
});

it("marcar a un jefe marca su rama entera y Copiar los copia todos juntos", async () => {
  const { db, campanaId } = await campanaConEstructura();
  const { user } = await abrir(campanaId, db);
  await user.click(screen.getByRole("checkbox", { name: "Marcar todos" }));
  await user.click(screen.getByRole("checkbox", { name: "Marcar todos" }));
  expect(screen.getByRole("checkbox", { name: /Dani/ })).not.toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: /Ana/ }));
  expect(screen.getByRole("checkbox", { name: /Beto/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Caro/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Dani/ })).not.toBeChecked();

  await user.click(screen.getByRole("button", { name: "PDF" }));
  await user.click(screen.getByRole("button", { name: "Copiar (3)" }));
  await waitFor(() =>
    expect(copiadosJuntos()).toEqual([["Ana - Octubre - 19-10-2026.pdf", "Beto - Octubre - 19-10-2026.pdf", "Caro - Octubre - 19-10-2026.pdf"]]),
  );
});

it("en PDF o Excel salta a quien tiene depósitos duplicados", async () => {
  const { db, campanaId, beto } = await campanaConEstructura();
  const tasaId = await createTasa(db, { fecha: "2026-10-15", valor: "40", notas: null, imagenPath: null });
  await createDeposito(db, beto, depositoBase(tasaId, { fecha: "2026-10-15", referencia: "123" }));
  await crearDuplicado(db, beto, depositoBase(tasaId, { fecha: "2026-10-15", referencia: "0123" }));
  const { user } = await abrir(campanaId, db);
  await user.click(screen.getByRole("checkbox", { name: /Ana/ }));
  await user.click(screen.getByRole("checkbox", { name: /Ana/ }));
  expect(screen.getByRole("checkbox", { name: /Beto/ })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Excel" }));
  await user.click(screen.getByRole("button", { name: /^Copiar \(\d\)$/ }));
  await waitFor(() => expect(copiadosJuntos()).toHaveLength(1));
  expect(copiadosJuntos()[0]).not.toContain("Beto - Octubre - 19-10-2026.xlsx");
  expect(await screen.findByText(/duplicados.*Beto/)).toBeInTheDocument();
});
