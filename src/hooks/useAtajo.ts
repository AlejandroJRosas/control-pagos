import { useEffect, useRef } from "react";

/** ¿El foco está en un campo donde se escribe? Ahí las teclas sueltas no son atajos. */
export const escribiendo = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export const hayDialogoAbierto = (): boolean => document.querySelector('[role="dialog"], [role="alertdialog"]') !== null;

type Opciones = {
  /** Requiere Ctrl. Sin Ctrl, la tecla sola. */
  ctrl?: boolean;
  /** Funciona también con el foco en un campo de texto (por defecto solo los que llevan Ctrl). */
  enCampos?: boolean;
  /** Funciona aunque haya un diálogo abierto. */
  conDialogo?: boolean;
  activo?: boolean;
};

/** Atajo de teclado mientras el componente está montado. `tecla` es `KeyboardEvent.key` ("n", "Escape", "?"). */
export function useAtajo(tecla: string, accion: () => void, { ctrl = false, enCampos = ctrl, conDialogo = false, activo = true }: Opciones = {}) {
  const ref = useRef(accion);
  ref.current = accion;
  useEffect(() => {
    if (!activo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.altKey) return;
      if (e.key.toLowerCase() !== tecla.toLowerCase()) return;
      if (ctrl !== (e.ctrlKey || e.metaKey)) return;
      if (!enCampos && escribiendo(e.target)) return;
      if (!conDialogo && hayDialogoAbierto()) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tecla, ctrl, enCampos, conDialogo, activo]);
}

/** Lista que muestra la ayuda de atajos ("?"). */
export const ATAJOS: { teclas: string[]; que: string }[] = [
  { teclas: ["Ctrl", "K"], que: "Buscar en todas las campañas (depósitos, gerentes, campañas)" },
  { teclas: ["/"], que: "Ir al buscador de la tabla" },
  { teclas: ["N"], que: "Nuevo: depósito en la campaña o gerente, tasa, gerente o campaña según la pantalla" },
  { teclas: ["Ctrl", "Enter"], que: "Guardar el depósito (o Hecho en la revisión en lote)" },
  { teclas: ["Esc"], que: "Volver a la pantalla anterior" },
  { teclas: ["Ctrl", "B"], que: "Colapsar o expandir la barra lateral" },
  { teclas: ["?"], que: "Mostrar esta ayuda" },
];
