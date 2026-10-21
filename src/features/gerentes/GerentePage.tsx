import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { useLocation, useNavigate, useParams } from "react-router";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { ResumenCards } from "@/components/ResumenCards";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { EtiquetaChip } from "@/components/EtiquetaChip";
import { EstadoGerenteBadge, ORDEN_ESTADOS } from "@/components/EstadoGerenteBadge";
import { getDb } from "@/db";
import { setGerenteActivo } from "@/db/repos/gerentes";
import { loadGerenteData, type CampanaDelGerente } from "@/db/queries/gerenteData";
import { buildCampanaView, estadoGerente, type EstadoGerente, type GerenteResumen } from "@/domain/campanaView";
import { formatFecha, todayIso } from "@/domain/dates";
import { proximoCumple, textoFaltan } from "@/domain/cumpleanos";
import { formatPct, formatUsd } from "@/domain/money";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { ordenar, type Columnas } from "@/lib/orden";
import { conVolver, leerVolver } from "@/lib/volver";
import { cn } from "@/lib/utils";
import { GerenteFormDialog } from "./GerenteFormDialog";

type Fila = CampanaDelGerente & GerenteResumen & { estado: EstadoGerente };
type Key = "campanaNombre" | "estado" | "asignado" | "pagado" | "restante" | "pct" | "cantidad" | "ultimaFecha";
const COLS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "campanaNombre", label: "Campaña" },
  { key: "estado", label: "Estado" },
  { key: "asignado", label: "Asignado", numeric: true },
  { key: "pagado", label: "Pagado", numeric: true },
  { key: "restante", label: "Restante", numeric: true },
  { key: "pct", label: "% avance", numeric: true },
  { key: "cantidad", label: "Depósitos", numeric: true },
  { key: "ultimaFecha", label: "Último depósito" },
];
const COLUMNAS: Columnas<Fila, Key> = {
  campanaNombre: { tipo: "texto", valor: (c) => c.campanaNombre },
  estado: { tipo: "numero", valor: (c) => ORDEN_ESTADOS.indexOf(c.estado) },
  asignado: { tipo: "decimal", valor: (c) => c.asignado },
  pagado: { tipo: "decimal", valor: (c) => c.pagado },
  restante: { tipo: "decimal", valor: (c) => c.restante },
  pct: { tipo: "numero", valor: (c) => c.pct },
  cantidad: { tipo: "numero", valor: (c) => c.cantidad },
  ultimaFecha: { tipo: "texto", valor: (c) => c.ultimaFecha },
};

export function GerentePage() {
  const gerenteId = Number(useParams().gerenteId);
  const { data, error } = useData(
    async (db) => {
      const d = await loadGerenteData(db, gerenteId);
      const view = buildCampanaView(d.asignaciones, d.depositos);
      const porAsignacion = new Map(view.gerentes.map((g) => [g.asignacionId, g]));
      const campanas = d.campanas.map((c) => {
        const r = porAsignacion.get(c.asignacionId) as GerenteResumen;
        return { ...c, ...r, estado: estadoGerente(r) };
      });
      return { gerente: d.gerente, etiquetas: d.etiquetas, total: view.total, campanas };
    },
    [gerenteId],
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [editar, setEditar] = useState(false);
  // Sin orden elegido quedan las campañas más recientes primero.
  const { orden, alternar } = useOrden<Key>();
  const filas = useMemo(() => ordenar(data?.campanas ?? [], COLUMNAS, orden), [data, orden]);

  if (!data) return <Cargando error={error} />;
  const { gerente: g, total } = data;
  const cumple = g.nacimiento ? proximoCumple(g.nacimiento, todayIso()) : null;

  async function toggleActivo() {
    try {
      await setGerenteActivo(await getDb(), g.id, !g.activo);
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={leerVolver(location.state) ?? { to: "/gerentes", label: "Gerentes" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {g.nombre}
            {g.activo ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
            {data.etiquetas.map((e) => (
              <EtiquetaChip key={e.id} nombre={e.nombre} color={e.color} />
            ))}
          </span>
        }
        subtitle={[
          g.telefono ?? "Sin teléfono",
          `${data.campanas.length} campaña(s)`,
          ...(cumple ? [`Cumple ${cumple.edad} años ${cumple.dias <= 1 ? textoFaltan(cumple.dias) : `el ${formatFecha(cumple.fecha)}`}`] : []),
        ].join(" · ")}
        actions={
          <>
            <Button variant="ghost" onClick={() => void toggleActivo()}>
              {g.activo ? "Desactivar" : "Activar"}
            </Button>
            <Button variant="outline" onClick={() => setEditar(true)}>
              <Pencil />
              Editar
            </Button>
          </>
        }
      />
      {data.campanas.length === 0 ? (
        <Vacio texto={`${g.nombre} todavía no está en ninguna campaña.`} />
      ) : (
        <>
          <ResumenCards resumen={total} etiquetaAsignado="Asignado en total" />
          <Table>
            <TableHeader>
              <TableRow>
                {COLS.map((c) => (
                  <SortableHead key={c.key} col={c.key} orden={orden} onOrden={alternar} className={cn(c.numeric && "text-right")}>
                    {c.label}
                  </SortableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((c) => (
                <TableRow
                  key={c.asignacionId}
                  className="cursor-pointer"
                  onClick={() => navigate(`/asignaciones/${c.asignacionId}`, { state: conVolver(location, g.nombre) })}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {c.campanaNombre}
                      {c.campanaEstado === "cerrada" && <Badge variant="secondary">Cerrada</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <EstadoGerenteBadge estado={c.estado} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(c.asignado)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(c.pagado)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", new Decimal(c.restante).isNegative() && "text-destructive")}>
                    {formatUsd(c.restante)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPct(c.pct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.cantidad}</TableCell>
                  <TableCell>{c.ultimaFecha ? formatFecha(c.ultimaFecha) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <GerenteFormDialog gerente={g} open={editar} onOpenChange={setEditar} />
    </div>
  );
}
