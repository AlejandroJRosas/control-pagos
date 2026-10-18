import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import { escalaMaxima, limitarPan, VISTA_AJUSTADA, zoomEnPunto, type Vista } from "@/lib/zoom";
import { cn } from "@/lib/utils";
import { StoredImage } from "./StoredImage";

type Props = {
  imagen: { url: string } | { path: string };
  alt?: string;
  className?: string;
  /** Botones − / + / Ajustar / Tamaño real sobre la imagen. */
  controles?: boolean;
};

type Medidas = { natural: { w: number; h: number }; ajustada: { w: number; h: number }; cont: { w: number; h: number } };

/**
 * Imagen ajustada a su caja; la rueda del ratón acerca hacia el cursor, arrastrar la mueve y doble clic la vuelve a ajustar.
 * La rueda se escucha con `passive: false` porque el `onWheel` de React es pasivo y no permite `preventDefault`.
 */
export function ZoomableImage({ imagen, alt = "Comprobante", className, controles = false }: Props) {
  const contRef = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<Vista>(VISTA_AJUSTADA);
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const clave = "url" in imagen ? imagen.url : imagen.path;

  useEffect(() => {
    setVista(VISTA_AJUSTADA);
    setMedidas(null);
  }, [clave]);

  function medir(natural: { w: number; h: number }): Medidas | null {
    const el = contRef.current;
    if (!el || !natural.w || !natural.h) return null;
    const cont = { w: el.clientWidth, h: el.clientHeight };
    const k = Math.min(cont.w / natural.w, cont.h / natural.h);
    return { natural, ajustada: { w: natural.w * k, h: natural.h * k }, cont };
  }

  const maxEscala = medidas ? escalaMaxima(medidas.natural, medidas.ajustada) : 1;

  // Con zoom en un punto del contenedor, ajustando el desplazamiento a los bordes.
  const zoom = (v: Vista, factor: number, px: number, py: number): Vista => {
    const m = medidas;
    if (!m) return v;
    return limitarPan(zoomEnPunto(v, factor, px, py, escalaMaxima(m.natural, m.ajustada)), m.cont);
  };
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = 1.15 ** (-e.deltaY / 100);
      setVista((v) => zoomRef.current(v, factor, e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Si cambia el tamaño de la caja, se vuelve a medir y a ajustar.
  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setMedidas((m) => (m ? medir(m.natural) : m));
      setVista(VISTA_AJUSTADA);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setMedidas(medir({ w: img.naturalWidth, h: img.naturalHeight }));
  };

  const centro = (factor: number) => setVista((v) => (medidas ? zoom(v, factor, medidas.cont.w / 2, medidas.cont.h / 2) : v));
  const porcentaje = medidas ? Math.round((vista.escala * medidas.ajustada.w * 100) / medidas.natural.w) : null;
  const style: CSSProperties = { transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.escala})`, transformOrigin: "0 0" };
  const imgClass = "pointer-events-none absolute inset-0 size-full object-contain select-none";

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      {controles && (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => centro(1 / 1.25)} disabled={vista.escala <= 1}>
            −
          </Button>
          <span className="w-14 text-center text-sm tabular-nums">{porcentaje ?? "—"}%</span>
          <Button type="button" size="sm" variant="outline" onClick={() => centro(1.25)} disabled={vista.escala >= maxEscala}>
            +
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setVista(VISTA_AJUSTADA)} disabled={vista.escala === 1}>
            Ajustar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!medidas}
            onClick={() => medidas && setVista((v) => zoom(v, medidas.natural.w / medidas.ajustada.w / v.escala, medidas.cont.w / 2, medidas.cont.h / 2))}
          >
            Tamaño real
          </Button>
        </div>
      )}
      <div
        ref={contRef}
        className={cn("relative min-h-0 flex-1 overflow-hidden", vista.escala > 1 && "cursor-grab active:cursor-grabbing")}
        onDoubleClick={() => setVista(VISTA_AJUSTADA)}
        onPointerDown={(e) => {
          if (vista.escala <= 1 || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y };
        }}
        onPointerMove={(e) => {
          const a = arrastre.current;
          if (!a || !medidas) return;
          setVista((v) => limitarPan({ ...v, x: a.vx + e.clientX - a.x, y: a.vy + e.clientY - a.y }, medidas.cont));
        }}
        onPointerUp={() => (arrastre.current = null)}
        onPointerCancel={() => (arrastre.current = null)}
      >
        {"url" in imagen ? (
          <img src={imagen.url} alt={alt} className={imgClass} style={style} onLoad={onLoad} draggable={false} />
        ) : (
          <StoredImage path={imagen.path} alt={alt} className={imgClass} style={style} onLoad={onLoad} />
        )}
        {vista.escala > 1 && porcentaje !== null && !controles && (
          <span className="pointer-events-none absolute right-2 bottom-2 rounded bg-background/80 px-1.5 py-0.5 text-xs tabular-nums shadow">
            {porcentaje}%
          </span>
        )}
      </div>
    </div>
  );
}
