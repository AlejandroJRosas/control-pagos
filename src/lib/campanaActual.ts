import { useSyncExternalStore } from "react";

/** Última campaña abierta: la app vuelve a ella al iniciar y la deja fija en la barra lateral. */
const KEY = "control-pagos:campana-actual";
const listeners = new Set<() => void>();

function leer(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

let actual = leer();

export function getCampanaActual(): number | null {
  return actual;
}

export function setCampanaActual(id: number | null): void {
  if (id === actual) return;
  actual = id;
  try {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarla
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useCampanaActual(): number | null {
  return useSyncExternalStore(subscribe, getCampanaActual);
}
