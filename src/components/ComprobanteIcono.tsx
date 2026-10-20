import { useState } from "react";
import { PreviewCard } from "@base-ui/react";
import { ImageIcon } from "lucide-react";
import { StoredImage } from "./StoredImage";
import { ImageViewer } from "./ImageViewer";

/** Comprobante en una fila: un ícono que muestra la imagen al pasar el mouse (se lee recién ahí) y la abre en grande al hacer clic. */
export function ComprobanteIcono({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <PreviewCard.Root>
        <PreviewCard.Trigger
          delay={250}
          closeDelay={0}
          render={
            <button
              type="button"
              title="Ver comprobante"
              aria-label="Ver comprobante"
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            />
          }
          onClick={() => setOpen(true)}
        >
          <ImageIcon className="size-4" />
        </PreviewCard.Trigger>
        <PreviewCard.Portal>
          <PreviewCard.Positioner side="left" sideOffset={8} className="z-50">
            <PreviewCard.Popup className="rounded-lg border bg-popover p-1 shadow-lg">
              <StoredImage path={path} className="max-h-80 min-h-24 w-auto max-w-64 min-w-24 rounded object-contain" />
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
      <ImageViewer path={path} open={open} onOpenChange={setOpen} />
    </span>
  );
}
