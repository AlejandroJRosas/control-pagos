import { expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createCampana } from "@/db/repos/campanas";
import { createGerente } from "@/db/repos/gerentes";
import { createEtiqueta, setEtiquetasGerente } from "@/db/repos/etiquetas";
import { renderApp } from "@/testing/renderApp";

it("una campaña sin gerentes invita a agregarlos y se filtran por etiqueta", async () => {
  const db = await createTestDb();
  const campanaId = await createCampana(db, { nombre: "Octubre", fechaInicio: "2026-10-01", fechaFin: null, notas: null });
  const norte = await createEtiqueta(db, { nombre: "Norte", color: "azul" });
  const sur = await createEtiqueta(db, { nombre: "Sur", color: "rojo" });
  await setEtiquetasGerente(db, await createGerente(db, { nombre: "Ana", telefono: null }), [norte]);
  await setEtiquetasGerente(db, await createGerente(db, { nombre: "Luis", telefono: null }), [sur]);
  await setEtiquetasGerente(db, await createGerente(db, { nombre: "Marta", telefono: null }), [norte, sur]);
  await createGerente(db, { nombre: "Pedro", telefono: null });
  const { user } = await renderApp(`/campanas/${campanaId}`, { db, hoy: "2026-10-19" });

  const inicio = await screen.findByRole("region", { name: "Empieza agregando gerentes" });
  await user.click(within(inicio).getByRole("button", { name: "Agregar gerentes" }));
  const dialogo = await screen.findByRole("dialog");
  const filtro = within(dialogo).getByRole("group", { name: "Filtrar por etiqueta" });
  await user.click(within(filtro).getByRole("button", { name: "Norte" }));
  expect(within(dialogo).getByRole("checkbox", { name: "Ana" })).toBeInTheDocument();
  expect(within(dialogo).getByRole("checkbox", { name: "Marta" })).toBeInTheDocument();
  expect(within(dialogo).queryByRole("checkbox", { name: "Luis" })).not.toBeInTheDocument();
  expect(within(dialogo).queryByRole("checkbox", { name: "Pedro" })).not.toBeInTheDocument();

  await user.click(within(dialogo).getByRole("checkbox", { name: /Marcar los encontrados/ }));
  await user.type(within(dialogo).getByLabelText("Saldo para los marcados"), "100");
  await user.click(within(dialogo).getByRole("button", { name: "Aplicar" }));
  await user.click(within(dialogo).getByRole("button", { name: "Agregar 2 gerentes" }));
  await screen.findByText("2 gerentes agregados a la campaña");

  const filas = await db.select<{ nombre: string }>(
    "SELECT g.nombre FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id WHERE a.campana_id = ? ORDER BY g.nombre",
    [campanaId],
  );
  expect(filas.map((f) => f.nombre)).toEqual(["Ana", "Marta"]);
  expect(screen.queryByRole("region", { name: "Empieza agregando gerentes" })).not.toBeInTheDocument();
});
