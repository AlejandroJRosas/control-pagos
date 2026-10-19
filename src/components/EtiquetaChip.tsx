import { Check } from "lucide-react";
import { cn } from "cn";
import type { ColorEtiqueta } from "@/domain/etiquetas";

/** Clases completas (Tailwind solo genera las que aparecen literales). */
const ESTILO: Record<ColorEtiqueta, { suave: string; punto: string }> = {
  gris: { suave: "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-500/40 dark:bg-zinc-500/20 dark:text-zinc-200", punto: "bg-zinc-500" },
  rojo: { suave: "border-red-200 bg-red-100 text-red-800 dark:border-red-500/40 dark:bg-red-500/20 dark:text-red-200", punto: "bg-red-500" },
  naranja: {
    suave: "border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/20 dark:text-orange-200",
    punto: "bg-orange-500",
  },
  amarillo: {
    suave: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200",
    punto: "bg-amber-500",
  },
  verde: {
    suave: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200",
    punto: "bg-emerald-500",
  },
  azul: { suave: "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/20 dark:text-sky-200", punto: "bg-sky-500" },
  violeta: {
    suave: "border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/20 dark:text-violet-200",
    punto: "bg-violet-500",
  },
  rosa: { suave: "border-pink-200 bg-pink-100 text-pink-800 dark:border-pink-500/40 dark:bg-pink-500/20 dark:text-pink-200", punto: "bg-pink-500" },
};

export const NOMBRE_COLOR: Record<ColorEtiqueta, string> = {
  gris: "Gris",
  rojo: "Rojo",
  naranja: "Naranja",
  amarillo: "Amarillo",
  verde: "Verde",
  azul: "Azul",
  violeta: "Violeta",
  rosa: "Rosa",
};

export const puntoColor = (c: ColorEtiqueta) => ESTILO[c].punto;

type Props = {
  nombre: string;
  color: ColorEtiqueta;
  /** Con `onClick` es un botón que se activa/desactiva (filtro o asignación). */
  activo?: boolean;
  onClick?: () => void;
  className?: string;
};

const BASE = "inline-flex h-6 max-w-48 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap";

export function EtiquetaChip({ nombre, color, activo, onClick, className }: Props) {
  const e = ESTILO[color];
  if (!onClick)
    return (
      <span className={cn(BASE, e.suave, className)}>
        <span className="truncate">{nombre}</span>
      </span>
    );
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        BASE,
        "cursor-pointer transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        activo ? e.suave : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      {activo ? <Check className="size-3" /> : <span className={cn("size-2 rounded-full", e.punto)} />}
      <span className="truncate">{nombre}</span>
    </button>
  );
}
