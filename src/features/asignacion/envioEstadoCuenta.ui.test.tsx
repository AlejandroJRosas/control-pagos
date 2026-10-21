import { expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { crearDuplicado, depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";

// pdfmake con sus fuentes es lento en jsdom: aquí basta con que el PDF llegue al portapapeles.
vi.mock("@/export/savePdf", () => ({ pdfBytes: async () => new Uint8Array([37, 80, 68, 70]), precargarPdfMake: async () => {}, savePdf: async () => false }));

async function gerenteConDeposito(telefono: string | null = "0414-1234567") {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await db.execute("UPDATE gerentes SET telefono = ? WHERE id = ?", [telefono, s.anaId]);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123" }));
  return { db, s };
}

const copiados = () => tauri.invoke.mock.calls.filter(([cmd]) => cmd === "copiar_envio").map(([, args]) => (args as { nombre: string }).nombre);

it("copia el estado de cuenta en Excel como archivo", async () => {
  const { db, s } = await gerenteConDeposito();
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-10-21" });
  await user.click(await screen.findByRole("button", { name: "Estado de cuenta" }));
  await user.click(await screen.findByRole("button", { name: "Excel" }));
  await user.click(screen.getByRole("button", { name: "Copiar excel" }));
  await waitFor(() => expect(copiados()).toEqual(["estado-de-cuenta-ana-marzo-2026-10-21.xlsx"]));
});

it("en PDF lo copia y abre el chat con el mensaje, y recuerda el formato", async () => {
  const { db, s } = await gerenteConDeposito();
  const { user, unmount } = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-10-21" });
  await user.click(await screen.findByRole("button", { name: "Estado de cuenta" }));
  await user.click(await screen.findByRole("button", { name: "PDF" }));
  await user.click(screen.getByRole("button", { name: "Copiar y abrir WhatsApp" }));
  await waitFor(() => expect(tauri.openUrl).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/584141234567\?text=/)));
  expect(copiados()).toEqual(["estado-de-cuenta-ana-marzo-2026-10-21.pdf"]);
  unmount();

  const otra = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-10-21" });
  await otra.user.click(await screen.findByRole("button", { name: "Estado de cuenta" }));
  expect(await screen.findByRole("button", { name: "PDF" })).toHaveAttribute("aria-pressed", "true");
});

it("con un depósito duplicado no deja enviar el PDF ni el Excel, pero sí la imagen", async () => {
  const { db, s } = await gerenteConDeposito();
  await crearDuplicado(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "0123" }));
  const { user } = await renderApp(`/asignaciones/${s.asignacionId}`, { db, hoy: "2026-10-21" });
  await user.click(await screen.findByRole("button", { name: "Estado de cuenta" }));
  expect(await screen.findByRole("button", { name: "Copiar imagen" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Excel" }));
  expect(screen.getByRole("button", { name: "Copiar excel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Copiar y abrir WhatsApp" })).toBeDisabled();
});
