import { expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { seedBasico } from "@/db/testing/fixtures";
import { listColaDepositos } from "@/db/repos/cola";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";

const SIN_TEXTO = { lineas: [], ancho: 100, alto: 100 };

async function preparar() {
  const db = await createTestDb();
  const s = await seedBasico(db);
  tauri.invoke.mockImplementation(async (cmd: string) => (cmd === "ocr_imagen" ? SIN_TEXTO : null));
  const r = await renderApp(`/campanas/${s.campanaId}/lote`, { db });
  await screen.findByText("Subir comprobantes en lote");
  const subir = async (nombre: string) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    await r.user.upload(input, new File(["x"], nombre, { type: "image/png" }));
  };
  const elegirAna = async () => {
    await r.user.click(screen.getByLabelText("Gerente para todo el lote (opcional)"));
    await r.user.click(await screen.findByRole("option", { name: "Ana" }));
  };
  const destinos = async () => (await listColaDepositos(db, s.campanaId)).map((i) => i.borrador.destino.sel);
  return { ...r, s, subir, elegirAna, destinos };
}

it("el gerente elegido antes de subir queda en cada comprobante", async () => {
  const { s, subir, elegirAna, destinos } = await preparar();
  await elegirAna();
  await subir("1.png");
  await screen.findByText("Formato no reconocido: se llena a mano");
  await waitFor(async () => expect(await destinos()).toEqual([`a:${s.asignacionId}`]));
});

it("el gerente elegido después de subir se pone a los comprobantes ya subidos del lote", async () => {
  const { s, subir, elegirAna, destinos } = await preparar();
  await subir("1.png");
  await screen.findByText("Formato no reconocido: se llena a mano");
  await elegirAna();
  await waitFor(async () => expect(await destinos()).toEqual([`a:${s.asignacionId}`]));
});
