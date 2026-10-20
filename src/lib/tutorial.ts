import { useSyncExternalStore } from "react";

/**
 * Recorrido de bienvenida. "Activado" (por defecto, para quien abre la app por primera vez) = se abre solo al
 * iniciar la app hasta que se termina o se desactiva; se puede volver a ver cuando se quiera desde la barra
 * lateral o Configuración. Se recuerda en localStorage: es una preferencia de esta computadora.
 */
const KEY = "control-pagos:tutorial";
const listeners = new Set<() => void>();

function leerActivado(): boolean {
  try {
    return localStorage.getItem(KEY) !== "desactivado";
  } catch {
    return true;
  }
}

let activado = leerActivado();
let abierto = false;
let autoAbierto = false;

function avisar(): void {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function getTutorialActivado(): boolean {
  return activado;
}

export function setTutorialActivado(valor: boolean): void {
  if (valor === activado) return;
  activado = valor;
  try {
    if (valor) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, "desactivado");
  } catch {
    // sin almacenamiento la preferencia dura hasta cerrar la app
  }
  avisar();
}

export function abrirTutorial(): void {
  if (abierto) return;
  abierto = true;
  avisar();
}

export function cerrarTutorial(): void {
  if (!abierto) return;
  abierto = false;
  avisar();
}

/** Al montar la app: lo abre si está activado, una sola vez por sesión. */
export function abrirTutorialAlIniciar(): void {
  if (autoAbierto) return;
  autoAbierto = true;
  if (activado) abrirTutorial();
}

/** Solo para pruebas: vuelve a leer la preferencia y olvida lo de esta sesión. */
export function reiniciarTutorial(): void {
  activado = leerActivado();
  abierto = false;
  autoAbierto = false;
  avisar();
}

export function useTutorialActivado(): boolean {
  return useSyncExternalStore(subscribe, getTutorialActivado);
}

export function useTutorialAbierto(): boolean {
  return useSyncExternalStore(subscribe, () => abierto);
}

export type Rect = { top: number; left: number; width: number; height: number };

/**
 * Dónde va la tarjeta del paso: debajo del elemento resaltado si cabe, si no arriba y, si tampoco, al lado;
 * sin elemento, al centro. Siempre dentro de la ventana con `margen`.
 */
export function posicionTarjeta(
  objetivo: Rect | null,
  tarjeta: { width: number; height: number },
  ventana: { width: number; height: number },
  margen = 16,
): { top: number; left: number } {
  const limitar = (v: number, max: number) => Math.max(margen, Math.min(v, max - margen));
  if (!objetivo) {
    return { top: Math.max(margen, (ventana.height - tarjeta.height) / 2), left: Math.max(margen, (ventana.width - tarjeta.width) / 2) };
  }
  const centroX = objetivo.left + objetivo.width / 2 - tarjeta.width / 2;
  const maxLeft = ventana.width - tarjeta.width;
  const maxTop = ventana.height - tarjeta.height;
  const abajo = objetivo.top + objetivo.height + margen;
  if (abajo + tarjeta.height <= ventana.height - margen) return { top: abajo, left: limitar(centroX, maxLeft) };
  const arriba = objetivo.top - margen - tarjeta.height;
  if (arriba >= margen) return { top: arriba, left: limitar(centroX, maxLeft) };
  const centroY = limitar(objetivo.top + objetivo.height / 2 - tarjeta.height / 2, maxTop);
  const derecha = objetivo.left + objetivo.width + margen;
  if (derecha + tarjeta.width <= ventana.width - margen) return { top: centroY, left: derecha };
  return { top: centroY, left: limitar(objetivo.left - margen - tarjeta.width, maxLeft) };
}
