import { expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { createTasa, getTasa, getTasaByFecha } from "@/db/repos/tasas";
import { encolarTasa, getItemColaTasa } from "@/db/repos/cola";
import { renderApp } from "@/testing/renderApp";
import type { ArchivoTasas } from "@/domain/archivoTasas";

const archivoAbierto = vi.hoisted(() => ({ valor: null as { carpeta: string; archivo: ArchivoTasas } | null }));
vi.mock("@/platform/paquete", async (original) => ({
  ...(await original<typeof import("@/platform/paquete")>()),
  abrirArchivoTasas: async () => archivoAbierto.valor,
  importarImagenRecibida: async (_carpeta: string, nombre: string) => `imagenes/recibida-${nombre}`,
}));

it("una tasa nueva en un día que ya tiene avisa y la reemplaza en vez de rechazarla", async () => {
  const db = await createTestDb();
  const id = await createTasa(db, { fecha: "2026-11-04", valor: "221", notas: "mía", imagenPath: null });
  const { user } = await renderApp("/tasas", { db, hoy: "2026-11-04" });

  await user.click(await screen.findByRole("button", { name: /Nueva tasa/ }));
  const dialogo = await screen.findByRole("dialog");
  await user.type(within(dialogo).getByLabelText("Bs por USD"), "222,5");
  expect(await within(dialogo).findByText(/Ya hay una tasa el 04\/11\/2026: 221,00\. Al guardar se reemplaza por 222,50/)).toBeInTheDocument();
  await user.click(within(dialogo).getByRole("button", { name: "Reemplazar" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await getTasa(db, id)).toMatchObject({ valor: "222.5", notas: "mía" });
});

it("en la revisión, Hecho sobre una fecha con tasa la reemplaza con la captura de la cola", async () => {
  const db = await createTestDb();
  const id = await createTasa(db, { fecha: "2026-11-04", valor: "221", notas: null, imagenPath: null });
  const item = await encolarTasa(db, {
    imagenPath: "imagenes/t.png",
    nombreArchivo: "t.png",
    borrador: { draft: { fecha: "2026-11-04", valor: "223", notas: "" }, auto: { estado: {}, confianza: {} } },
  });
  const { user } = await renderApp("/tasas/revision", { db, hoy: "2026-11-04" });

  expect(await screen.findByText(/Ya hay una tasa el 04\/11\/2026: 221,00\. Con Hecho se reemplaza por 223,00/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Reemplazar/ }));

  await waitFor(async () => expect(await getItemColaTasa(db, item)).toMatchObject({ estado: "hecho", tasaId: id }));
  expect(await getTasa(db, id)).toMatchObject({ valor: "223", imagenPath: "imagenes/t.png" });
});

it("importa un archivo de tasas: nuevas con su captura, y las de otro valor solo si se marcan; Deshacer lo revierte", async () => {
  const db = await createTestDb();
  await createTasa(db, { fecha: "2026-11-02", valor: "219", notas: null, imagenPath: null });
  await createTasa(db, { fecha: "2026-11-03", valor: "220", notas: null, imagenPath: null });
  await createTasa(db, { fecha: "2026-11-04", valor: "221", notas: null, imagenPath: null });
  archivoAbierto.valor = {
    carpeta: "recibidos/p1",
    archivo: {
      formato: "control-pagos/tasas",
      version: 1,
      creadoEn: "",
      tasas: [
        { fecha: "2026-11-02", valor: "219", notas: null, imagen: null },
        { fecha: "2026-11-03", valor: "220.5", notas: null, imagen: null },
        { fecha: "2026-11-04", valor: "221.5", notas: null, imagen: null },
        { fecha: "2026-11-05", valor: "222", notas: null, imagen: "c.png" },
        { fecha: "2026-11-07", valor: "223", notas: null, imagen: null },
      ],
    },
  };
  const { user } = await renderApp("/tasas", { db, hoy: "2026-11-05" });

  await user.click(await screen.findByRole("button", { name: /Exportar \/ importar/ }));
  await user.click(await screen.findByRole("menuitem", { name: /Importar tasas/ }));
  const dialogo = await screen.findByRole("dialog", { name: "Importar tasas" });
  expect(await within(dialogo).findByText("1 nueva(s)")).toBeInTheDocument();
  expect(within(dialogo).getByText(/07\/11\/2026 .*Sábado o domingo/)).toBeInTheDocument();
  await user.click(within(dialogo).getByLabelText("Reemplazar la tasa del 04/11/2026"));
  await user.click(within(dialogo).getByRole("button", { name: "Importar 2 tasas" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await getTasaByFecha(db, "2026-11-05")).toMatchObject({ valor: "222", imagenPath: "imagenes/recibida-c.png" });
  expect((await getTasaByFecha(db, "2026-11-04"))?.valor).toBe("221.5");
  expect((await getTasaByFecha(db, "2026-11-03"))?.valor).toBe("220");

  await user.click(await screen.findByRole("button", { name: "Deshacer" }));
  await waitFor(async () => expect(await getTasaByFecha(db, "2026-11-05")).toBeNull());
  expect((await getTasaByFecha(db, "2026-11-04"))?.valor).toBe("221");
});
