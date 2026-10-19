import { useMemo } from "react";
import Decimal from "decimal.js";
import { Link, useLocation, useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { AvanceBar, ResumenCards } from "@/components/ResumenCards";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { loadResumenGeneral } from "@/db/queries/resumenGeneral";
import { buildResumenGeneral, type FilaCampana } from "@/domain/resumenGeneral";
import { formatFecha, todayIso } from "@/domain/dates";
import { formatPct, formatUsd } from "@/domain/money";
import { useData } from "@/hooks/useData";
import { ordenar, type Columnas } from "@/lib/orden";
import { conVolver } from "@/lib/volver";
import { cn } from "@/lib/utils";

type Key = "campanaNombre" | "gerentes" | "asignado" | "pagado" | "restante" | "pct" | "semanaUsd" | "enCola" | "ultimaFecha";
const COLS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "campanaNombre", label: "Campaña" },
  { key: "gerentes", label: "Gerentes", numeric: true },
  { key: "asignado", label: "Asignado", numeric: true },
  { key: "pagado", label: "Pagado", numeric: true },
  { key: "restante", label: "Restante", numeric: true },
  { key: "pct", label: "% avance", numeric: true },
  { key: "semanaUsd", label: "Últimos 7 días", numeric: true },
  { key: "enCola", label: "En cola", numeric: true },
  { key: "ultimaFecha", label: "Último depósito" },
];
const COLUMNAS: Columnas<FilaCampana, Key> = {
  campanaNombre: { tipo: "texto", valor: (c) => c.campanaNombre },
  gerentes: { tipo: "numero", valor: (c) => c.gerentes },
  asignado: { tipo: "decimal", valor: (c) => c.asignado },
  pagado: { tipo: "decimal", valor: (c) => c.pagado },
  restante: { tipo: "decimal", valor: (c) => c.restante },
  pct: { tipo: "numero", valor: (c) => c.pct },
  semanaUsd: { tipo: "decimal", valor: (c) => c.semanaUsd },
  enCola: { tipo: "numero", valor: (c) => c.enCola },
  ultimaFecha: { tipo: "texto", valor: (c) => c.ultimaFecha },
};

const MAX_DEUDORES = 10;

/** Todas las campañas activas de un vistazo: total, avance por campaña y quién debe más. */
export function ResumenPage() {
  const hoy = todayIso();
  const { data, error } = useData(async (db) => buildResumenGeneral(await loadResumenGeneral(db), hoy), [hoy]);
  const navigate = useNavigate();
  const location = useLocation();
  // Sin orden elegido quedan las campañas más recientes primero.
  const { orden, alternar } = useOrden<Key>();
  const filas = useMemo(() => ordenar(data?.campanas ?? [], COLUMNAS, orden), [data, orden]);

  if (!data) return <Cargando error={error} />;
  const enCola = data.campanas.reduce((n, c) => n + c.enCola, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Resumen" subtitle={`${data.campanas.length} campaña(s) activa(s)`} />
      {data.campanas.length === 0 ? (
        <Vacio texto="No hay campañas activas.">
          <Link to="/campanas" className="text-sm underline">
            Ver todas las campañas
          </Link>
        </Vacio>
      ) : (
        <>
          <ResumenCards resumen={data.total} etiquetaAsignado="Asignado en total" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="gap-1 py-4">
              <CardHeader className="px-4">
                <CardDescription>Depositado en los últimos 7 días</CardDescription>
                <CardTitle className="text-xl tabular-nums">{formatUsd(data.semana.usd)}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground">
                {data.semana.cantidad} depósito(s) desde el {formatFecha(data.semana.desde)}
              </CardContent>
            </Card>
            <Card className="gap-1 py-4">
              <CardHeader className="px-4">
                <CardDescription>Comprobantes por revisar</CardDescription>
                <CardTitle className="text-xl tabular-nums">{enCola}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 text-xs text-muted-foreground">
                {enCola > 0 ? "En la cola de lote; todavía no cuentan en los saldos" : "La cola de lote está vacía"}
              </CardContent>
            </Card>
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Campañas activas</h2>
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
                  <TableRow key={c.campanaId} className="cursor-pointer" onClick={() => navigate(`/campanas/${c.campanaId}`)}>
                    <TableCell className="font-medium">{c.campanaNombre}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.gerentes}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(c.asignado)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(c.pagado)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", new Decimal(c.restante).isNegative() && "text-destructive")}>
                      {formatUsd(c.restante)}
                    </TableCell>
                    <TableCell className="w-36">
                      <div className="flex items-center gap-2">
                        <AvanceBar pct={c.pct} />
                        <span className="w-14 shrink-0 text-right tabular-nums">{formatPct(c.pct)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.semanaCantidad > 0 ? formatUsd(c.semanaUsd) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.enCola > 0 ? (
                        <Link to={`/campanas/${c.campanaId}/revision`} onClick={(e) => e.stopPropagation()}>
                          <Badge variant="secondary">{c.enCola}</Badge>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{c.ultimaFecha ? formatFecha(c.ultimaFecha) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Gerentes con más saldo pendiente</h2>
            {data.deudores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nadie tiene saldo pendiente en las campañas activas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gerente</TableHead>
                    <TableHead className="text-right">Campañas con saldo</TableHead>
                    <TableHead className="text-right">Debe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.deudores.slice(0, MAX_DEUDORES).map((g) => (
                    <TableRow
                      key={g.gerenteId}
                      className="cursor-pointer"
                      onClick={() => navigate(`/gerentes/${g.gerenteId}`, { state: conVolver(location, "Resumen") })}
                    >
                      <TableCell className="font-medium">{g.gerenteNombre}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.campanas}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatUsd(g.debe)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {data.deudores.length > MAX_DEUDORES && (
              <p className="text-xs text-muted-foreground">
                Se muestran {MAX_DEUDORES} de {data.deudores.length} gerentes con saldo pendiente.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
