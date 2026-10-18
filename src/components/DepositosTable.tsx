import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { useNavigate } from "react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FilaDeposito } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatNumberVE, formatTasa, formatUsd } from "@/domain/money";
import { getDb } from "@/db";
import { deleteDepositos } from "@/db/repos/depositos";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { ordenar, type Columnas } from "@/lib/orden";
import { ComprobanteThumb } from "./ComprobanteThumb";
import { ConfirmDialog } from "./ConfirmDialog";
import { Vacio } from "./Feedback";
import { SortableHead, useOrden } from "./SortableHead";
import { cn } from "@/lib/utils";

type Props = {
  filas: FilaDeposito[];
  mostrarGerente: boolean;
  saldoLabel: string;
  totales?: { totalBs: string; totalUsd: string; cantidad: number };
  /** Campaña cerrada: sin selección ni eliminación. */
  soloLectura?: boolean;
};

type Col = "fecha" | "gerente" | "banco" | "referencia" | "cuenta" | "montoBs" | "tasa" | "usd" | "saldo" | "observaciones";
const COLUMNAS: Columnas<FilaDeposito, Col> = {
  fecha: { tipo: "texto", valor: (d) => d.fecha },
  gerente: { tipo: "texto", valor: (d) => d.gerenteNombre },
  banco: { tipo: "texto", valor: (d) => d.banco },
  referencia: { tipo: "texto", valor: (d) => d.referencia },
  cuenta: { tipo: "texto", valor: (d) => d.cuentaDestino },
  montoBs: { tipo: "decimal", valor: (d) => d.montoBs },
  tasa: { tipo: "decimal", valor: (d) => d.tasaValor },
  usd: { tipo: "decimal", valor: (d) => d.usd },
  saldo: { tipo: "decimal", valor: (d) => d.saldoMostrado },
  observaciones: { tipo: "texto", valor: (d) => d.observaciones },
};

export function DepositosTable({ filas, mostrarGerente, saldoLabel, totales, soloLectura = false }: Props) {
  const navigate = useNavigate();
  const { orden, alternar } = useOrden<Col>();
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [borrar, setBorrar] = useState<number[] | null>(null);
  const ordenadas = useMemo(() => ordenar(filas, COLUMNAS, orden), [filas, orden]);
  // Solo cuentan los marcados que siguen visibles (al filtrar se pueden ocultar).
  const elegidos = filas.filter((d) => marcados.has(d.id)).map((d) => d.id);
  const todos = filas.length > 0 && elegidos.length === filas.length;

  if (filas.length === 0) return <Vacio texto="No hay depósitos." />;
  const num = "text-right tabular-nums";
  const head = (col: Col, label: string, className?: string) => (
    <SortableHead col={col} orden={orden} onOrden={alternar} className={className}>
      {label}
    </SortableHead>
  );

  function marcar(id: number, si: boolean) {
    setMarcados((m) => {
      const n = new Set(m);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  async function eliminar(ids: number[]) {
    try {
      await deleteDepositos(await getDb(), ids);
      toast.success(ids.length === 1 ? "Depósito eliminado" : `${ids.length} depósitos eliminados`);
      setMarcados((m) => new Set([...m].filter((id) => !ids.includes(id))));
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setBorrar(null);
    }
  }

  return (
    <div className="space-y-2">
      {!soloLectura && elegidos.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-fila-hover px-3 py-2 text-sm">
          <span className="font-medium">{elegidos.length} seleccionado(s)</span>
          <Button size="sm" variant="destructive" onClick={() => setBorrar(elegidos)}>
            <Trash2 />
            Eliminar seleccionados
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {!soloLectura && (
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={todos}
                  onChange={(e) => setMarcados(e.target.checked ? new Set(filas.map((d) => d.id)) : new Set())}
                />
              </TableHead>
            )}
            {head("fecha", "Fecha")}
            {mostrarGerente && head("gerente", "Gerente")}
            {head("banco", "Banco")}
            {head("referencia", "Referencia")}
            {head("cuenta", "Cuenta destino")}
            {head("montoBs", "Monto Bs", "text-right")}
            {head("tasa", "Tasa", "text-right")}
            {head("usd", "USD", "text-right")}
            {head("saldo", saldoLabel, "text-right")}
            {head("observaciones", "Observaciones")}
            <TableHead>Comprobante</TableHead>
            {!soloLectura && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenadas.map((d) => (
            <TableRow
              key={d.id}
              className="cursor-pointer"
              data-state={marcados.has(d.id) ? "selected" : undefined}
              onClick={() => navigate(`/depositos/${d.id}`)}
            >
              {!soloLectura && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Seleccionar depósito ${d.referencia}`}
                    checked={marcados.has(d.id)}
                    onChange={(e) => marcar(d.id, e.target.checked)}
                  />
                </TableCell>
              )}
              <TableCell>{formatFecha(d.fecha)}</TableCell>
              {mostrarGerente && <TableCell>{d.gerenteNombre}</TableCell>}
              <TableCell>{d.banco}</TableCell>
              <TableCell className="font-mono">{d.referencia}</TableCell>
              <TableCell className="font-mono text-xs">{d.cuentaDestino}</TableCell>
              <TableCell className={num}>{formatNumberVE(d.montoBs)}</TableCell>
              <TableCell className={num}>{formatTasa(d.tasaValor)}</TableCell>
              <TableCell className={num}>{formatUsd(d.usd)}</TableCell>
              <TableCell className={cn(num, new Decimal(d.saldoMostrado).isNegative() && "font-medium text-destructive")}>
                {formatUsd(d.saldoMostrado)}
              </TableCell>
              <TableCell className="max-w-48 truncate" title={d.observaciones ?? ""}>
                {d.observaciones}
              </TableCell>
              <TableCell>{d.imagenPath ? <ComprobanteThumb path={d.imagenPath} /> : "—"}</TableCell>
              {!soloLectura && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button size="icon-sm" variant="ghost" title="Eliminar depósito" aria-label="Eliminar depósito" onClick={() => setBorrar([d.id])}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        {totales && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={(mostrarGerente ? 5 : 4) + (soloLectura ? 0 : 1)}>Total ({totales.cantidad} depósitos)</TableCell>
              <TableCell className={num}>{formatNumberVE(totales.totalBs)}</TableCell>
              <TableCell />
              <TableCell className={num}>{formatUsd(totales.totalUsd)}</TableCell>
              <TableCell colSpan={soloLectura ? 3 : 4} />
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <ConfirmDialog
        open={borrar !== null}
        onOpenChange={(o) => !o && setBorrar(null)}
        title={borrar && borrar.length > 1 ? `Eliminar ${borrar.length} depósitos` : "Eliminar depósito"}
        description={
          borrar && borrar.length > 1
            ? `Se eliminarán ${borrar.length} depósitos y los saldos se recalcularán.`
            : "El depósito se eliminará y los saldos se recalcularán."
        }
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => (borrar ? eliminar(borrar) : undefined)}
      />
    </div>
  );
}
