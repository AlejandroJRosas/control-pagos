import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StoredImage } from "./StoredImage";

type Props = { path: string | null; open: boolean; onOpenChange: (open: boolean) => void };

const PASOS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

/** Abre la imagen ajustada a la ventana; con + / − se pasa a un tamaño relativo al original. */
export function ImageViewer({ path, open, onOpenChange }: Props) {
  // null = ajustada a la ventana.
  const [zoom, setZoom] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ w: number; ajustada: number } | null>(null);
  // Zoom equivalente al tamaño ajustado, para que + y − partan de lo que se ve.
  const actual = zoom ?? (natural ? natural.ajustada / natural.w : 1);
  const cambiar = (dir: 1 | -1) => {
    const siguiente = dir === 1 ? PASOS.find((p) => p > actual + 0.01) : [...PASOS].reverse().find((p) => p < actual - 0.01);
    if (siguiente) setZoom(siguiente);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setZoom(null);
      }}
    >
      <DialogContent className="flex max-h-[90vh] w-auto max-w-[90vw] flex-col sm:max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>Comprobante</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => cambiar(-1)} disabled={actual <= PASOS[0]}>
            −
          </Button>
          <span className="w-14 text-center text-sm tabular-nums">{Math.round(actual * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => cambiar(1)} disabled={actual >= PASOS[PASOS.length - 1]}>
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(null)} disabled={zoom === null}>
            Ajustar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(1)} disabled={zoom === 1}>
            Tamaño real
          </Button>
        </div>
        <div className={zoom === null ? "flex min-h-0 justify-center" : "h-[70vh] w-[min(80vw,64rem)] overflow-auto rounded border bg-muted/30"}>
          {path && (
            <StoredImage
              path={path}
              className={zoom === null ? "max-h-[65vh] max-w-full rounded border object-contain" : "max-w-none"}
              style={zoom === null || !natural ? undefined : { width: natural.w * zoom }}
              onLoad={(e) => {
                const img = e.currentTarget;
                setNatural({ w: img.naturalWidth, ajustada: img.clientWidth || img.naturalWidth });
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
