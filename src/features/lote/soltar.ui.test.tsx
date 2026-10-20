import { beforeEach, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { setEstadoCampana } from "@/db/repos/campanas";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";

const SIN_TEXTO = { lineas: [], ancho: 100, alto: 100 };

beforeEach(() => {
  tauri.invoke.mockImplementation(async (cmd: string) => (cmd === "ocr_imagen" ? SIN_TEXTO : null));
  // jsdom no trae las URL de objetos que usa la vista previa.
  URL.createObjectURL = () => "blob:prueba";
  URL.revokeObjectURL = () => {};
});

const imagenes = (n: number) => Array.from({ length: n }, (_, i) => new File(["x"], `${i + 1}.png`, { type: "image/png" }));

/** Arrastra los archivos sobre el cuerpo de la página (fuera de cualquier zona propia) hasta que el aviso diga `aviso`, y los suelta. */
async function soltar(files: File[], aviso: string | RegExp) {
  const dataTransfer = { files, types: ["Files"], items: files.map((f) => ({ kind: "file", type: f.type })) };
  await waitFor(() => {
    fireEvent.dragOver(document.body, { dataTransfer });
    expect(screen.getByText(aviso)).toBeInTheDocument();
  });
  fireEvent.drop(document.body, { dataTransfer });
}

it("una imagen soltada en la campaña abre el registro del depósito con ella", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { router } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByRole("button", { name: /Subir lote/ });
  await soltar(imagenes(1), "Suelta para registrar un depósito en Marzo");
  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}/depositos/nuevo`));
  expect(await screen.findByRole("img", { name: "Comprobante" })).toHaveAttribute("src", "blob:prueba");
});

it("varias imágenes soltadas en el gerente van al lote con el gerente elegido", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { router } = await renderApp(`/asignaciones/${s.asignacionId}`, { db });
  await screen.findByRole("button", { name: /Subir lote/ });
  await soltar(imagenes(3), "Suelta para subir 3 comprobantes en lote a Ana (Marzo)");
  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}/lote`));
  expect(await screen.findByText(/3 subido\(s\)/)).toBeInTheDocument();
  expect(screen.getByRole("combobox")).toHaveValue("Ana");
});

it("en una campaña cerrada no acepta imágenes", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await setEstadoCampana(db, s.campanaId, "cerrada");
  const { router } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByText(/La campaña está cerrada/);
  const texto = "La campaña Marzo está cerrada: no se pueden agregar comprobantes";
  await soltar(imagenes(1), texto);
  expect(await screen.findByText(texto)).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}`);
});

it("L abre la subida en lote de la campaña", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const { user, router } = await renderApp(`/campanas/${s.campanaId}`, { db });
  await screen.findByRole("button", { name: /Subir lote/ });
  await user.keyboard("l");
  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}/lote`));
});

it("una captura soltada en Tasas abre la tasa nueva con ella; varias van al lote de tasas", async () => {
  const db = await createTestDb();
  const { user, router } = await renderApp("/tasas", { db, hoy: "2026-10-19" });
  await screen.findByRole("link", { name: /Subir lote/ });
  await soltar(imagenes(1), "Suelta para registrar una tasa con esta captura");
  expect(await screen.findByRole("dialog", { name: "Registrar tasa del día" })).toBeInTheDocument();
  expect(await screen.findByRole("img", { name: "Captura de la tasa (opcional)" })).toHaveAttribute("src", "blob:prueba");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  await soltar(imagenes(2), "Suelta para subir 2 capturas de tasa en lote");
  await waitFor(() => expect(router.state.location.pathname).toBe("/tasas/lote"));
  expect(await screen.findByText(/2 subido\(s\)/)).toBeInTheDocument();
});
