import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { borradorDepositoVacio, encolarDeposito, getItemColaDeposito } from "@/db/repos/cola";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";
import banesco from "@/extraction/formatos/__fixtures__/banesco.json";

it("vuelve a leer un comprobante que no se leyó, reemplaza lo escrito a mano y Deshacer lo deja como estaba", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const b = borradorDepositoVacio(`a:${s.asignacionId}`);
  const id = await encolarDeposito(db, s.campanaId, {
    imagenPath: "imagenes/x.png",
    nombreArchivo: "x.png",
    borrador: { ...b, draft: { ...b.draft, montoBs: "5" }, auto: { estado: { montoBs: "tocado" }, confianza: {} } },
  });
  tauri.invoke.mockImplementation(async (cmd: string) => (cmd === "ocr_imagen" ? banesco : null));
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-10-18" });
  expect(await screen.findByText(/No se leyó el comprobante/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Volver a leer" }));
  await screen.findByText(/Leído de nuevo: cambiaron \d+ campos/);
  await waitFor(async () => expect((await getItemColaDeposito(db, id))?.formato).not.toBeNull());
  expect((await getItemColaDeposito(db, id))?.borrador.draft).toMatchObject({ montoBs: "431.724,30", banco: "Banesco", referencia: "62914564099" });
  await waitFor(() => expect(screen.queryByText(/No se leyó el comprobante/)).not.toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Deshacer" }));
  await waitFor(async () => expect((await getItemColaDeposito(db, id))?.formato).toBeNull());
  await new Promise((r) => setTimeout(r, 700)); // el autoguardado no vuelve a poner lo leído
  const item = await getItemColaDeposito(db, id);
  expect(item?.borrador.draft).toMatchObject({ montoBs: "5", banco: "", referencia: "" });
  expect(item?.borrador.auto.estado).toEqual({ montoBs: "tocado" });
  expect(await screen.findByText(/No se leyó el comprobante/)).toBeInTheDocument();
});

it("si la imagen sigue sin reconocerse, no cambia nada", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const b = borradorDepositoVacio(`a:${s.asignacionId}`);
  const id = await encolarDeposito(db, s.campanaId, { imagenPath: "imagenes/x.png", nombreArchivo: "x.png", borrador: { ...b, draft: { ...b.draft, montoBs: "5" } } });
  tauri.invoke.mockImplementation(async (cmd: string) => (cmd === "ocr_imagen" ? { lineas: [], ancho: 100, alto: 100 } : null));
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-10-18" });
  await user.click(await screen.findByRole("button", { name: "Volver a leer" }));
  await screen.findByText("No se reconoció la imagen: los datos quedan como estaban");
  expect((await getItemColaDeposito(db, id))?.borrador.draft.montoBs).toBe("5");
});
