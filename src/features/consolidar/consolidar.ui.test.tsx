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

const conLuis = () =>
  paqueteDeOrigen(async (db, s) => {
    const luis = await createGerente(db, { nombre: "Luis", telefono: null });
    const a = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luis, saldoUsd: "10" });
    await createDeposito(db, a, depositoBase(s.tasaId, { referencia: "777" }));
  });

it("ofrece Agregar a mi campaña y lo muestra en el resumen", async () => {
  await conLuis();
  const { db, s } = await destino();
  const { user, router } = await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  // La opción "Agregar a mi campaña" aparece cuando cargan los datos de la campaña: hasta entonces el campo está vacío.
  await waitFor(() => expect(screen.getByLabelText("Luis es…")).toHaveValue("Agregar a mi campaña"));
  expect(await seccion(/Nuevos \(2\)/)).toBeInTheDocument();
  expect(screen.getByText("Gerentes agregados a la campaña (1): Luis")).toBeInTheDocument();
  expect(screen.getByText("(nuevo en tu campaña)")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Consolidar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}`));
  const filas = await db.select<{ nombre: string; saldoUsd: string; n: number }>(
    `SELECT g.nombre, a.saldo_usd AS saldoUsd, (SELECT COUNT(*) FROM depositos d WHERE d.asignacion_id = a.id) AS n
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id WHERE a.campana_id = ? ORDER BY g.nombre`,
    [s.campanaId],
  );
  expect(filas).toEqual([{ nombre: "Ana", saldoUsd: "100", n: 1 }, { nombre: "Luis", saldoUsd: "10", n: 1 }]);
});

it("propone agregar al gerente del mismo nombre que no está en la campaña", async () => {
  await conLuis();
  const { db, s } = await destino();
  await createGerente(db, { nombre: "Luis", telefono: null });
  const { user } = await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  const campo = await screen.findByLabelText("Luis es…");
  expect(campo).toHaveValue("Agregar a Luis");
  await user.clear(campo);
  await user.click(campo);
  expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["Agregar a mi campaña", "Agregar a Luis", "No incluir"]);
});

it("gerente que no se incluye aparece en No se incluyen", async () => {
  await conLuis();
  const { db, s } = await destino();
  const { user } = await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  const campo = await screen.findByLabelText("Luis es…");
  await user.clear(campo);
  await user.type(campo, "No incl");
  await user.click(await screen.findByRole("option", { name: "No incluir" }));
  const fuera = await seccion(/No se incluyen \(1\)/);
  expect(within(fuera).getByText(/Elegiste no incluir a Luis/)).toBeInTheDocument();
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

  const campo = await screen.findByLabelText("Luis es…");
  await user.clear(campo);
  await user.click(campo);
  const opciones = (await screen.findAllByRole("option")).map((o) => o.textContent);
  expect(opciones).toEqual(["Agregar a mi campaña", "No incluir"]);
});

it("Jefe distinto agrupado por jefe: 'Todos: el del archivo' cambia el grupo", async () => {
  /** Karla y Juan, con P1 y P2 bajo `jefe`. */
  const arbol = async (db: Awaited<ReturnType<typeof createTestDb>>, campanaId: number, jefe: "Karla" | "Juan") => {
    const ids: Record<string, number> = {};
    for (const nombre of ["Karla", "Juan", "P1", "P2"]) {
      const gerenteId = await createGerente(db, { nombre, telefono: null });
      ids[nombre] = await createAsignacion(db, { campanaId, gerenteId, saldoUsd: "0", jefeId: nombre.startsWith("P") ? ids[jefe] : null });
    }
    return ids;
  };
  await paqueteDeOrigen(async (db, s) => void (await arbol(db, s.campanaId, "Juan")));
  const { db, s } = await destino();
  const ids = await arbol(db, s.campanaId, "Karla");
  const { user, router } = await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  const jefes = await seccion(/Jefe distinto \(2\)/);
  expect(within(jefes).getByText("Tu app y el archivo ponen a estos gerentes bajo jefes distintos: elige cuál queda")).toBeInTheDocument();
  expect(within(jefes).getByText("Karla → Juan · 2 gerentes")).toBeInTheDocument();
  const delArchivo = () => within(jefes).getAllByRole("button", { name: "El del archivo: Juan" });
  expect(within(jefes).getAllByRole("button", { name: "Mi jefe: Karla", pressed: true })).toHaveLength(2);
  await user.click(delArchivo()[0]);
  expect(within(jefes).getByText("Elecciones mezcladas")).toBeInTheDocument();
  await user.click(within(jefes).getByRole("button", { name: "Todos: el del archivo" }));
  expect(delArchivo().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
  expect(within(jefes).queryByText("Elecciones mezcladas")).not.toBeInTheDocument();
  expect(screen.getByText("Jefes: P1 → Juan, P2 → Juan")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Consolidar" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}`));
  const filas = await db.select<{ id: number; jefeId: number | null }>("SELECT id, jefe_id AS jefeId FROM asignaciones WHERE id IN (?, ?) ORDER BY id", [
    ids.P1, ids.P2,
  ]);
  expect(filas).toEqual([{ id: ids.P1, jefeId: ids.Juan }, { id: ids.P2, jefeId: ids.Juan }]);
});

it("un posible repetido del Provincial no entra salvo que se marque como otro pago", async () => {
  const pago = { banco: "BBVA Provincial", referencia: "V-12.345.678", montoBs: "5000" };
  await paqueteDeOrigen((db, s) => createDeposito(db, s.asignacionId, depositoBase(s.tasaId, pago)).then(() => undefined));
  const { db, s } = await destino();
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { ...pago, referencia: "12345678" }));
  const { user, router } = await renderApp(`/consolidar?carpeta=recibidos/p1&campana=${s.campanaId}`, { db, hoy: "2026-03-06" });

  const repetidos = await seccion(/Posibles repetidos \(1\)/);
  expect(await seccion(/Nuevos \(1\)/)).toBeInTheDocument();
  const casilla = within(repetidos).getByRole("checkbox", { name: "Es otro pago: que entre" });
  expect(casilla).not.toBeChecked();
  await user.click(casilla);
  expect(casilla).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Consolidar" }));

  await waitFor(() => expect(router.state.location.pathname).toBe(`/campanas/${s.campanaId}`));
  const filas = await db.select<{ referencia: string }>("SELECT referencia FROM depositos ORDER BY referencia");
  expect(filas.map((f) => f.referencia)).toEqual(["12345678", "555", "V-12.345.678"]);
});
