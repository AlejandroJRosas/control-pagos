import { useMemo } from "react";
import Decimal from "decimal.js";
import { useNavigate } from "react-router";
import { ChevronDown, ChevronRight, CircleCheck, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STICKY_PIE, Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Vacio } from "@/components/Feedback";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { ColumnasMenu } from "@/components/ColumnasMenu";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { BotonConMotivo, MOTIVO_CERRADA } from "@/components/BotonConMotivo";
import { ESTADOS_GERENTE, EstadoGerenteBadge, ORDEN_ESTADOS } from "@/components/EstadoGerenteBadge";
import { estadoGerente, resumenesDeRama, sumarResumenes, type EstadoGerente, type GerenteResumen, type Resumen } from "@/domain/campanaView";
import { aplanarConCierres, armarArbol, type FilaConCierre, type Jefes } from "@/domain/arbol";
import { formatFecha } from "@/domain/dates";
import { cumplimientoGerente, metaPorDefecto, metasDePorcentaje, vistaMetas, type CumplimientoGerente, type Meta } from "@/domain/metas";
import { formatPct, formatUsd } from "@/domain/money";
import { claveComparacion } from "@/domain/texto";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import { ordenar, type Columnas } from "@/lib/orden";
import { agruparPie, useColumnas } from "@/lib/columnas";
import { useRamasPlegadas } from "@/lib/ramasPlegadas";
import { cn } from "@/lib/utils";

/** `meta`: cómo va el gerente con la meta por porcentaje elegida (null sin meta elegida o sin saldo asignado). */
type Fila = GerenteResumen & { estado: EstadoGerente; meta: CumplimientoGerente | null };
type Key = "gerenteNombre" | "estado" | "asignado" | "pagado" | "restante" | "pct" | "meta" | "cantidad" | "ultimaFecha";
const COLS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "gerenteNombre", label: "Gerente" },
  { key: "estado", label: "Estado" },
  { key: "asignado", label: "Asignado", numeric: true },
  { key: "pagado", label: "Pagado", numeric: true },
  { key: "restante", label: "Restante", numeric: true },
  { key: "pct", label: "% avance", numeric: true },
  { key: "meta", label: "Meta" },
  { key: "cantidad", label: "Depósitos", numeric: true },
  { key: "ultimaFecha", label: "Último depósito" },
];
const KEYS = COLS.map((c) => c.key);
const ETIQUETAS = Object.fromEntries(COLS.map((c) => [c.key, c.label])) as Record<Key, string>;
const COLUMNAS: Columnas<Fila, Key> = {
  gerenteNombre: { tipo: "texto", valor: (g) => g.gerenteNombre },
  estado: { tipo: "numero", valor: (g) => ORDEN_ESTADOS.indexOf(g.estado) },
  asignado: { tipo: "decimal", valor: (g) => g.asignado },
  pagado: { tipo: "decimal", valor: (g) => g.pagado },
  restante: { tipo: "decimal", valor: (g) => g.restante },
  pct: { tipo: "numero", valor: (g) => g.pct },
  meta: { tipo: "numero", valor: (g) => (g.meta ? (g.meta.cumplida ? 1 : 0) : -1) },
  cantidad: { tipo: "numero", valor: (g) => g.cantidad },
  ultimaFecha: { tipo: "texto", valor: (g) => g.ultimaFecha },
};
const FILTROS = ["qg", "estado", "meta", "cumple"] as const;
const CON_TOTAL: Key[] = ["asignado", "pagado", "restante", "pct", "cantidad"];

/** Celda con un total del pie: el mismo formato que la de cada gerente. */
function CeldaTotal({ col, t }: { col: Key; t: Resumen }) {
  switch (col) {
    case "asignado":
    case "pagado":
      return <TableCell className="text-right tabular-nums">{formatUsd(t[col])}</TableCell>;
    case "restante":
      return (
        <TableCell className={cn("text-right tabular-nums", new Decimal(t.restante).isNegative() && "text-destructive")}>{formatUsd(t.restante)}</TableCell>
      );
    case "pct":
      return <TableCell className="text-right tabular-nums">{formatPct(t.pct)}</TableCell>;
    default:
      return <TableCell className="text-right tabular-nums">{t.cantidad}</TableCell>;
  }
}

/** Restante y avance de la rama de un jefe, en una línea («Rama: restante $ 900,00 · 70 %»). */
export function RamaResumen({ r, className }: { r: Resumen; className?: string }) {
  return (
    <span className={cn("text-xs font-normal tabular-nums", new Decimal(r.restante).isNegative() ? "text-destructive" : "text-muted-foreground", className)}>
      {`Rama: restante ${formatUsd(r.restante)} · ${formatPct(r.pct)}`}
    </span>
  );
}

