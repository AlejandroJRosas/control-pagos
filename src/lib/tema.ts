import { useSyncExternalStore } from "react";

/** Color principal de la app. Los valores de cada tema viven en index.css (`[data-tema=…]`). */
export const TEMAS = [
  { id: "neutro", nombre: "Neutro", muestra: "oklch(0.205 0 0)" },
  { id: "rosa", nombre: "Rosa", muestra: "oklch(0.84 0.08 0)" },
  { id: "durazno", nombre: "Durazno", muestra: "oklch(0.86 0.08 55)" },
  { id: "limon", nombre: "Limón", muestra: "oklch(0.92 0.1 100)" },
  { id: "menta", nombre: "Menta", muestra: "oklch(0.87 0.08 165)" },
  { id: "cielo", nombre: "Cielo", muestra: "oklch(0.85 0.07 235)" },
  { id: "lavanda", nombre: "Lavanda", muestra: "oklch(0.84 0.08 295)" },
] as const;

export type TemaId = (typeof TEMAS)[number]["id"];

const KEY = "control-pagos:tema";
const listeners = new Set<() => void>();

function leer(): TemaId {
  try {
    const t = localStorage.getItem(KEY);
    return TEMAS.some((x) => x.id === t) ? (t as TemaId) : "neutro";
  } catch {
    return "neutro";
  }
}

let actual = leer();

function aplicar(): void {
  document.documentElement.dataset.tema = actual;
}

/** Se llama una vez al arrancar, antes de pintar. */
export function aplicarTemaGuardado(): void {
  aplicar();
}

export function getTema(): TemaId {
  return actual;
}

export function setTema(id: TemaId): void {
  if (id === actual) return;
  actual = id;
  aplicar();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // sin almacenamiento el tema dura hasta cerrar la app
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useTema(): TemaId {
  return useSyncExternalStore(subscribe, getTema);
}
