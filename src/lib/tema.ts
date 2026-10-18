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

/** Claro u oscuro; se combina con cualquier tema de color (clase `.dark` en index.css). */
export const MODOS = [
  { id: "claro", nombre: "Claro" },
  { id: "oscuro", nombre: "Oscuro" },
] as const;

export type ModoId = (typeof MODOS)[number]["id"];

const KEY = "control-pagos:tema";
const KEY_MODO = "control-pagos:modo";
const listeners = new Set<() => void>();

function leer<T extends string>(key: string, validos: readonly { id: T }[], defecto: T): T {
  try {
    const v = localStorage.getItem(key);
    return validos.some((x) => x.id === v) ? (v as T) : defecto;
  } catch {
    return defecto;
  }
}

function guardar(key: string, valor: string): void {
  try {
    localStorage.setItem(key, valor);
  } catch {
    // sin almacenamiento el tema dura hasta cerrar la app
  }
}

let actual: TemaId = leer(KEY, TEMAS, "neutro");
let modo: ModoId = leer(KEY_MODO, MODOS, "claro");

function aplicar(): void {
  const html = document.documentElement;
  html.dataset.tema = actual;
  html.classList.toggle("dark", modo === "oscuro");
  html.style.colorScheme = modo === "oscuro" ? "dark" : "light";
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
  guardar(KEY, id);
  listeners.forEach((l) => l());
}

export function getModo(): ModoId {
  return modo;
}

export function setModo(id: ModoId): void {
  if (id === modo) return;
  modo = id;
  aplicar();
  guardar(KEY_MODO, id);
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

export function useModo(): ModoId {
  return useSyncExternalStore(subscribe, getModo);
}
