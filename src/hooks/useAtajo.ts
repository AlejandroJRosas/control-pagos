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

/** Lista que muestra la ayuda de atajos ("?"), en dos columnas. */
export const ATAJOS: { titulo: string; atajos: { teclas: string[]; que: string }[] }[] = [
  {
    titulo: "Navegación",
    atajos: [
      { teclas: ["Ctrl", "K"], que: "Buscar en todas las campañas (depósitos, gerentes, campañas)" },
      { teclas: ["/"], que: "Ir al buscador de la tabla" },
      { teclas: ["Esc"], que: "Volver a la pantalla anterior" },
      { teclas: ["Inicio"], que: "Volver arriba de la página (también el botón que aparece abajo a la derecha al bajar)" },
      { teclas: ["←", "→"], que: "En los calendarios (Tasas y Cumpleaños): mes anterior o siguiente" },
      { teclas: ["←", "→"], que: "En el tutorial: paso anterior o siguiente (Esc lo cierra)" },
      { teclas: ["Ctrl", "B"], que: "Colapsar o expandir la barra lateral" },
      { teclas: ["Ctrl", "Rueda"], que: "Agrandar o achicar la app (también Ctrl + / Ctrl − ; Ctrl 0 vuelve al 100 %)" },
      { teclas: ["?"], que: "Mostrar esta ayuda" },
    ],
  },
  {
    titulo: "Registro y lote",
    atajos: [
      { teclas: ["N"], que: "Nuevo: depósito en la campaña o gerente, tasa, gerente o campaña según la pantalla" },
      { teclas: ["L"], que: "Subir comprobantes en lote (en la campaña o el gerente) o capturas de tasa (en Tasas)" },
      { teclas: ["Arrastrar"], que: "Soltar imágenes en cualquier pantalla: una abre el registro del depósito; varias, la subida en lote" },
      { teclas: ["Ctrl", "Enter"], que: "Guardar el depósito (o Hecho en la revisión en lote)" },
      { teclas: ["Ctrl", "D"], que: "Descartar el depósito que se está registrando si está duplicado (en la revisión en lote, descartar el comprobante o la captura de tasa)" },
      { teclas: ["Enter"], que: "Al subir en lote: ir a revisar (si todavía se está leyendo, espera a que termine)" },
      { teclas: ["↑", "↓"], que: "En la revisión en lote: abrir el comprobante (o la captura de tasa) anterior o siguiente de la lista" },
      { teclas: ["Ctrl", "A"], que: "En la revisión en lote: marcar todos los pendientes (Ctrl o Shift + clic para marcar varios)" },
      { teclas: ["1", "2"], que: "En Depósitos duplicados: quedarse con el de la izquierda o el de la derecha (también ← y →; con más de dos, 1 a 9)" },
    ],
  },
  {
    titulo: "Estructura",
    atajos: [
      { teclas: ["Ctrl", "Clic"], que: "Marcar varios gerentes para moverlos juntos (Shift + clic también)" },
      { teclas: ["Esc"], que: "Soltar los gerentes marcados" },
    ],
  },
];
