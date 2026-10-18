import { useState } from "react";
import { StoredImage } from "./StoredImage";
import { ImageViewer } from "./ImageViewer";

export function ComprobanteThumb({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button type="button" title="Ver comprobante" onClick={() => setOpen(true)}>
        <StoredImage path={path} className="size-10 rounded border object-cover" />
      </button>
      <ImageViewer path={path} open={open} onOpenChange={setOpen} />
    </span>
  );
}
