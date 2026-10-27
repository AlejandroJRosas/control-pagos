import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, CircleDot, LoaderCircle, ScanText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, type Miga } from "@/components/PageHeader";
import { Vacio } from "@/components/Feedback";
import { Casilla } from "@/components/Casilla";
import { IconoIncidencias } from "@/components/IconoIncidencias";
import { ZoomableImage } from "@/components/ZoomableImage";
import type { EstadoCola } from "@/db/repos/cola";
import { coincideBusqueda } from "@/domain/busqueda";
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
  const grilla = useRef<HTMLDivElement>(null);
  const alto = useAltoRestante(grilla);
  return (
    <div>
      <PageHeader migas={migas} title={titulo} subtitle={`${hechos} de ${total} hechos`} actions={acciones} />
      {/* Imagen más angosta que el formulario: así los campos y los saldos no se cortan. */}
      <div ref={grilla} style={{ height: alto }} className="grid min-h-[26rem] grid-cols-[16rem_minmax(0,1fr)_32rem] gap-4">
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

/**
 * Alto que deja libre el `<main>` desde el borde de arriba de `ref` hasta su padding de abajo, para que la revisión llene la
 * pantalla sin scroll. Se vuelve a medir si cambia la ventana o aparece o se cierra un aviso arriba (tasa faltante…).
 */
function useAltoRestante(ref: React.RefObject<HTMLElement | null>): number | undefined {
  const [alto, setAlto] = useState<number>();
  useLayoutEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    if (!el || !main) return;
    const medir = () => {
      const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      const abajo = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      setAlto(Math.floor(main.clientHeight - top - abajo));
    };
    const tamano = new ResizeObserver(medir);
    const observar = () => {
      tamano.disconnect();
      tamano.observe(main);
      for (const hijo of Array.from(main.children)) tamano.observe(hijo);
      medir();
    };
    // Los avisos son hijos directos del <main>: se montan y desmontan solos.
    const hijos = new MutationObserver(observar);
    hijos.observe(main, { childList: true });
    observar();
    return () => {
      tamano.disconnect();
      hijos.disconnect();
    };
  }, [ref]);
  return alto;
}

/** Hecho / Saltar / Descartar: siempre a la vista al pie de la columna del formulario, aunque este haga scroll. */
export function BarraAcciones({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mt-1 flex justify-end gap-2 border-t bg-background pt-3 pb-1">{children}</div>;
}

/** "Volver a leer" la imagen con el OCR (ver `useReleer`), arriba del formulario. */
export function BotonReleer({ leyendo, disabled, onClick }: { leyendo: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <Button type="button" variant="outline" size="sm" disabled={disabled || leyendo} title="Lee la imagen otra vez; lo leído reemplaza lo que haya (con Deshacer)" onClick={onClick}>
        {leyendo ? <LoaderCircle className="animate-spin" /> : <ScanText />}
        {leyendo ? "Leyendo…" : "Volver a leer"}
      </Button>
    </div>
  );
}

/** Atajo que se muestra dentro de un botón (fuera del nombre accesible). */
export function TeclaAtajo({ children }: { children: ReactNode }) {
  return (
    <kbd aria-hidden className="ml-1 rounded border border-current/25 px-1 font-sans text-[0.7rem] font-normal opacity-70">
      {children}
    </kbd>
  );
}

export type Filtro = "pendientes" | "hechos" | "todos" | "incidencias";
/**
 * `motivos`: por qué merece una mirada (el ícono va en la fila); solo los pendientes de depósitos los traen.
 * `busqueda`: lo que encuentra el buscador de la lista (referencia en `textos`, monto en `montos`); sin él no hay buscador.
 */
export type ElementoLista = {
  id: number;
  estado: EstadoCola;
  titulo: string;
  detalle: string;
  motivos?: string[];
  busqueda?: { textos: string[]; montos: string[] };
};

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
  /** Muestra el filtro "Con incidencias" (los elementos traen `motivos`). */
  conIncidencias?: boolean;
};

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "pendientes", label: "Pendientes" },
  { id: "hechos", label: "Hechos" },
  { id: "todos", label: "Todos" },
];

const tieneIncidencias = (i: ElementoLista) => i.estado === "pendiente" && !!i.motivos?.length;

/** Lo que muestra cada filtro; el que se está revisando se queda en "incidencias" aunque ya no las tenga, hasta pasar a otro. */
export function visiblesDe(items: ElementoLista[], filtro: Filtro, retenidoId: number | null = null): ElementoLista[] {
  if (filtro === "todos") return items;
  if (filtro === "hechos") return items.filter((i) => i.estado === "hecho");
  if (filtro === "incidencias") return items.filter((i) => tieneIncidencias(i) || (i.estado === "pendiente" && i.id === retenidoId));
  return items.filter((i) => i.estado === "pendiente");
}