/** Celda de la fila que cierra la rama de un jefe: lo suyo más lo de toda su gente. */
function CeldaCierre({ col, t, nombre, nivel, debajo }: { col: Key; t: Resumen; nombre: string; nivel: number; debajo: number }) {
  switch (col) {
    case "gerenteNombre":
      return (
        <TableCell style={{ paddingLeft: `calc(var(--spacing) * 2 + ${(nivel + 1) * 1.25}rem)` }}>
          <span className="inline-block size-5 align-middle" aria-hidden />
          <span data-cierre>{`Total rama de ${nombre} (${debajo + 1})`}</span>
        </TableCell>
      );
    case "estado":
    case "meta":
      return <TableCell />;
    case "ultimaFecha":
      return <TableCell>{t.ultimaFecha ? formatFecha(t.ultimaFecha) : "—"}</TableCell>;
    default:
      return <CeldaTotal col={col} t={t} />;
  }
}

/** Lugar de una fila en el árbol (solo en el modo árbol). Plegada, `resumen` es el de su rama. */
type Rama = { nivel: number; debajo: number; tieneHijos: boolean; plegada: boolean; onAlternar: () => void; resumen?: Resumen };

function Celda({ col, g, rama }: { col: Key; g: Fila; rama?: Rama }) {
  switch (col) {
    case "gerenteNombre":
      if (!rama) return <TableCell className="font-medium">{g.gerenteNombre}</TableCell>;
      return (
        <TableCell className="font-medium" data-nivel={rama.nivel} style={{ paddingLeft: `calc(var(--spacing) * 2 + ${rama.nivel * 1.25}rem)` }}>
          <div className="flex items-center gap-1">
            {rama.tieneHijos ? (
              <button
                type="button"
                aria-label={`${rama.plegada ? "Desplegar" : "Plegar"} a ${g.gerenteNombre}`}
                className="-ml-1 rounded p-0.5 hover:bg-fila-hover"
                onClick={(e) => {
                  e.stopPropagation();
                  rama.onAlternar();
                }}
              >
                {rama.plegada ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            ) : (
              <span className="inline-block size-5" aria-hidden />
            )}
            <span data-gerente>{g.gerenteNombre}</span>
            {rama.debajo > 0 && <span className="text-xs font-normal text-muted-foreground">{`· ${rama.debajo} debajo`}</span>}
          </div>
          {rama.plegada && rama.resumen && <RamaResumen r={rama.resumen} className="ml-6 block" />}
        </TableCell>
      );
    case "estado":
      return (
        <TableCell>
          <EstadoGerenteBadge estado={g.estado} />
        </TableCell>
      );
    case "asignado":
      return <TableCell className="text-right tabular-nums">{formatUsd(g.asignado)}</TableCell>;
    case "pagado":
      return <TableCell className="text-right tabular-nums">{formatUsd(g.pagado)}</TableCell>;
    case "restante":
      return (
        <TableCell className={cn("text-right tabular-nums", new Decimal(g.restante).isNegative() && "font-medium text-destructive")}>{formatUsd(g.restante)}</TableCell>
      );
    case "pct":
      return <TableCell className="text-right tabular-nums">{formatPct(g.pct)}</TableCell>;
    case "meta":
      return (
        <TableCell className="tabular-nums">
          {!g.meta ? (
            <span className="text-muted-foreground">—</span>
          ) : g.meta.cumplida ? (
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="size-3.5" />
              Cumplida
            </span>
          ) : (
            `Faltan ${formatUsd(g.meta.falta)}`
          )}
        </TableCell>
      );
    case "cantidad":
      return <TableCell className="text-right tabular-nums">{g.cantidad}</TableCell>;
    case "ultimaFecha":
      return <TableCell>{g.ultimaFecha ? formatFecha(g.ultimaFecha) : "—"}</TableCell>;
  }
}

type Props = {
  campanaId: number;
  gerentes: GerenteResumen[];
  jefes: Jefes;
  /** Metas de la campaña: las de porcentaje se miden en cada gerente. */
  metas: Meta[];
  hoy: string;
  cerrada: boolean;
  onEditarSaldo: (g: GerenteResumen) => void;
  onQuitar: (g: GerenteResumen) => void;
  onAgregar: () => void;
};

export function PorGerenteTab({ campanaId, gerentes, jefes, metas, hoy, cerrada, onEditarSaldo, onQuitar, onAgregar }: Props) {
  const navigate = useNavigate();
  const { orden, alternar } = useOrden<Key>({ key: "gerenteNombre", dir: 1 });
  const { valores: f, set, limpiar } = useFiltrosUrl(`campana-${campanaId}-gerentes`, FILTROS);
  const columnas = useColumnas("gerentes-campana", KEYS);
  // Metas por porcentaje (medidas en la campaña) y la elegida: la de la URL o, si no está, la que toca revisar.
  const metasPct = useMemo(() => metasDePorcentaje(vistaMetas(metas, sumarResumenes(gerentes), hoy).metas), [metas, gerentes, hoy]);
  const metaElegida = metasPct.find((m) => String(m.id) === f.meta) ?? metaPorDefecto(metasPct);
  const conEstado = useMemo<Fila[]>(
    () => gerentes.map((g) => ({ ...g, estado: estadoGerente(g), meta: metaElegida ? cumplimientoGerente(metaElegida, g) : null })),
    [gerentes, metaElegida],
  );
  const cumplimiento = useMemo(() => {
    const c = { si: 0, no: 0 };
    conEstado.forEach((g) => g.meta && (g.meta.cumplida ? c.si++ : c.no++));
    return c;
  }, [conEstado]);
  const filtroCumple = metaElegida && (f.cumple === "si" || f.cumple === "no") ? f.cumple : "";
  const conteo = useMemo(() => {
    const c = Object.fromEntries(ORDEN_ESTADOS.map((e) => [e, 0])) as Record<EstadoGerente, number>;
    conEstado.forEach((g) => (c[g.estado] += 1));
    return c;
  }, [conEstado]);
  const ramas = useRamasPlegadas(`campana-${campanaId}`);
  const ordenadas = useMemo(() => {
    const k = claveComparacion(f.qg);
    const visibles = conEstado.filter(
      (g) =>
        (!f.estado || g.estado === f.estado) &&
        (!filtroCumple || (!!g.meta && g.meta.cumplida === (filtroCumple === "si"))) &&
        claveComparacion(g.gerenteNombre).includes(k),
    );
    // sin orden elegido (vuelta al original) la base del árbol es por nombre
    return ordenar(visibles, COLUMNAS, orden ?? { key: "gerenteNombre", dir: 1 });
  }, [conEstado, f.qg, f.estado, filtroCumple, orden]);
  // árbol solo con el orden por defecto y sin filtros; con búsqueda, estado u otro orden es lista plana
  const modoArbol = (!orden || (orden.key === "gerenteNombre" && orden.dir === 1)) && !f.qg && !f.estado && !filtroCumple;
  const plegadosClave = [...ramas.plegados].join(",");
  const arbol = useMemo(() => (modoArbol ? armarArbol(ordenadas, (a) => a.asignacionId, jefes) : []), [modoArbol, ordenadas, jefes]);
  const deRama = useMemo(() => resumenesDeRama(arbol, (a) => a.asignacionId), [arbol]);
  const filas = useMemo<FilaConCierre<Fila>[]>(
    () =>
      modoArbol
        ? aplanarConCierres(arbol, (a) => a.asignacionId, ramas.plegados)
        : ordenadas.map((item) => ({ tipo: "nodo", item, nivel: 0, debajo: 0, tieneHijos: false })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modoArbol, arbol, ordenadas, plegadosClave],
  );
  // la columna de la meta solo existe con una meta por porcentaje
  const visiblesCols = columnas.visibles.filter((k) => k !== "meta" || metaElegida);
  // las ramas plegadas siguen contando en el total: solo cambia lo que se ve
  const total = useMemo(() => sumarResumenes(ordenadas), [ordenadas]);

  if (gerentes.length === 0)
    return (
      <Vacio texto="Agrega gerentes a la campaña con su saldo a pagar.">
        {!cerrada && (
          <Button onClick={onAgregar}>
            <UserPlus />
            Agregar gerentes
          </Button>
        )}
      </Vacio>
    );

  const chip = (estado: EstadoGerente | "", label: string, n: number) => (
    <button
      key={estado || "todos"}
      type="button"
      aria-pressed={f.estado === estado}
      onClick={() => set({ estado })}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-fila-hover",
        f.estado === estado && "border-primary-intenso bg-fila-hover font-medium",
      )}
    >
      {estado && <span className={cn("size-1.5 rounded-full", ESTADOS_GERENTE[estado].punto)} />}
      {label}
      <span className="text-muted-foreground tabular-nums">{n}</span>
    </button>
  );

  const chipCumple = (valor: "si" | "no", label: string, n: number) => (
    <button
      type="button"
      aria-pressed={filtroCumple === valor}
      onClick={() => set({ cumple: filtroCumple === valor ? "" : valor })}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-fila-hover",
        filtroCumple === valor && "border-primary-intenso bg-fila-hover font-medium",
      )}
    >
      <span className={cn("size-1.5 rounded-full", valor === "si" ? "bg-emerald-600" : "bg-destructive")} />
      {label}
      <span className="text-muted-foreground tabular-nums">{n}</span>
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-buscar-tabla
            type="search"
            aria-label="Buscar gerente"
            className="pl-8"
            placeholder="Buscar gerente…"
            value={f.qg}
            onChange={(e) => set({ qg: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {chip("", "Todos", conEstado.length)}
          {ORDEN_ESTADOS.filter((e) => conteo[e] > 0 || f.estado === e).map((e) => chip(e, ESTADOS_GERENTE[e].label, conteo[e]))}
        </div>
        {metaElegida && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="meta-gerentes" className="text-sm text-muted-foreground">
              Meta
            </label>
            <BuscadorSelect
              id="meta-gerentes"
              className="w-48"
              value={String(metaElegida.id)}
              onChange={(v) => v && set({ meta: v })}
              opciones={metasPct.map((m) => ({ value: String(m.id), label: `${formatPct(Number(m.porcentaje))} · ${formatFecha(m.fecha)}` }))}
            />
            {chipCumple("si", "Cumplieron", cumplimiento.si)}
            {chipCumple("no", "No cumplieron", cumplimiento.no)}
          </div>
        )}
        <div className="ml-auto">
          <ColumnasMenu
            estado={columnas.estado}
            etiquetas={ETIQUETAS}
            onAlternar={columnas.alternar}
            onMover={columnas.mover}
            onSoltar={columnas.soltar}
            onRestablecer={columnas.restablecer}
          />
        </div>
      </div>
      {ordenadas.length === 0 ? (
        <Vacio texto="Ningún gerente coincide con la búsqueda o el estado elegido.">
          <Button variant="outline" onClick={limpiar}>
            Limpiar filtros
          </Button>
        </Vacio>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {visiblesCols.map((k) => (
                <SortableHead key={k} col={k} orden={orden} onOrden={alternar} className={cn(COLS.find((c) => c.key === k)?.numeric && "text-right")}>
                  {k === "meta" && metaElegida ? `Meta ${formatPct(Number(metaElegida.porcentaje))}` : ETIQUETAS[k]}
                </SortableHead>
              ))}
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((f) => {
              const { item: g, nivel, debajo } = f;
              if (f.tipo === "cierre") {
                const t = deRama.get(g.asignacionId) as Resumen;
                return (
                  <TableRow key={`cierre-${g.asignacionId}`} className="text-muted-foreground italic hover:bg-transparent">
                    {visiblesCols.map((col) => (
                      <CeldaCierre key={col} col={col} t={t} nombre={g.gerenteNombre} nivel={nivel} debajo={debajo} />
                    ))}
                    <TableCell />
                  </TableRow>
                );
              }
              const { tieneHijos } = f;
              return (
                <TableRow key={g.asignacionId} className="cursor-pointer" onClick={() => navigate(`/asignaciones/${g.asignacionId}`)}>
                  {visiblesCols.map((col) => (
                    <Celda
                      key={col}
                      col={col}
                      g={g}
                      rama={
                        modoArbol
                          ? {
                              nivel,
                              debajo,
                              tieneHijos,
                              plegada: ramas.plegados.has(g.asignacionId),
                              onAlternar: () => ramas.alternar(g.asignacionId),
                              resumen: deRama.get(g.asignacionId),
                            }
                          : undefined
                      }
                    />
                  ))}
                  <TableCell className="space-x-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <BotonConMotivo motivo={cerrada ? MOTIVO_CERRADA : undefined}>
                      <Button size="sm" variant="outline" disabled={cerrada} onClick={() => onEditarSaldo(g)}>
                        Editar
                      </Button>
                    </BotonConMotivo>
                    {g.cantidad === 0 && (
                      <BotonConMotivo motivo={cerrada ? MOTIVO_CERRADA : undefined}>
                        <Button size="sm" variant="ghost" disabled={cerrada} onClick={() => onQuitar(g)}>
                          Quitar
                        </Button>
                      </BotonConMotivo>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter data-barra-inferior className={STICKY_PIE}>
            <TableRow>
              {agruparPie<Key | "acciones">([...visiblesCols, "acciones"], CON_TOTAL).map((c, i) =>
                c.tipo === "total" ? (
                  <CeldaTotal key={i} col={c.col as Key} t={total} />
                ) : (
                  <TableCell key={i} colSpan={c.span} className="whitespace-nowrap">
                    {c.tipo === "etiqueta" && `Total (${ordenadas.length} ${ordenadas.length === 1 ? "gerente" : "gerentes"})`}
                  </TableCell>
                ),
              )}
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
}
