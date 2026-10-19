import { vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { SqlDriver } from "@/db/driver";
import { createTestDb } from "@/db/testing/sqljsDriver";
import { routes } from "@/App";
import { tauri } from "./tauri";

/**
 * Monta la app en `ruta` con una BD de sql.js en memoria (la de `opts.db` o una nueva) y, si se indica, la fecha
 * de hoy fija (solo se simula `Date`: los temporizadores siguen siendo reales).
 */
export async function renderApp(ruta: string, opts: { db?: SqlDriver; hoy?: string } = {}) {
  if (opts.hoy) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${opts.hoy}T12:00:00`));
  }
  const db = opts.db ?? (await createTestDb());
  tauri.db = db;
  const router = createMemoryRouter(routes, { initialEntries: [ruta] });
  const user = userEvent.setup();
  const r = render(<RouterProvider router={router} />);
  return { ...r, db, user, router };
}
