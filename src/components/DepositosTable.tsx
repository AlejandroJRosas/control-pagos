import Decimal from "decimal.js";
import { useNavigate } from "react-router";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FilaDeposito } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatNumberVE, formatTasa, formatUsd } from "@/domain/money";
import { ComprobanteThumb } from "./ComprobanteThumb";
import { Vacio } from "./Feedback";
import { cn } from "@/lib/utils";

type Props = {
  filas: FilaDeposito[];
  mostrarGerente: boolean;
  saldoLabel: string;
  totales?: { totalBs: string; totalUsd: string; cantidad: number };
};

export function DepositosTable({ filas, mostrarGerente, saldoLabel, totales }: Props) {
  const navigate = useNavigate();
  if (filas.length === 0) return <Vacio texto="No hay depósitos." />;
  const num = "text-right tabular-nums";
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          {mostrarGerente && <TableHead>Gerente</TableHead>}
          <TableHead>Banco</TableHead>
          <TableHead>Referencia</TableHead>
          <TableHead>Cuenta destino</TableHead>
          <TableHead className="text-right">Monto Bs</TableHead>
          <TableHead className="text-right">Tasa</TableHead>
          <TableHead className="text-right">USD</TableHead>
          <TableHead className="text-right">{saldoLabel}</TableHead>
          <TableHead>Observaciones</TableHead>
          <TableHead>Comprobante</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((d) => (
          <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/depositos/${d.id}`)}>
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
          </TableRow>
        ))}
      </TableBody>
      {totales && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={mostrarGerente ? 5 : 4}>Total ({totales.cantidad} depósitos)</TableCell>
            <TableCell className={num}>{formatNumberVE(totales.totalBs)}</TableCell>
            <TableCell />
            <TableCell className={num}>{formatUsd(totales.totalUsd)}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
