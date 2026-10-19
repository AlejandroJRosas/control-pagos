import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";

const SIN_TEXTO = { lineas: [], ancho: 100, alto: 100 };

/** El OCR responde solo cuando la prueba llama a `terminar`. */
function ocrEnPausa() {
  let terminar = () => {};
  const listo = new Promise<void>((r) => (terminar = r));
  tauri.invoke.mockImplementation(async (cmd: string) => {
    if (cmd !== "ocr_imagen") return null;
    await listo;
    return SIN_TEXTO;
  });
  return () => terminar();
}

async function subir(user: Awaited<ReturnType<typeof renderApp>>["user"]) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File(["x"], "1.png", { type: "image/png" }));
}

it("Enter va a la revisión cuando ya se leyó todo", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  tauri.invoke.mockImplementation(async (cmd: string) => (cmd === "ocr_imagen" ? SIN_TEXTO : null));
  const { user, router } = await renderApp(`/campanas/${s.campanaId}/lote`, { db });
  await screen.findByText("Subir comprobantes en lote");
  await subir(user);
  await screen.findByText("Formato no reconocido: se llena a mano");
  expect(screen.getByText("1 subido(s)")).toBeInTheDocument();

  (document.activeElement as HTMLElement | null)?.blur();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}/revision`));
});

it("mientras se lee, Ctrl+Enter espera a que termine y entonces abre la revisión", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const terminar = ocrEnPausa();
  const { user, router } = await renderApp(`/campanas/${s.campanaId}/lote`, { db });
  await screen.findByText("Subir comprobantes en lote");
  await subir(user);
  await screen.findByText(/leyendo 1…/);

  (document.activeElement as HTMLElement | null)?.blur();
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(await screen.findByRole("button", { name: "Esperando la lectura (clic para cancelar)" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}/lote`);

  terminar();
  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}/revision`));
});
