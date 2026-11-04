import type { Path } from "react-router";

type Lugar = { pathname: string; search: string };
type Destino = string | Partial<Path> | null;

const pestana = (search: string) => new URLSearchParams(search).get("tab") ?? "";

/** Separa una ruta en texto ("/x?tab=y#z") en sus partes, como lo haría el router. */
function partes(to: string): Partial<Path> {
  const hash = to.indexOf("#");
  const sinHash = hash >= 0 ? to.slice(0, hash) : to;
  const q = sinHash.indexOf("?");
  return q >= 0 ? { pathname: sinHash.slice(0, q) || undefined, search: sinHash.slice(q) } : { pathname: sinHash || undefined };
}

/**
 * Si una navegación lleva view transition: solo al cambiar de pantalla o de pestaña (`?tab=`). Escribir en una búsqueda o
 * cambiar un filtro también navega (filtros en la URL) y ahí una animación estorbaría.
 */
export function llevaTransicion(actual: Lugar, to: Destino): boolean {
  if (to === null) return false;
  const p = typeof to === "string" ? partes(to) : to;
  if (p.pathname !== undefined && p.pathname !== actual.pathname) return true;
  return p.search !== undefined && pestana(p.search) !== pestana(actual.search);
}

/** Sin animaciones si Windows pide reducir el movimiento. */
export const reducirMovimiento = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

type RouterNavegable = {
  state: { location: Lugar };
  navigate: (to: never, opts?: never) => Promise<void>;
};

/**
 * Hace que las navegaciones del router (enlaces y `navigate`) usen view transitions cuando cambian de pantalla o de pestaña,
 * sin tener que marcarlas una por una. Lo que pide `viewTransition` explícito manda.
 */
export function instalarTransiciones(router: RouterNavegable): void {
  const original = router.navigate.bind(router) as (to: unknown, opts?: Record<string, unknown>) => Promise<void>;
  router.navigate = ((to: unknown, opts?: Record<string, unknown>) => {
    if (typeof to === "number" || reducirMovimiento() || (opts && "viewTransition" in opts)) return original(to, opts);
    if (!llevaTransicion(router.state.location, to as Destino)) return original(to, opts);
    return original(to, { ...opts, viewTransition: true });
  }) as RouterNavegable["navigate"];
}
