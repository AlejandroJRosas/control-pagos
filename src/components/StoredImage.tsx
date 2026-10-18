import { useEffect, useState, type CSSProperties, type ReactEventHandler } from "react";
import { loadImageUrl } from "@/platform/images";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

type Props = { path: string; alt?: string; className?: string; style?: CSSProperties; onLoad?: ReactEventHandler<HTMLImageElement> };

export function StoredImage({ path, alt = "Comprobante", className, style, onLoad }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    setUrl(null);
    loadImageUrl(path)
      .then((u) => {
        if (alive) {
          created = u;
          setUrl(u);
        } else URL.revokeObjectURL(u);
      })
      .catch((e) => reportError(e, "No se pudo cargar la imagen"));
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);
  if (!url) return <div className={cn("animate-pulse bg-muted", className)} style={style} />;
  return <img src={url} alt={alt} className={className} style={style} onLoad={onLoad} />;
}
