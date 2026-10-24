import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { depositoBase, seedBasico } from "@/db/testing/fixtures";
import { createDeposito } from "@/db/repos/depositos";
import { borradorDepositoVacio, encolarDeposito } from "@/db/repos/cola";
import { renderApp } from "@/testing/renderApp";

const contar = async (db: Awaited<ReturnType<typeof createTestDb>>) => (await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos"))[0].n;

it("Ctrl+Enter no da Hecho con un diálogo abierto; cerrado, sí", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const b = borradorDepositoVacio(`a:${s.asignacionId}`);
  await encolarDeposito(db, s.campanaId, {
    imagenPath: "imagenes/x.png",
    nombreArchivo: "x.png",
    borrador: { ...b, draft: { ...b.draft, fecha: "2026-03-02", banco: "Banesco", referencia: "77", cuentaDestino: "0102", montoBs: "3.650" } },
  });
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByText(/36,50 Bs\/USD/);

  await user.click(screen.getByRole("button", { name: "Descartar" }));
  await screen.findByRole("alertdialog");
  await user.keyboard("{Control>}{Enter}{/Control}");
  await new Promise((r) => setTimeout(r, 200));
  expect(await contar(db)).toBe(0);

  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  await user.keyboard("{Control>}{Enter}{/Control}");
  await waitFor(async () => expect(await contar(db)).toBe(1));
});

it("un comprobante duplicado no se da por Hecho y Ctrl+D lo descarta de una vez", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { referencia: "77" }));
  const b = borradorDepositoVacio(`a:${s.asignacionId}`);
  await encolarDeposito(db, s.campanaId, {
    imagenPath: "imagenes/x.png",
    nombreArchivo: "x.png",
    borrador: { ...b, draft: { ...b.draft, fecha: "2026-03-02", banco: "Banesco", referencia: "77", cuentaDestino: "0102", montoBs: "3.650" } },
  });
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  expect(await screen.findByText("Este depósito ya está registrado")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hecho" })).toBeDisabled();
  await user.keyboard("{Control>}d{/Control}");
  await screen.findByText("No quedan comprobantes por revisar.");
  expect(await contar(db)).toBe(1);
  expect((await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM cola_depositos"))[0].n).toBe(0);
});

it("un borrador del Provincial igual a uno registrado avisa y Hecho lo guarda", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Provincial", referencia: "12345678", montoBs: "3650" }));
  const b = borradorDepositoVacio(`a:${s.asignacionId}`);
  await encolarDeposito(db, s.campanaId, {
    imagenPath: "imagenes/x.png",
    nombreArchivo: "x.png",
    borrador: { ...b, draft: { ...b.draft, fecha: "2026-03-02", banco: "Provincial", referencia: "12345678", cuentaDestino: "0102", montoBs: "3.650" } },
  });
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  expect(await screen.findByText(/Posible repetido: ya hay un pago del Provincial/)).toBeInTheDocument();
  const hecho = screen.getByRole("button", { name: "Hecho" });
  expect(hecho).toBeEnabled();
  await user.click(hecho);
  await waitFor(async () => expect(await contar(db)).toBe(2));
});

const filas = () => Array.from(document.querySelectorAll<HTMLElement>("li[data-id]"));

it("el filtro de incidencias deja solo lo dudoso, ↓ no sale de lo visible y lo corregido se queda hasta pasar a otro", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const completo = async (banco: string, referencia: string, montoBs: string) => {
    const b = borradorDepositoVacio(`a:${s.asignacionId}`);
    const id = await encolarDeposito(db, s.campanaId, {
      imagenPath: "imagenes/x.png",
      nombreArchivo: `${banco}.png`,
      borrador: { ...b, draft: { ...b.draft, fecha: "2026-03-02", banco, referencia, cuentaDestino: "0102", montoBs } },
    });
    await db.execute("UPDATE cola_depositos SET formato = 'bdv' WHERE id = ?", [id]);
  };
  await completo("Banesco", "11", "1.000");
  await completo("Mercantil", "", "2.000"); // le falta la referencia
  await completo("BNC", "33", "3.000");
  const { user } = await renderApp(`/campanas/${s.campanaId}/revision`, { db, hoy: "2026-03-02" });
  await screen.findByRole("button", { name: "Con incidencias (1)" });
  await user.click(screen.getByRole("button", { name: "Con incidencias (1)" }));
  const lista = filas();
  expect(lista).toHaveLength(1);
  expect(lista[0]).toHaveTextContent("Mercantil");
  expect(within(lista[0]).getByLabelText(/Incidencias: Falta la referencia/)).toBeInTheDocument();

  await user.click(within(lista[0]).getByRole("button", { name: /Mercantil/ }));
  await user.keyboard("{ArrowDown}");
  expect(filas()).toHaveLength(1);

  await user.type(await screen.findByLabelText("Referencia bancaria"), "22");
  await screen.findByRole("button", { name: "Con incidencias (0)" }, { timeout: 3000 });
  expect(filas()).toHaveLength(1);
  expect(filas()[0]).toHaveTextContent("Mercantil");
  await user.click(screen.getByRole("button", { name: "Pendientes" }));
  expect(filas()).toHaveLength(3);
  await user.click(within(filas()[0]).getByRole("button", { name: /Banesco/ }));
  await user.click(screen.getByRole("button", { name: "Con incidencias (0)" }));
  expect(filas()).toHaveLength(0);
});
