import { useMemo } from "react";
import Decimal from "decimal.js";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Vacio } from "@/components/Feedback";
import { SortableHead, useOrden } from "@/components/SortableHead";
import type { GerenteResumen } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatPct, formatUsd } from "@/domain/money";
import { ordenar, type Columnas } from "@/lib/orden";
import { cn } from "@/lib/utils";

type Key = "gerenteNombre" | "asignado" | "pagado" | "restante" | "pct" | "cantidad" | "ultimaFecha";
const COLS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "gerenteNombre", label: "Gerente" },
  { key: "asignado", label: "Asignado", numeric: true },
  { key: "pagado", label: "Pagado", numeric: true },
  { key: "restante", label: "Restante", numeric: true },
  { key: "pct", label: "% avance", numeric: true },
  { key: "cantidad", label: "Depósitos", numeric: true },
  { key: "ultimaFecha", label: "Último depósito" },
];
const COLUMNAS: Columnas<GerenteResumen, Key> = {
  gerenteNombre: { tipo: "texto", valor: (g) => g.gerenteNombre },
  asignado: { tipo: "decimal", valor: (g) => g.asignado },
  pagado: { tipo: "decimal", valor: (g) => g.pagado },
  restante: { tipo: "decimal", valor: (g) => g.restante },
  pct: { tipo: "numero", valor: (g) => g.pct },
  cantidad: { tipo: "numero", valor: (g) => g.cantidad },
  ultimaFecha: { tipo: "texto", valor: (g) => g.ultimaFecha },
};

type Props = {
  gerentes: GerenteResumen[];
  cerrada: boolean;
  onEditarSaldo: (g: GerenteResumen) => void;
  onQuitar: (g: GerenteResumen) => void;
};

export function PorGerenteTab({ gerentes, cerrada, onEditarSaldo, onQuitar }: Props) {
  const navigate = useNavigate();
  const { orden, alternar } = useOrden<Key>({ key: "gerenteNombre", dir: 1 });
  const filas = useMemo(() => ordenar(gerentes, COLUMNAS, orden), [gerentes, orden]);

  if (gerentes.length === 0) return <Vacio texto="Agrega gerentes a la campaña con su saldo a pagar." />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLS.map((c) => (
            <SortableHead key={c.key} col={c.key} orden={orden} onOrden={alternar} className={cn(c.numeric && "text-right")}>
              {c.label}
            </SortableHead>
          ))}
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((g) => (
          <TableRow key={g.asignacionId} className="cursor-pointer" onClick={() => navigate(`/asignaciones/${g.asignacionId}`)}>
            <TableCell className="font-medium">{g.gerenteNombre}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(g.asignado)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(g.pagado)}</TableCell>
            <TableCell className={cn("text-right tabular-nums", new Decimal(g.restante).isNegative() && "text-destructive")}>
              {formatUsd(g.restante)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatPct(g.pct)}</TableCell>
            <TableCell className="text-right tabular-nums">{g.cantidad}</TableCell>
            <TableCell>{g.ultimaFecha ? formatFecha(g.ultimaFecha) : "—"}</TableCell>
            <TableCell className="space-x-2 text-right" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="outline" disabled={cerrada} onClick={() => onEditarSaldo(g)}>
                Editar saldo
              </Button>
              {g.cantidad === 0 && (
                <Button size="sm" variant="ghost" disabled={cerrada} onClick={() => onQuitar(g)}>
                  Quitar
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
