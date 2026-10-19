import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** Zoom de toda la app (Ctrl + rueda, Ctrl + / Ctrl − / Ctrl 0); se recuerda en localStorage. */
export const PASOS_ZOOM = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

export function siguienteZoom(actual: number, dir: 1 | -1): number {
  const candidatos = dir === 1 ? PASOS_ZOOM.filter((p) => p > actual + 1e-6) : PASOS_ZOOM.filter((p) => p < actual - 1e-6).reverse();
  return candidatos[0] ?? actual;
}

export function leerZoomGuardado(crudo: string | null): number {
  const n = Number(crudo);
  return crudo && n >= PASOS_ZOOM[0] && n <= PASOS_ZOOM[PASOS_ZOOM.length - 1] ? n : 1;
}

const KEY = "control-pagos:zoom";

function leer(): number {
  try {
    return leerZoomGuardado(localStorage.getItem(KEY));
  } catch {
    return 1;
  }
}

function guardar(z: number): void {
  try {
    if (z === 1) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(z));
  } catch {
    // sin almacenamiento solo se pierde la comodidad de recordarlo
  }
}

function aplicar(z: number): void {
  getCurrentWebview()
    .setZoom(z)
    .catch(() => {
      // fuera de Tauri (vite en el navegador) no hay zoom del webview
    });
}

export function useZoomApp() {
  const [zoom, setZoom] = useState(leer);

  useEffect(() => aplicar(zoom), [zoom]);

  useEffect(() => {
    let actual = zoom;
    const cambiar = (z: number) => {
      if (z === actual) return;
      actual = z;
      guardar(z);
      setZoom(z);
      toast(`Zoom ${Math.round(z * 100)} %`, { id: "zoom-app", duration: 1200 });
    };
    // Si el elemento ya usó la rueda (p. ej. el zoom de un comprobante), no se toca la app.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || e.defaultPrevented || e.deltaY === 0) return;
      e.preventDefault();
      cambiar(siguienteZoom(actual, e.deltaY < 0 ? 1 : -1));
    };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.defaultPrevented) return;
      if (e.key === "+" || e.key === "=") cambiar(siguienteZoom(actual, 1));
      else if (e.key === "-") cambiar(siguienteZoom(actual, -1));
      else if (e.key === "0") cambiar(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `actual` lleva el valor vivo dentro de los listeners
  }, []);

  return zoom;
}
