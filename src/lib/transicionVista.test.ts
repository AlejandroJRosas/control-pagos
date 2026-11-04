import { describe, expect, it, vi } from "vitest";
import { instalarTransiciones, llevaTransicion } from "./transicionVista";

const aqui = { pathname: "/campanas/1", search: "?tab=gerentes&q=ana" };

describe("llevaTransicion", () => {
  it("al cambiar de pantalla sí", () => {
    expect(llevaTransicion(aqui, "/gerentes")).toBe(true);
    expect(llevaTransicion(aqui, { pathname: "/asignaciones/3" })).toBe(true);
    expect(llevaTransicion(aqui, "/campanas/2?tab=gerentes")).toBe(true);
  });
  it("al cambiar de pestaña sí; al cambiar solo un filtro o la búsqueda no", () => {
    expect(llevaTransicion(aqui, "?tab=estructura")).toBe(true);
    expect(llevaTransicion(aqui, "?")).toBe(true);
    expect(llevaTransicion(aqui, "?tab=gerentes&q=ana+m")).toBe(false);
    expect(llevaTransicion(aqui, { search: "?tab=gerentes&banco=x" })).toBe(false);
    expect(llevaTransicion(aqui, "/campanas/1?tab=gerentes&q=")).toBe(false);
    expect(llevaTransicion(aqui, null)).toBe(false);
  });
});

describe("instalarTransiciones", () => {
  it("marca viewTransition solo cuando corresponde y respeta lo explícito y el atrás", async () => {
    const navigate = vi.fn(async () => {});
    const router = { state: { location: aqui }, navigate };
    instalarTransiciones(router as never);
    const nav = router.navigate as unknown as (to: unknown, o?: object) => Promise<void>;
    await nav("/tasas");
    await nav("?tab=gerentes&q=x", { replace: true });
    await nav("/tasas", { viewTransition: false });
    await nav(-1);
    await nav("/gerentes", { replace: false, viewTransition: undefined });
    expect(navigate.mock.calls).toEqual([
      ["/tasas", { viewTransition: true }],
      ["?tab=gerentes&q=x", { replace: true }],
      ["/tasas", { viewTransition: false }],
      [-1, undefined],
      ["/gerentes", { replace: false, viewTransition: true }],
    ]);
  });
});
