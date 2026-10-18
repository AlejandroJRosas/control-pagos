import type { ReactNode } from "react";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Vacio } from "@/components/Feedback";
import { ZoomableImage } from "@/components/ZoomableImage";
import type { EstadoCola } from "@/db/repos/cola";
import { cn } from "@/lib/utils";

type Props = {
  back: { to: string; label: string };
  titulo: string;
  hechos: number;
  total: number;
  acciones?: ReactNode;
  lista: ReactNode;
  imagenPath: string | null;
  children: ReactNode;
};

/** Revisión uno a uno: cola a la izquierda, imagen con zoom al centro y formulario a la derecha. */
export function RevisionLayout({ back, titulo, hechos, total, acciones, lista, imagenPath, children }: Props) {
  return (
    <div>
      <PageHeader back={back} title={titulo} subtitle={`${hechos} de ${total} hechos`} actions={acciones} />
      <div className="grid h-[calc(100vh-12rem)] min-h-[32rem] grid-cols-[17rem_minmax(0,1fr)_28rem] gap-4">
        <div className="flex min-h-0 flex-col gap-2">{lista}</div>
        <div className="min-h-0 rounded-lg border bg-muted/30 p-2">
          {imagenPath ? (
            <ZoomableImage key={imagenPath} imagen={{ path: imagenPath }} className="size-full" />
          ) : (
            <Vacio texto="Sin imagen" />
          )}
        </div>
        <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

export type Filtro = "pendientes" | "hechos" | "todos";
export type ElementoLista = { id: number; estado: EstadoCola; titulo: string; detalle: string };

type ListaProps = {
  items: ElementoLista[];
  actualId: number | null;
  onElegir: (id: number) => void;
  filtro: Filtro;
  onFiltro: (f: Filtro) => void;
  /** Con casillas para seleccionar varios. */
  marcados?: Set<number>;
  onMarcar?: (id: number, marcado: boolean) => void;
  pie?: ReactNode;
};

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "pendientes", label: "Pendientes" },
  { id: "hechos", label: "Hechos" },
  { id: "todos", label: "Todos" },
];

export function ListaCola({ items, actualId, onElegir, filtro, onFiltro, marcados, onMarcar, pie }: ListaProps) {
  const visibles = items.filter((i) => filtro === "todos" || (filtro === "hechos" ? i.estado === "hecho" : i.estado === "pendiente"));
  return (
    <>
      <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={cn("flex-1 rounded-md px-2 py-1", filtro === f.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            onClick={() => onFiltro(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {visibles.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Nada por aquí.</li>}
        {visibles.map((i) => {
          const actual = i.id === actualId;
          const Icono = i.estado === "hecho" ? CheckCircle2 : actual ? CircleDot : Circle;
          return (
            <li key={i.id} className={cn("flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm", actual ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent")}>
              {onMarcar && (
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={`Marcar ${i.titulo}`}
                  checked={marcados?.has(i.id) ?? false}
                  disabled={i.estado === "hecho"}
                  onChange={(e) => onMarcar(i.id, e.target.checked)}
                />
              )}
              <button type="button" className="flex min-w-0 flex-1 items-start gap-1.5 text-left" onClick={() => onElegir(i.id)}>
                <Icono className={cn("mt-0.5 size-4 shrink-0", i.estado === "hecho" ? "text-emerald-600" : actual ? "text-primary-intenso" : "text-muted-foreground")} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{i.titulo}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i.detalle}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {pie}
    </>
  );
}
