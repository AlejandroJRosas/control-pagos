import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ACCEPTED_IMAGE_TYPES, type ImagenValue } from "@/platform/images";
import { ZoomableImage } from "./ZoomableImage";
import { cn } from "@/lib/utils";

type Props = {
  value: ImagenValue;
  onChange: (v: ImagenValue) => void;
  pasteEnabled?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function ImageDrop({ value, onChange, pasteEnabled = true, disabled = false, label = "Imagen", className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const accept = useCallback(
    (f: Blob | null | undefined) => {
      if (!f) return;
      if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) {
        toast.error("Formato no soportado. Usa PNG, JPG o WEBP.");
        return;
      }
      if (value?.kind === "new") URL.revokeObjectURL(value.previewUrl);
      onChange({ kind: "new", file: f, previewUrl: URL.createObjectURL(f) });
    },
    [value, onChange],
  );

  useEffect(() => {
    if (!pasteEnabled || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      accept(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pasteEnabled, disabled, accept]);

  const quitar = () => {
    if (value?.kind === "new") URL.revokeObjectURL(value.previewUrl);
    onChange(null);
  };

  const preview = value ? (
    <ZoomableImage imagen={value.kind === "new" ? { url: value.previewUrl } : { path: value.path }} alt={label} className="flex-1 self-stretch" />
  ) : null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex h-8 items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {value && !disabled && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
              Cambiar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={quitar}>
              Quitar
            </Button>
          </div>
        )}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) accept(e.dataTransfer.files[0]);
        }}
        onClick={() => {
          if (!value && !disabled) inputRef.current?.click();
        }}
        className={cn(
          "flex min-h-48 flex-1 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted/30 p-2",
          over && "border-primary bg-primary/5",
          !value && !disabled && "cursor-pointer",
        )}
      >
        {preview ?? (
          <div className="text-center text-sm text-muted-foreground">
            <ImagePlus className="mx-auto mb-2 size-8" />
            Arrastra la imagen, pégala con Ctrl+V
            <br />o haz clic para elegir un archivo
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        hidden
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
