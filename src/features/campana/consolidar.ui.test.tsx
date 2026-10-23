import { beforeEach, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { crearDuplicado, depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { renderApp } from "@/testing/renderApp";
import { tauri } from "@/testing/tauri";

beforeEach(() => {
  tauri.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "crear_paquete") return "x";
    if (cmd === "nombre_equipo") return "PC-ANA";
    if (cmd === "tamano_imagenes") return 0;
    return null;
  });
});

async function campanaConDeposito() {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "123" }));
  // Se crea con el reloj real y el envío se marca con la fecha simulada: fecha fija anterior para no depender de la hora ni la zona.
  await db.execute("UPDATE depositos SET actualizado_en = ? WHERE id = ?", ["2026-03-02T12:00:00.000Z", id]);
  return { db, s };
}

const llamadas = (cmd: string) => tauri.invoke.mock.calls.filter(([c]) => c === cmd).map(([, args]) => args as Record<string, unknown>);

async function abrir(user: Awaited<ReturnType<typeof renderApp>>["user"]) {
  await user.click(await screen.findByRole("button", { name: /Campaña/ }));
  await user.click(await screen.findByRole("menuitem", { name: "Compartir para consolidar" }));
  return screen.findByRole("button", { name: "Copiar para WhatsApp" });
}

it("comparte la campaña y lo copia para WhatsApp", async () => {
  const { db, s } = await campanaConDeposito();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-10-23" });
  await user.click(await abrir(user));
  await waitFor(() => expect(llamadas("copiar_envio")).toHaveLength(1));
  const crear = llamadas("crear_paquete");
  expect(crear[0].nombre).toBe("consolidar-marzo-pc-ana-2026-10-23.cpagos");
  expect(JSON.parse(crear[0].datos as string).depositos).toHaveLength(1);
  expect(llamadas("copiar_envio")[0].nombre).toBe("consolidar-marzo-pc-ana-2026-10-23.cpagos");
});

it('la segunda vez marca "Solo lo que cambió" y no repite lo ya enviado', async () => {
  const { db, s } = await campanaConDeposito();
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-10-23" });
  await user.click(await abrir(user));
  await waitFor(() => expect(llamadas("copiar_envio")).toHaveLength(1));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Copiar para WhatsApp" })).not.toBeInTheDocument());

  await abrir(user);
  expect(await screen.findByRole("checkbox", { name: /Solo lo que cambió/ })).toBeChecked();
  expect(await screen.findByText("0 depósitos")).toBeInTheDocument();
});

it("con duplicados no deja compartir", async () => {
  const { db, s } = await campanaConDeposito();
  await crearDuplicado(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "0123" }));
  const { user } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-10-23" });
  expect(await abrir(user)).toBeDisabled();
  expect(screen.getByRole("button", { name: "Guardar como…" })).toBeDisabled();
});
