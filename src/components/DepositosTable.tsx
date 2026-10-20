import { useMemo, useState, type ReactNode } from "react";
import Decimal from "decimal.js";
import { useLocation, useNavigate } from "react-router";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compareRecientePrimero, type FilaDeposito } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatNumberVE, formatTasa, formatUsd } from "@/domain/money";
import { getDb } from "@/db";
import { deleteDepositos } from "@/db/repos/depositos";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { avisarDepositosEliminados } from "@/lib/deshacer";
import { conVolver } from "@/lib/volver";
import { ordenar, type Columnas } from "@/lib/orden";
import { agruparPie, useColumnas } from "@/lib/columnas";
import { ColumnasMenu } from "./ColumnasMenu";
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
  /** Qué mostrar si no hay filas (por defecto, "No hay depósitos."). */
  vacio?: ReactNode;
  /** Nombre de esta pantalla en el botón de volver del depósito. */
  volverLabel: string;
};

type Ordenable = "fecha" | "gerente" | "banco" | "referencia" | "cuenta" | "montoBs" | "tasa" | "usd" | "saldo" | "observaciones";
type Col = Ordenable | "comprobante";
const TODAS: Col[] = ["fecha", "gerente", "banco", "referencia", "cuenta", "montoBs", "tasa", "usd", "saldo", "observaciones", "comprobante"];
const SIN_GERENTE = TODAS.filter((c) => c !== "gerente");
const CON_TOTAL: Col[] = ["montoBs", "usd"];
const NUMERICAS: Col[] = ["montoBs", "tasa", "usd", "saldo"];
const COLUMNAS: Columnas<FilaDeposito, Ordenable> = {
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

const num = "text-right tabular-nums";

function Celda({ col, d }: { col: Col; d: FilaDeposito }) {
  switch (col) {
    case "fecha":
      return <TableCell>{formatFecha(d.fecha)}</TableCell>;
    case "gerente":
      return <TableCell>{d.gerenteNombre}</TableCell>;
    case "banco":
      return <TableCell>{d.banco}</TableCell>;
    case "referencia":
      return <TableCell className="font-mono">{d.referencia}</TableCell>;
    case "cuenta":
      return <TableCell className="font-mono text-xs">{d.cuentaDestino}</TableCell>;
    case "montoBs":
      return <TableCell className={num}>{formatNumberVE(d.montoBs)}</TableCell>;
    case "tasa":
      return <TableCell className={num}>{formatTasa(d.tasaValor)}</TableCell>;
    case "usd":
      return <TableCell className={num}>{formatUsd(d.usd)}</TableCell>;
    case "saldo":
      return (
        <TableCell className={cn(num, new Decimal(d.saldoMostrado).isNegative() && "font-medium text-destructive")}>{formatUsd(d.saldoMostrado)}</TableCell>
      );
    case "observaciones":
      return (
        <TableCell className="max-w-48 truncate" title={d.observaciones ?? ""}>
          {d.observaciones}
        </TableCell>
      );
    case "comprobante":
      return <TableCell>{d.imagenPath ? <ComprobanteThumb path={d.imagenPath} /> : "—"}</TableCell>;
  }
}

export function DepositosTable({ filas, mostrarGerente, saldoLabel, totales, soloLectura = false, vacio, volverLabel }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { orden, alternar } = useOrden<Ordenable>();
  // Cada vista recuerda sus columnas: la de la campaña (con gerente) y la de un gerente.
  const columnas = useColumnas(mostrarGerente ? "depositos-campana" : "depositos-gerente", mostrarGerente ? TODAS : SIN_GERENTE);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [borrar, setBorrar] = useState<number[] | null>(null);
  // Sobre el orden base, para que los empates de cualquier columna (p. ej. la fecha) respeten el orden de registro.
  const ordenadas = useMemo(() => ordenar([...filas].sort(compareRecientePrimero), COLUMNAS, orden), [filas, orden]);
  // Solo cuentan los marcados que siguen visibles (al filtrar se pueden ocultar).
  const elegidos = filas.filter((d) => marcados.has(d.id)).map((d) => d.id);
  const todos = filas.length > 0 && elegidos.length === filas.length;

  if (filas.length === 0) return vacio ?? <Vacio texto="No hay depósitos." />;
  const etiquetas: Record<Col, string> = {
    fecha: "Fecha",
    gerente: "Gerente",
    banco: "Banco",
    referencia: "Referencia",
    cuenta: "Cuenta destino",
    montoBs: "Monto Bs",
    tasa: "Tasa",
    usd: "USD",
    saldo: saldoLabel,
    observaciones: "Observaciones",
    comprobante: "Comprobante",
  };
  const head = (col: Col) =>
    col === "comprobante" ? (
      <TableHead key={col}>{etiquetas[col]}</TableHead>
    ) : (
      <SortableHead key={col} col={col} orden={orden} onOrden={alternar} className={cn(NUMERICAS.includes(col) && "text-right")}>
        {etiquetas[col]}
      </SortableHead>
    );
  // En el pie se juntan las columnas sin total, incluidas la de selección y la de eliminar.
  const extra = soloLectura ? [] : (["accion"] as const);
  const pie = agruparPie<Col | "accion">([...extra, ...columnas.visibles, ...extra], CON_TOTAL);

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
      avisarDepositosEliminados(await deleteDepositos(await getDb(), ids));
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
      <div className="flex min-h-9 items-center gap-3">
        {!soloLectura && elegidos.length > 0 && (
          <div className="flex flex-1 items-center gap-3 rounded-md border bg-fila-hover px-3 py-1 text-sm">
            <span className="font-medium">{elegidos.length} seleccionado(s)</span>
            <Button size="sm" variant="destructive" onClick={() => (elegidos.length === 1 ? void eliminar(elegidos) : setBorrar(elegidos))}>
              <Trash2 />
              Eliminar seleccionados
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>
              Quitar selección
            </Button>
          </div>
        )}
        <div className="ml-auto">
          <ColumnasMenu
            estado={columnas.estado}
            etiquetas={etiquetas}
            onAlternar={columnas.alternar}
            onMover={columnas.mover}
            onRestablecer={columnas.restablecer}
          />
        </div>
      </div>
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
            {columnas.visibles.map(head)}
            {!soloLectura && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenadas.map((d) => (
            <TableRow
              key={d.id}
              className="cursor-pointer"
              data-state={marcados.has(d.id) ? "selected" : undefined}
              onClick={() =>
                navigate(`/depositos/${d.id}`, {
                  state: conVolver(location, volverLabel),
                })
              }
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
              {columnas.visibles.map((col) => (
                <Celda key={col} col={col} d={d} />
              ))}
              {!soloLectura && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button size="icon-sm" variant="ghost" title="Eliminar depósito" aria-label="Eliminar depósito" onClick={() => void eliminar([d.id])}>
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
              {pie.map((c, i) =>
                c.tipo === "total" ? (
                  <TableCell key={i} className={num}>
                    {c.col === "montoBs" ? formatNumberVE(totales.totalBs) : formatUsd(totales.totalUsd)}
                  </TableCell>
                ) : (
                  <TableCell key={i} colSpan={c.span} className="whitespace-nowrap">
                    {c.tipo === "etiqueta" && `Total (${totales.cantidad} depósitos)`}
                  </TableCell>
                ),
              )}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      <ConfirmDialog
        open={borrar !== null}
        onOpenChange={(o) => !o && setBorrar(null)}
        title={`Eliminar ${borrar?.length ?? 0} depósitos`}
        description={`Se eliminarán ${borrar?.length ?? 0} depósitos y los saldos se recalcularán. Podrás deshacerlo desde el aviso.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => (borrar ? eliminar(borrar) : undefined)}
      />
    </div>
  );
}
