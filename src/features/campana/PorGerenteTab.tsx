import { useMemo } from "react";
import Decimal from "decimal.js";
import { useNavigate } from "react-router";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Vacio } from "@/components/Feedback";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { ColumnasMenu } from "@/components/ColumnasMenu";
import { BotonConMotivo, MOTIVO_CERRADA } from "@/components/BotonConMotivo";
import { ESTADOS_GERENTE, EstadoGerenteBadge, ORDEN_ESTADOS } from "@/components/EstadoGerenteBadge";
import { estadoGerente, type EstadoGerente, type GerenteResumen } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatPct, formatUsd } from "@/domain/money";
import { claveComparacion } from "@/domain/texto";
import { useFiltrosUrl } from "@/lib/filtrosUrl";
import { ordenar, type Columnas } from "@/lib/orden";
import { useColumnas } from "@/lib/columnas";
import { cn } from "@/lib/utils";

type Fila = GerenteResumen & { estado: EstadoGerente };
type Key = "gerenteNombre" | "estado" | "asignado" | "pagado" | "restante" | "pct" | "cantidad" | "ultimaFecha";
const COLS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "gerenteNombre", label: "Gerente" },
  { key: "estado", label: "Estado" },
  { key: "asignado", label: "Asignado", numeric: true },
  { key: "pagado", label: "Pagado", numeric: true },
  { key: "restante", label: "Restante", numeric: true },
  { key: "pct", label: "% avance", numeric: true },
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
  cantidad: { tipo: "numero", valor: (g) => g.cantidad },
  ultimaFecha: { tipo: "texto", valor: (g) => g.ultimaFecha },
};
const FILTROS = ["qg", "estado"] as const;

function Celda({ col, g }: { col: Key; g: Fila }) {
  switch (col) {
    case "gerenteNombre":
      return <TableCell className="font-medium">{g.gerenteNombre}</TableCell>;
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
    case "cantidad":
      return <TableCell className="text-right tabular-nums">{g.cantidad}</TableCell>;
    case "ultimaFecha":
      return <TableCell>{g.ultimaFecha ? formatFecha(g.ultimaFecha) : "—"}</TableCell>;
  }
}

type Props = {
  campanaId: number;
  gerentes: GerenteResumen[];
  cerrada: boolean;
  onEditarSaldo: (g: GerenteResumen) => void;
  onQuitar: (g: GerenteResumen) => void;
  onAgregar: () => void;
};

export function PorGerenteTab({ campanaId, gerentes, cerrada, onEditarSaldo, onQuitar, onAgregar }: Props) {
  const navigate = useNavigate();
  const { orden, alternar } = useOrden<Key>({ key: "gerenteNombre", dir: 1 });
  const { valores: f, set, limpiar } = useFiltrosUrl(`campana-${campanaId}-gerentes`, FILTROS);
  const columnas = useColumnas("gerentes-campana", KEYS);
  const conEstado = useMemo<Fila[]>(() => gerentes.map((g) => ({ ...g, estado: estadoGerente(g) })), [gerentes]);
  const conteo = useMemo(() => {
    const c = Object.fromEntries(ORDEN_ESTADOS.map((e) => [e, 0])) as Record<EstadoGerente, number>;
    conEstado.forEach((g) => (c[g.estado] += 1));
    return c;
  }, [conEstado]);
  const filas = useMemo(() => {
    const k = claveComparacion(f.qg);
    const visibles = conEstado.filter((g) => (!f.estado || g.estado === f.estado) && claveComparacion(g.gerenteNombre).includes(k));
    return ordenar(visibles, COLUMNAS, orden);
  }, [conEstado, f.qg, f.estado, orden]);

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
      {filas.length === 0 ? (
        <Vacio texto="Ningún gerente coincide con la búsqueda o el estado elegido.">
          <Button variant="outline" onClick={limpiar}>
            Limpiar filtros
          </Button>
        </Vacio>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {columnas.visibles.map((k) => (
                <SortableHead key={k} col={k} orden={orden} onOrden={alternar} className={cn(COLS.find((c) => c.key === k)?.numeric && "text-right")}>
                  {ETIQUETAS[k]}
                </SortableHead>
              ))}
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((g) => (
              <TableRow key={g.asignacionId} className="cursor-pointer" onClick={() => navigate(`/asignaciones/${g.asignacionId}`)}>
                {columnas.visibles.map((col) => (
                  <Celda key={col} col={col} g={g} />
                ))}
                <TableCell className="space-x-2 text-right" onClick={(e) => e.stopPropagation()}>
                  <BotonConMotivo motivo={cerrada ? MOTIVO_CERRADA : undefined}>
                    <Button size="sm" variant="outline" disabled={cerrada} onClick={() => onEditarSaldo(g)}>
                      Editar saldo
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