export function ListaCola({ items, actualId, onElegir, filtro, onFiltro, seleccion, onSeleccion, pie, conIncidencias }: ListaProps) {
  // Se retiene al abierto que tuvo incidencias mientras sigue abierto: al corregirlas no desaparece de la lista.
  const retenido = useRef<number | null>(null);
  if (actualId !== null && items.some((i) => i.id === actualId && tieneIncidencias(i))) retenido.current = actualId;
  else if (retenido.current !== actualId) retenido.current = null;
  const [q, setQ] = useState("");
  const conBuscador = items.some((i) => i.busqueda);
  const buscando = conBuscador && q.trim() !== "";
  // La búsqueda se aplica dentro del filtro elegido; las cuentas de los filtros no cambian.
  const visibles = visiblesDe(items, filtro, retenido.current).filter((i) => !buscando || coincideBusqueda(i.busqueda?.textos ?? [], i.busqueda?.montos ?? [], q));
  const nHechos = items.filter((i) => i.estado === "hecho").length;
  const nIncidencias = items.filter(tieneIncidencias).length;
  const cuentas: Record<Filtro, number> = { pendientes: items.length - nHechos, hechos: nHechos, todos: items.length, incidencias: nIncidencias };
  const filtros = conIncidencias ? [...FILTROS, { id: "incidencias" as const, label: "Con incidencias" }] : FILTROS;
  const marcables = visibles.filter((i) => i.estado === "pendiente").map((i) => i.id);
  const conSeleccion = !!(seleccion && onSeleccion);
  const marcados = seleccion?.marcados ?? new Set<number>();
  const nMarcados = marcables.filter((id) => marcados.has(id)).length;
  const marcarTodos = () => seleccion && onSeleccion?.(seleccionarTodos(seleccion, marcables));
  useAtajo("a", marcarTodos, { ctrl: true, enCampos: false, activo: conSeleccion });
  const listaRef = useRef<HTMLUListElement>(null);
  /** ↑ / ↓: abre el anterior o el siguiente de la lista, como un clic simple. */
  function mover(paso: number) {
    const i = visibles.findIndex((v) => v.id === actualId);
    const sig = visibles[i < 0 ? 0 : i + paso];
    if (!sig) return;
    if (conSeleccion) onSeleccion!(clicSeleccion(seleccion!, marcables, sig.id, { ctrl: false, shift: false }));
    onElegir(sig.id);
    listaRef.current?.querySelector(`[data-id="${sig.id}"]`)?.scrollIntoView?.({ block: "nearest" });
  }
  useAtajo("ArrowDown", () => mover(1));
  useAtajo("ArrowUp", () => mover(-1));

  /** Clic simple: abre y marca solo ese. Con Ctrl o Shift solo cambia la selección. */
  function clic(e: React.MouseEvent, id: number) {
    const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
    if (conSeleccion) onSeleccion!(clicSeleccion(seleccion!, marcables, id, mods));
    if (!conSeleccion || (!mods.ctrl && !mods.shift)) onElegir(id);
  }
  return (
    <>
      {conBuscador && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-buscar-tabla
            type="search"
            aria-label="Buscar en la cola"
            className="pl-8"
            placeholder="Referencia o monto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted p-1 text-sm">
        {filtros.map((f) => (
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
            {f.id === "incidencias" ? (
              `${f.label} (${cuentas[f.id]})`
            ) : (
              <>
                {f.label}
                <span aria-hidden className="text-xs tabular-nums opacity-70">
                  {cuentas[f.id]}
                </span>
              </>
            )}
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
      <ul ref={listaRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto select-none">
        {visibles.length === 0 && (
          <li className="py-6 text-center text-sm text-muted-foreground">{buscando ? "Ningún comprobante coincide con la búsqueda." : "Nada por aquí."}</li>
        )}
        {visibles.map((i) => {
          const actual = i.id === actualId;
          const marcado = marcados.has(i.id) && i.estado === "pendiente";
          const Icono = i.estado === "hecho" ? CheckCircle2 : actual ? CircleDot : Circle;
          return (
            <li
              key={i.id}
              data-id={i.id}
              aria-current={actual || undefined}
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
              {i.estado === "pendiente" && <IconoIncidencias motivos={i.motivos ?? []} />}
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
