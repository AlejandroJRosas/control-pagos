import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ajustarVista, ESCALA_MAX, ESCALA_MIN, guardarVista, leerVista, limitarVista, zoomVista, type VistaOrganigrama } from "@/lib/vistaOrganigrama";
import { cn } from "@/lib/utils";

type Tam = { w: number; h: number };
type Props = {
  /** Dónde se recuerda la vista (p. ej. `estructura-<campaña>`). */
  clave: string;
  /** Manejadores de la zona de soltar del marco (la punta) y su clase de resaltado. */
  zona: HTMLAttributes<HTMLDivElement>;
  resaltado: boolean;
  children: ReactNode;
};

const ALTO_MIN = 160;
const altoMax = () => Math.max(ALTO_MIN, Math.round(window.innerHeight * 0.7));
const PASO = 1.25;

function useTamano<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [tam, setTam] = useState<Tam>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetWidth/Height no cambian con el `transform`: es el tamaño del dibujo al 100 %.
    const medir = () => setTam((t) => (t.w === el.offsetWidth && t.h === el.offsetHeight ? t : { w: el.offsetWidth, h: el.offsetHeight }));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, tam] as const;
}

/**
 * Marco del organigrama con zoom y desplazamiento: sin nada guardado se ajusta para que entre todo; arrastrando el
 * fondo se mueve, Ctrl + rueda (o los botones) acerca y aleja, y la vista se recuerda por `clave`.
 */
export function LienzoOrganigrama({ clave, zona, resaltado, children }: Props) {
  const [marcoRef, marco] = useTamano<HTMLDivElement>();
  const [dibujoRef, dibujo] = useTamano<HTMLDivElement>();
  const [estado, setEstado] = useState(() => ({ clave, vista: leerVista(clave) }));
  const guardada = estado.clave === clave ? estado.vista : leerVista(clave);
  const medido = marco.w > 0 && dibujo.w > 0;

  // Sin vista guardada (o tras «Ajustar») sigue ajustada aunque cambie el dibujo, p. ej. al plegar una rama.
  const base = guardada ?? (medido ? ajustarVista({ w: marco.w, h: altoMax() }, dibujo) : { escala: 1, x: 0, y: 0 });
  const alto = Math.min(altoMax(), Math.max(ALTO_MIN, Math.ceil(dibujo.h * base.escala)));
  const vista = medido ? limitarVista(base, { w: marco.w, h: alto }, dibujo) : base;

  const fijar = (v: VistaOrganigrama | null) => {
    const n = v && medido ? limitarVista(v, { w: marco.w, h: alto }, dibujo) : v;
    guardarVista(clave, n);
    setEstado({ clave, vista: n });
  };
  const fijarRef = useRef(fijar);
  const vistaRef = useRef(vista);
  useLayoutEffect(() => {
    fijarRef.current = fijar;
    vistaRef.current = vista;
  });

  // Ctrl + rueda acerca hacia el cursor (y no hace zoom a toda la app); la rueda sola sigue bajando la página.
  useEffect(() => {
    const el = marcoRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || e.deltaY === 0) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      fijarRef.current(zoomVista(vistaRef.current, 1.15 ** (-e.deltaY / 100), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [marcoRef]);

  const [arrastre, setArrastre] = useState<{ id: number; x: number; y: number; desde: VistaOrganigrama } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Solo el fondo: las cajitas se arrastran para cambiar el jefe y sus botones se pulsan.
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrastre({ id: e.pointerId, x: e.clientX, y: e.clientY, desde: vista });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!arrastre || e.pointerId !== arrastre.id) return;
    fijar({ ...arrastre.desde, x: arrastre.desde.x + e.clientX - arrastre.x, y: arrastre.desde.y + e.clientY - arrastre.y });
  };
  const soltar = (e: PointerEvent<HTMLDivElement>) => {
    if (arrastre?.id === e.pointerId) setArrastre(null);
  };

  const zoomCentro = (factor: number) => fijar(zoomVista(vista, factor, marco.w / 2, alto / 2));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        <span className="mr-2 text-xs text-muted-foreground">Arrastra el fondo para moverte · Ctrl + rueda para acercar</span>
        <Button variant="outline" size="icon-sm" aria-label="Alejar" title="Alejar" disabled={vista.escala <= ESCALA_MIN} onClick={() => zoomCentro(1 / PASO)}>
          <ZoomOut />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums" aria-label="Zoom del organigrama">
          {Math.round(vista.escala * 100)} %
        </span>
        <Button variant="outline" size="icon-sm" aria-label="Acercar" title="Acercar" disabled={vista.escala >= ESCALA_MAX} onClick={() => zoomCentro(PASO)}>
          <ZoomIn />
        </Button>
        <Button variant="outline" size="sm" title="Que entre todo el organigrama" disabled={guardada === null} onClick={() => fijar(null)}>
          <Maximize />
          Ajustar
        </Button>
      </div>
      <div
        ref={marcoRef}
        role="region"
        aria-label="Organigrama"
        {...zona}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        style={{ height: medido ? alto : undefined }}
        className={cn(
          "relative touch-none overflow-hidden rounded-xl border bg-muted/30 transition-colors select-none",
          arrastre ? "cursor-grabbing" : "cursor-grab",
          resaltado && "border-primary-intenso bg-fila-hover",
        )}
      >
        <div
          ref={dibujoRef}
          className={cn("w-max p-6", medido && "absolute top-0 left-0")}
          style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.escala})`, transformOrigin: "0 0" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
