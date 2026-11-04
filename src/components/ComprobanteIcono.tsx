import { useEffect, useRef, useState } from "react";
import { PreviewCard } from "@base-ui/react";
import { ImageIcon } from "lucide-react";
import { StoredImage } from "./StoredImage";
import { ImageViewer } from "./ImageViewer";
import { cn } from "@/lib/utils";

const RETARDO_VISTA = 250;

function focoVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * Comprobante en una fila: un ícono que muestra la imagen al pasar el mouse o al enfocarlo (se lee recién ahí) y la abre en
 * grande al hacer clic. Va en cada fila de tablas de miles de depósitos: la fila lleva solo el botón y la vista previa
 * (PreviewCard, anclada al botón) y el visor se montan recién cuando hacen falta.
 */
export function ComprobanteIcono({ path, label = "Ver comprobante", className }: { path: string; label?: string; className?: string }) {
  const boton = useRef<HTMLButtonElement>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [vista, setVista] = useState(false);
  const [open, setOpen] = useState(false);
  const [visorUsado, setVisorUsado] = useState(false);
  useEffect(() => () => clearTimeout(espera.current), []);

  const mostrar = () => {
    clearTimeout(espera.current);
    espera.current = setTimeout(() => setVista(true), RETARDO_VISTA);
  };
  const ocultar = () => {
    clearTimeout(espera.current);
    setVista(false);
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        ref={boton}
        type="button"
        title={label}
        aria-label={label}
        className={cn("grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", className)}
        onPointerEnter={mostrar}
        onPointerLeave={ocultar}
        // Solo con el teclado: al cerrar el visor el foco vuelve al botón y no debe abrir la vista previa.
        onFocus={(e) => focoVisible(e.currentTarget) && mostrar()}
        onBlur={ocultar}
        onClick={() => {
          ocultar();
          setVisorUsado(true);
          setOpen(true);
        }}
      >
        <ImageIcon className="size-4" />
      </button>
      {vista && (
        <PreviewCard.Root open onOpenChange={(o) => !o && ocultar()}>
          <PreviewCard.Portal>
            <PreviewCard.Positioner anchor={boton} side="left" sideOffset={8} className="z-50">
              <PreviewCard.Popup data-testid="vista-previa-comprobante" className="rounded-lg border bg-popover p-1 shadow-lg">
                <StoredImage path={path} className="max-h-80 min-h-24 w-auto max-w-64 min-w-24 rounded object-contain" />
              </PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
      )}
      {/* Montado desde el primer clic y no antes; después se queda para que el cierre se vea como siempre. */}
      {visorUsado && <ImageViewer path={path} open={open} onOpenChange={setOpen} />}
    </span>
  );
}
