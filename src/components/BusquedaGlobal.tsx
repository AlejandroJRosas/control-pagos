import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FolderKanban, LineChart, Receipt, Search, Settings, User, Users, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { buscarGlobal, type ResultadoBusqueda } from "@/db/queries/busqueda";
import { formatFecha } from "@/domain/dates";
import { formatBs, formatUsd } from "@/domain/money";
import { claveComparacion } from "@/domain/texto";
import { useData } from "@/hooks/useData";
import { cn } from "@/lib/utils";

type Item = { key: string; grupo: string; titulo: string; detalle?: string; icono: LucideIcon; ir: string };

const PANTALLAS: Item[] = [
  { key: "p-campanas", grupo: "Ir a", titulo: "Campañas", icono: FolderKanban, ir: "/campanas" },
  { key: "p-gerentes", grupo: "Ir a", titulo: "Gerentes", icono: Users, ir: "/gerentes" },
  { key: "p-tasas", grupo: "Ir a", titulo: "Tasas", icono: LineChart, ir: "/tasas" },
  { key: "p-config", grupo: "Ir a", titulo: "Configuración y respaldos", icono: Settings, ir: "/configuracion" },
];

function aItems(texto: string, r: ResultadoBusqueda | undefined): Item[] {
  const k = claveComparacion(texto);
  const pantallas = PANTALLAS.filter((p) => claveComparacion(p.titulo).includes(k));
  if (!r) return pantallas;
  const depositos: Item[] = r.depositos.map((d) => ({
    key: `d-${d.id}`,
    grupo: "Depósitos",
    titulo: `${d.banco} · Ref. ${d.referencia}`,
    detalle: `${formatFecha(d.fecha)} · ${formatBs(d.montoBs)} · ${formatUsd(d.usd)} · ${d.gerenteNombre} · ${d.campanaNombre}`,
    icono: Receipt,
    ir: `/depositos/${d.id}`,
  }));
  // Un gerente aparece una vez por campaña en la que está; sin campañas, lleva a su ficha.
  const gerentes: Item[] = r.gerentes.flatMap((g) =>
    g.asignaciones.length === 0
      ? [{ key: `g-${g.id}`, grupo: "Gerentes", titulo: g.nombre, detalle: g.telefono ?? "Sin campañas", icono: User, ir: `/gerentes/${g.id}` }]
      : g.asignaciones.map((a) => ({ key: `a-${a.asignacionId}`, grupo: "Gerentes", titulo: g.nombre, detalle: a.campanaNombre, icono: User, ir: `/asignaciones/${a.asignacionId}` })),
  );
  const campanas: Item[] = r.campanas.map((c) => ({
    key: `c-${c.id}`,
    grupo: "Campañas",
    titulo: c.nombre,
    detalle: c.estado === "cerrada" ? "Cerrada" : "Activa",
    icono: FolderKanban,
    ir: `/campanas/${c.id}`,
  }));
  return [...depositos, ...gerentes, ...campanas, ...pantallas];
}

/** Paleta de búsqueda (Ctrl+K): depósitos, gerentes y campañas de todas las campañas, más accesos a pantallas. */
export function BusquedaGlobal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState("");
  const [activo, setActivo] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setConsulta(texto), 150);
    return () => clearTimeout(t);
  }, [texto]);
  const { data } = useData((db) => buscarGlobal(db, consulta), [consulta]);
  const items = useMemo(() => aItems(consulta, consulta.trim() ? data : undefined), [consulta, data]);
  useEffect(() => setActivo(0), [items]);
  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${activo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  function cambiarOpen(o: boolean) {
    if (!o) {
      setTexto("");
      setConsulta("");
    }
    onOpenChange(o);
  }

  function ir(item: Item | undefined) {
    if (!item) return;
    cambiarOpen(false);
    navigate(item.ir);
  }

  const buscando = texto !== consulta || (consulta.trim() !== "" && !data);
  const sinResultados = consulta.trim() !== "" && !buscando && items.length === 0;

  return (
    <Dialog open={open} onOpenChange={cambiarOpen}>
      <DialogContent showCloseButton={false} className="top-24 translate-y-0 gap-0 p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Buscar referencia, monto, gerente o campaña…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActivo((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActivo((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                ir(items[activo]);
              }
            }}
          />
          <kbd className="rounded border px-1.5 text-[10px] text-muted-foreground">Esc</kbd>
        </div>
        <div ref={lista} className="max-h-[60vh] overflow-y-auto p-1">
          {sinResultados && <p className="py-8 text-center text-sm text-muted-foreground">Sin resultados para «{consulta.trim()}».</p>}
          {buscando && items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Buscando…</p>}
          {items.map((it, i) => (
            <div key={it.key}>
              {(i === 0 || items[i - 1].grupo !== it.grupo) && <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{it.grupo}</div>}
              <button
                type="button"
                data-indice={i}
                onMouseMove={() => setActivo(i)}
                onClick={() => ir(it)}
                className={cn("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm", i === activo && "bg-accent text-accent-foreground")}
              >
                <it.icono className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{it.titulo}</span>
                  {it.detalle && <span className="block truncate text-xs text-muted-foreground">{it.detalle}</span>}
                </span>
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>↑↓ para moverse</span>
          <span>Enter para abrir</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
