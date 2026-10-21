import type { ReactNode } from "react";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { PageHeader, type Miga } from "@/components/PageHeader";
import { Vacio } from "@/components/Feedback";
import { Casilla } from "@/components/Casilla";
import { ZoomableImage } from "@/components/ZoomableImage";
import type { EstadoCola } from "@/db/repos/cola";
import { clicSeleccion, seleccionarTodos, type Seleccion } from "@/domain/seleccion";
import { useAtajo } from "@/hooks/useAtajo";
import { cn } from "@/lib/utils";

type Props = {
  migas: Miga[];
  titulo: string;
  hechos: number;
  total: number;
  acciones?: ReactNode;
  lista: ReactNode;
  imagenPath: string | null;
  children: ReactNode;
};

/** Revisión uno a uno: cola a la izquierda, imagen con zoom al centro y formulario a la derecha. */
export function RevisionLayout({ migas, titulo, hechos, total, acciones, lista, imagenPath, children }: Props) {
  return (
    <div>
      <PageHeader migas={migas} title={titulo} subtitle={`${hechos} de ${total} hechos`} actions={acciones} />
      <div className="grid h-[calc(100vh-12rem)] min-h-[32rem] grid-cols-[17rem_minmax(0,1fr)_28rem] gap-4">
        <div className="flex min-h-0 flex-col gap-2">{lista}</div>
        <div className="min-h-0 rounded-lg border bg-muted/30 p-2">
          {imagenPath ? (
            <ZoomableImage key={imagenPath} imagen={{ path: imagenPath }} className="size-full" />
          ) : (
            <Vacio texto="Sin imagen" />
          )}
        </div>
        {/* Sin padding abajo: la barra de acciones (BarraAcciones) queda pegada al pie de esta columna. */}
        <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

/** Hecho / Saltar / Descartar: siempre a la vista al pie de la columna del formulario, aunque este haga scroll. */
export function BarraAcciones({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mt-1 flex justify-end gap-2 border-t bg-background pt-3 pb-1">{children}</div>;
}

/** Atajo que se muestra dentro de un botón (fuera del nombre accesible). */
export function TeclaAtajo({ children }: { children: ReactNode }) {
  return (
    <kbd aria-hidden className="ml-1 rounded border border-current/25 px-1 font-sans text-[0.7rem] font-normal opacity-70">
      {children}
    </kbd>
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
  /** Para marcar varios pendientes como en Windows: clic, Ctrl+clic, Shift+clic, Ctrl+A. */
  seleccion?: Seleccion;
  onSeleccion?: (s: Seleccion) => void;
  pie?: ReactNode;
};

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "pendientes", label: "Pendientes" },
  { id: "hechos", label: "Hechos" },
  { id: "todos", label: "Todos" },
];

export function ListaCola({ items, actualId, onElegir, filtro, onFiltro, seleccion, onSeleccion, pie }: ListaProps) {
  const visibles = items.filter((i) => filtro === "todos" || (filtro === "hechos" ? i.estado === "hecho" : i.estado === "pendiente"));
  const nHechos = items.filter((i) => i.estado === "hecho").length;
  const cuentas: Record<Filtro, number> = { pendientes: items.length - nHechos, hechos: nHechos, todos: items.length };
  const marcables = visibles.filter((i) => i.estado === "pendiente").map((i) => i.id);
  const conSeleccion = !!(seleccion && onSeleccion);
  const marcados = seleccion?.marcados ?? new Set<number>();
  const nMarcados = marcables.filter((id) => marcados.has(id)).length;
  const marcarTodos = () => seleccion && onSeleccion?.(seleccionarTodos(seleccion, marcables));
  useAtajo("a", marcarTodos, { ctrl: true, enCampos: false, activo: conSeleccion });

  /** Clic simple: abre y marca solo ese. Con Ctrl o Shift solo cambia la selección. */
  function clic(e: React.MouseEvent, id: number) {
    const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    if (conSeleccion) onSeleccion!(clicSeleccion(seleccion!, marcables, id, mods));
    if (!conSeleccion || (!mods.ctrl && !mods.shift)) onElegir(id);
  }
  return (
    <>
      <div className="flex gap-1 rounded-lg border bg-muted p-1 text-sm">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors",
              // El activo con el color principal: en oscuro, "bg-background" quedaba más oscuro que el contenedor.
              filtro === f.id ? "bg-primary font-medium text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
            onClick={() => onFiltro(f.id)}
          >
            {f.label}
            <span aria-hidden className="text-xs tabular-nums opacity-70">
              {cuentas[f.id]}
            </span>
          </button>
        ))}
      </div>
      {conSeleccion && marcables.length > 0 && (
        <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground" title="Ctrl+A">
          <CasillaTodos marcados={nMarcados} total={marcables.length} onChange={marcarTodos} />
          {nMarcados > 0 ? `${nMarcados} de ${marcables.length} marcados` : "Marcar todos"}
          <span className="ml-auto">Ctrl o Shift + clic: varios</span>
        </label>
      )}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto select-none">
        {visibles.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Nada por aquí.</li>}
        {visibles.map((i) => {
          const actual = i.id === actualId;
          const marcado = marcados.has(i.id) && i.estado === "pendiente";
          const Icono = i.estado === "hecho" ? CheckCircle2 : actual ? CircleDot : Circle;
          return (
            <li
              key={i.id}
              aria-selected={conSeleccion ? marcado : undefined}
              className={cn(
                "flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm",
                // Colores de fila del tema (--fila-*): bg-primary/15 casi no se veía con los temas pastel.
                actual ? "border-primary-intenso shadow-[inset_3px_0_0_var(--primary-intenso)]" : "border-transparent",
                marcado ? "bg-fila-sel" : actual ? "bg-fila-hover" : "hover:bg-fila-hover",
              )}
            >
              {conSeleccion && (
                <input
                  type="checkbox"
                  className="mt-0.5"
                  aria-label={`Marcar ${i.titulo}`}
                  checked={marcado}
                  disabled={i.estado === "hecho"}
                  // La casilla agrega o quita como Ctrl+clic (con Shift, el rango).
                  onClick={(e) => onSeleccion!(clicSeleccion(seleccion!, marcables, i.id, { ctrl: true, shift: e.shiftKey }))}
                  onChange={() => {}}
                />
              )}
              <button type="button" className="flex min-w-0 flex-1 items-start gap-1.5 text-left" onClick={(e) => clic(e, i.id)}>
                <Icono className={cn("mt-0.5 size-4 shrink-0", i.estado === "hecho" ? "text-emerald-600 dark:text-emerald-400" : actual ? "text-primary-intenso" : "text-muted-foreground")} />
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

/** Casilla de "marcar todos" con el estado intermedio cuando hay algunos marcados. */
function CasillaTodos({ marcados, total, onChange }: { marcados: number; total: number; onChange: () => void }) {
  return <Casilla aria-label="Marcar todos" indeterminado={marcados > 0 && marcados < total} checked={total > 0 && marcados === total} onChange={onChange} />;
}
