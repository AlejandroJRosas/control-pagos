import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { useNavigate } from "react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Vacio } from "@/components/Feedback";
import type { GerenteResumen } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatPct, formatUsd } from "@/domain/money";
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
const DECIMALES: Key[] = ["asignado", "pagado", "restante"];

function compare(a: GerenteResumen, b: GerenteResumen, key: Key): number {
  const va = a[key];
  const vb = b[key];
  if (va == null) return vb == null ? 0 : -1;
  if (vb == null) return 1;
  if (DECIMALES.includes(key)) return new Decimal(va).cmp(vb as string);
  if (typeof va === "number") return va - (vb as number);
  return String(va).localeCompare(String(vb), "es");
}

type Props = {
  gerentes: GerenteResumen[];
  cerrada: boolean;
  onEditarSaldo: (g: GerenteResumen) => void;
  onQuitar: (g: GerenteResumen) => void;
};

export function PorGerenteTab({ gerentes, cerrada, onEditarSaldo, onQuitar }: Props) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "gerenteNombre", dir: 1 });
  const filas = useMemo(() => [...gerentes].sort((a, b) => compare(a, b, sort.key) * sort.dir), [gerentes, sort]);

  if (gerentes.length === 0) return <Vacio texto="Agrega gerentes a la campaña con su saldo a pagar." />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLS.map((c) => (
            <TableHead key={c.key} className={cn(c.numeric && "text-right")}>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
              >
                {c.label}
                {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
              </button>
            </TableHead>
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
