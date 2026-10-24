import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createCampana, setEstadoCampana } from "@/db/repos/campanas";
import { createGerente } from "@/db/repos/gerentes";
import { createAsignacion, setJefeAsignacion } from "@/db/repos/asignaciones";
import { renderApp } from "@/testing/renderApp";

it("el formulario del gerente elige su jefe y no ofrece a su propia rama", async () => {
  const db = await createTestDb();
  const campanaId = await createCampana(db, { nombre: "Octubre", fechaInicio: "2026-10-01", fechaFin: null, notas: null });
  const ana = await createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre: "Ana", telefono: null }), saldoUsd: "100" });
  const luis = await createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre: "Luis", telefono: null }), saldoUsd: "100" });
  const { user } = await renderApp(`/campanas/${campanaId}?tab=gerentes`, { db, hoy: "2026-10-19" });

  const filaLuis = (await screen.findByText("Luis")).closest("tr") as HTMLElement;
  await user.click(within(filaLuis).getByRole("button", { name: "Editar" }));
  let dialogo = await screen.findByRole("dialog");
  expect(within(dialogo).getByText("Editar a Luis en la campaña")).toBeInTheDocument();
  await user.click(within(dialogo).getByLabelText("Jefe"));
  await user.click(await screen.findByRole("option", { name: "Ana" }));
  await user.click(within(dialogo).getByRole("button", { name: "Guardar" }));
  await screen.findByText("Gerente actualizado");
  const [fila] = await db.select<{ jefeId: number | null }>("SELECT jefe_id AS jefeId FROM asignaciones WHERE id = ?", [luis]);
  expect(fila.jefeId).toBe(ana);

  const filaAna = (await screen.findByText("Ana")).closest("tr") as HTMLElement;
  await user.click(within(filaAna).getByRole("button", { name: "Editar" }));
  dialogo = await screen.findByRole("dialog");
  await user.click(within(dialogo).getByLabelText("Jefe"));
  expect(await screen.findByRole("option", { name: "Sin jefe" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Luis" })).not.toBeInTheDocument();
});

it("Por gerente muestra el árbol con sangría, pliega ramas y con búsqueda u otro orden es lista plana", async () => {
  const db = await createTestDb();
  const campanaId = await createCampana(db, { nombre: "Octubre", fechaInicio: "2026-10-01", fechaFin: null, notas: null });
  const nueva = async (nombre: string, saldoUsd: string) =>
    createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre, telefono: null }), saldoUsd });
  const ana = await nueva("Ana", "100");
  const bruno = await nueva("Bruno", "50");
  const zoe = await nueva("Zoe", "70");
  const pedro = await nueva("Pedro", "30");
  await setJefeAsignacion(db, zoe, ana);
  await setJefeAsignacion(db, pedro, zoe);
  expect(bruno).toBeGreaterThan(0);
  const { user } = await renderApp(`/campanas/${campanaId}?tab=gerentes`, { db, hoy: "2026-10-19" });

  const fila = async (nombre: string) => (await screen.findByText(nombre)).closest("tr") as HTMLElement;
  const nombres = () => screen.getAllByRole("row").map((r) => r.querySelector("[data-gerente]")?.textContent).filter(Boolean);

  await screen.findByText("Ana");
  expect(within(await fila("Ana")).getByText(/· 2 debajo/)).toBeInTheDocument();
  expect(nombres()).toEqual(["Ana", "Zoe", "Pedro", "Bruno"]);
  expect((await fila("Pedro")).querySelector('[data-nivel="2"]')).not.toBeNull();

  await user.click(screen.getByRole("button", { name: "Plegar a Ana" }));
  expect(screen.queryByText("Zoe")).not.toBeInTheDocument();
  expect(screen.queryByText("Pedro")).not.toBeInTheDocument();
  expect(screen.getByText("Bruno")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Buscar gerente"), "Pedro");
  expect(await screen.findByText("Pedro")).toBeInTheDocument();
  expect((await fila("Pedro")).querySelector("[data-nivel]")).toBeNull();
  await user.clear(screen.getByLabelText("Buscar gerente"));

  await user.click(await screen.findByRole("button", { name: "Restante" }));
  expect(await screen.findByText("Pedro")).toBeInTheDocument();
  expect((await fila("Pedro")).querySelector('[data-nivel="2"]')).toBeNull();
  expect(screen.queryByRole("button", { name: /Plegar a|Desplegar a/ })).not.toBeInTheDocument();
});

