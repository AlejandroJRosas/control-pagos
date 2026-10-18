import { useEffect, useState, useSyncExternalStore } from "react";
import type { SqlDriver } from "@/db/driver";
import { getDb } from "@/db";
import { reportError } from "@/lib/reportError";

let version = 0;
const listeners = new Set<() => void>();

/** Llamar después de cualquier escritura: recarga todas las vistas montadas. */
export function invalidate(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

type State<T> = { data: T | undefined; error: unknown; loading: boolean };
type Keyed<T> = State<T> & { key: string };
const LOADING = { data: undefined, error: null, loading: true } as const;

export function useData<T>(load: (db: SqlDriver) => Promise<T>, deps: readonly unknown[]): State<T> {
  const v = useSyncExternalStore(subscribe, () => version);
  const key = JSON.stringify(deps);
  const [state, setState] = useState<Keyed<T>>({ key, ...LOADING });

  useEffect(() => {
    let alive = true;
    getDb()
      .then(load)
      .then(
        (data) => {
          if (alive) setState({ key, data, error: null, loading: false });
        },
        (error: unknown) => {
          if (!alive) return;
          setState({ key, data: undefined, error, loading: false });
          reportError(error);
        },
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, key]);

  // Si cambiaron los deps, no mostrar datos de la entidad anterior.
  return state.key === key ? state : LOADING;
}
