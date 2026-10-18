import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StoredImage } from "./StoredImage";

type Props = { path: string | null; open: boolean; onOpenChange: (open: boolean) => void };

export function ImageViewer({ path, open, onOpenChange }: Props) {
  const [zoom, setZoom] = useState(1);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setZoom(1);
      }}
    >
      <DialogContent className="flex h-[90vh] max-w-[90vw] flex-col sm:max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>Comprobante</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
            −
          </Button>
          <span className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(1)}>
            Ajustar
          </Button>
        </div>
        <div className="flex-1 overflow-auto rounded border bg-muted/30">
          {path && <StoredImage path={path} className="max-w-none" style={{ width: `${zoom * 100}%` }} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
