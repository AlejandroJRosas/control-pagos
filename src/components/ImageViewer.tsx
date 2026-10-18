import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ZoomableImage } from "./ZoomableImage";

type Props = { path: string | null; open: boolean; onOpenChange: (open: boolean) => void };

/** Abre la imagen ajustada a la ventana; con la rueda del ratón o + / − se acerca y arrastrando se mueve. */
export function ImageViewer({ path, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-auto max-w-[90vw] flex-col sm:max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>Comprobante</DialogTitle>
        </DialogHeader>
        {path && <ZoomableImage imagen={{ path }} controles className="h-[70vh] w-[min(80vw,64rem)]" />}
      </DialogContent>
    </Dialog>
  );
}
