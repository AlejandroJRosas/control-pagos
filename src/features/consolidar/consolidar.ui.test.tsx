import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion } from "@/db/repos/asignaciones";
import { updateTasa } from "@/db/repos/tasas";
import { cargarEnvio } from "@/db/queries/envioConsolidar";
import { armarPaquete, type Paquete } from "@/domain/paquete";
import { renderApp } from "@/testing/renderApp";

const m = vi.hoisted(() => ({ paquete: null as Paquete | null, respaldo: vi.fn(async (_db: unknown, _motivo: string) => "respaldo.zip") }));

vi.mock("@/platform/paquete", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/paquete")>()),
  leerPaqueteDeCarpeta: async () => {
    if (!m.paquete) throw new Error("sin paquete");
    return m.paquete;
  },
  abrirPaqueteDeArchivo: async () => "recibidos/p1",
  abrirPaqueteDeDialogo: async () => "recibidos/p1",
  importarImagenRecibida: async () => null,
}));
vi.mock("@/platform/backup", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/backup")>()),
  respaldoAntesDe: m.respaldo,
}));

beforeEach(() => {
  m.paquete = null;
  m.respaldo.mockClear();
});

/** Instalación de otra persona con un depósito de Ana; `preparar` la ajusta antes de armar el paquete. */
async function paqueteDeOrigen(preparar?: (db: Awaited<ReturnType<typeof createTestDb>>, s: Awaited<ReturnType<typeof seedBasico>>) => Promise<void>) {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "555", montoBs: "7300" }));
  await preparar?.(db, s);
  const datos = await cargarEnvio(db, s.campanaId);
  m.paquete = armarPaquete(datos, { asignacionIds: datos.asignaciones.map((a) => a.id), soloCambios: false }, {
    appVersion: "1.0.0", creadoEn: "2026-03-05T14:30:00.000Z", origen: "PC-ANA",
  }).paquete;
}

async function destino() {
  const db = await createTestDb();
  return { db, s: await seedBasico(db) };
}

const seccion = (nombre: RegExp) => screen.findByRole("region", { name: nombre });

it("recibe un paquete y consolida", async () => {
  await paqueteDeOrigen();
  const { db, s } = await destino();
  const { user, router } = await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  expect(await seccion(/Nuevos \(1\)/)).toBeInTheDocument();
  expect(screen.getByText(/Paquete de PC-ANA/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Consolidar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}`));
  expect(m.respaldo).toHaveBeenCalledWith(db, "consolidar");
  const filas = await db.select<{ referencia: string }>("SELECT referencia FROM depositos");
  expect(filas.map((f) => f.referencia)).toEqual(["555"]);
  expect(await screen.findByText("Consolidado: 1 nuevo")).toBeInTheDocument();
});

it("pide elegir la tasa distinta antes de consolidar", async () => {
  await paqueteDeOrigen((db, s) => updateTasa(db, s.tasaId, { valor: "40", notas: null, imagenPath: null }));
  const { db, s } = await destino();
  const { user } = await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  const diferencias = await seccion(/Diferencias/);
  expect(within(diferencias).getByText(/La usan 0 depósitos tuyos/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Consolidar" })).toBeDisabled();
  await user.click(within(diferencias).getByRole("button", { name: /La del archivo/ }));
  expect(screen.getByRole("button", { name: "Consolidar" })).toBeEnabled();
});

it("gerente que no está en la campaña aparece en No se incluyen", async () => {
  await paqueteDeOrigen(async (db, s) => {
    const luis = await createGerente(db, { nombre: "Luis", telefono: null });
    const a = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luis, saldoUsd: "10" });
    await createDeposito(db, a, depositoBase(s.tasaId, { referencia: "777" }));
  });
  const { db, s } = await destino();
  await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  const fuera = await seccion(/No se incluyen \(1\)/);
  expect(within(fuera).getByText(/Luis no está en tu campaña/)).toBeInTheDocument();
  expect(within(fuera).getByText(/Para recibirlos más adelante, pide que te manden la campaña con «Solo lo que cambió desde mi último envío» desmarcado/))
    .toBeInTheDocument();
  expect(await seccion(/Nuevos \(1\)/)).toBeInTheDocument();
});

it("soltar un .cpagos abre la pantalla Consolidar", async () => {
  await paqueteDeOrigen();
  const { db, s } = await destino();
  const { router } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-06" });
  await screen.findByRole("heading", { level: 1, name: /Marzo/ });

  fireEvent.drop(window, { dataTransfer: { files: [new File(["x"], "a.cpagos")], types: ["Files"] } });
  await waitFor(() => expect(router.state.location.pathname).toBe("/consolidar"));
  expect(router.state.location.search).toBe(`?carpeta=recibidos%2Fp1&campana=${s.campanaId}`);
  expect(await seccion(/Nuevos \(1\)/)).toBeInTheDocument();
});

it("el menú de la campaña abre un archivo para consolidar", async () => {
  await paqueteDeOrigen();
  const { db, s } = await destino();
  const { user, router } = await renderApp(`/campanas/${s.campanaId}`, { db, hoy: "2026-03-06" });
  await user.click(await screen.findByRole("button", { name: /Campaña/ }));
  await user.click(await screen.findByRole("menuitem", { name: "Consolidar desde archivo…" }));
  await waitFor(() => expect(router.state.location.pathname).toBe("/consolidar"));
  expect(await seccion(/Nuevos \(1\)/)).toBeInTheDocument();
});

it("un archivo que no se puede leer ofrece abrir otro", async () => {
  const { db, s } = await destino();
  await renderApp(`/consolidar?carpeta=recibidos/viejo&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });
  expect(await screen.findByRole("button", { name: "Abrir otro archivo" })).toBeInTheDocument();
  expect(screen.getAllByText(/sin paquete/).length).toBeGreaterThan(0);
});

it("no ofrece a un gerente que ya tiene otro del archivo", async () => {
  await paqueteDeOrigen(async (db, s) => {
    const luis = await createGerente(db, { nombre: "Luis", telefono: null });
    await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luis, saldoUsd: "10" });
  });
  const { db, s } = await destino();
  const { user } = await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  await user.click(await screen.findByLabelText("Luis es…"));
  const opciones = (await screen.findAllByRole("option")).map((o) => o.textContent);
  expect(opciones).toEqual(["No incluir"]);
});