/** dataTransfer falso: jsdom no lo trae. */
function arrastre() {
  const datos = new Map<string, string>();
  return {
    types: [] as string[],
    effectAllowed: "all",
    dropEffect: "none",
    setData: (k: string, v: string) => void datos.set(k, v),
    getData: (k: string) => datos.get(k) ?? "",
  };
}

async function campanaConArbol() {
  const db = await createTestDb();
  const campanaId = await createCampana(db, { nombre: "Octubre", fechaInicio: "2026-10-01", fechaFin: null, notas: null });
  const nueva = async (nombre: string) => createAsignacion(db, { campanaId, gerenteId: await createGerente(db, { nombre, telefono: null }), saldoUsd: "100" });
  const ids = { ana: await nueva("Ana"), luis: await nueva("Luis"), jose: await nueva("José"), rosa: await nueva("Rosa") };
  await setJefeAsignacion(db, ids.luis, ids.ana);
  const jefeDe = async (id: number) =>
    (await db.select<{ jefeId: number | null }>("SELECT jefe_id AS jefeId FROM asignaciones WHERE id = ?", [id]))[0].jefeId;
  return { db, campanaId, ids, jefeDe };
}

it("Estructura dibuja la pirámide, arrastra para cambiar el jefe y deshace", async () => {
  const { db, campanaId, ids, jefeDe } = await campanaConArbol();
  const { user } = await renderApp(`/campanas/${campanaId}?tab=estructura`, { db, hoy: "2026-10-19" });

  const sueltos = await screen.findByRole("region", { name: "Sin estructura" });
  expect(within(sueltos).getByRole("button", { name: "José" })).toBeInTheDocument();
  expect(within(sueltos).getByRole("button", { name: "Rosa" })).toBeInTheDocument();
  expect(within(screen.getByRole("group", { name: "Rama de Ana" })).getByRole("button", { name: "Luis" })).toBeInTheDocument();

  let dt = arrastre();
  fireEvent.dragStart(screen.getByRole("button", { name: "José" }), { dataTransfer: dt });
  fireEvent.dragOver(screen.getByRole("button", { name: "Ana" }), { dataTransfer: dt });
  fireEvent.drop(screen.getByRole("button", { name: "Ana" }), { dataTransfer: dt });
  expect(await screen.findByText("José ahora está bajo Ana")).toBeInTheDocument();
  expect(await jefeDe(ids.jose)).toBe(ids.ana);
  expect(await within(screen.getByRole("group", { name: "Rama de Ana" })).findByRole("button", { name: "José" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Deshacer" }));
  await waitFor(async () => expect(await jefeDe(ids.jose)).toBeNull());
  expect(await within(screen.getByRole("region", { name: "Sin estructura" })).findByRole("button", { name: "José" })).toBeInTheDocument();

  dt = arrastre();
  fireEvent.dragStart(screen.getByRole("button", { name: "Ana" }), { dataTransfer: dt });
  fireEvent.drop(screen.getByRole("button", { name: "Luis" }), { dataTransfer: dt });
  fireEvent.dragEnd(screen.getByRole("button", { name: "Ana" }), { dataTransfer: dt });
  expect(await jefeDe(ids.ana)).toBeNull();
  expect(await jefeDe(ids.luis)).toBe(ids.ana);
  expect(screen.queryByText(/Ana ahora está bajo/)).not.toBeInTheDocument();
});

it("Estructura con la campaña cerrada no deja arrastrar", async () => {
  const { db, campanaId } = await campanaConArbol();
  await setEstadoCampana(db, campanaId, "cerrada");
  await renderApp(`/campanas/${campanaId}?tab=estructura`, { db, hoy: "2026-10-19" });

  expect(await screen.findByRole("button", { name: "Ana" })).toHaveAttribute("draggable", "false");
  expect(screen.getByRole("button", { name: "José" })).toHaveAttribute("draggable", "false");
});
