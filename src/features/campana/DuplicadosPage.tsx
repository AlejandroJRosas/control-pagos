import { Link, useLocation, useParams } from "react-router";
import { Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando, Vacio } from "@/components/Feedback";
import { ComprobanteThumb } from "@/components/ComprobanteThumb";
import { getDb } from "@/db";
import { getCampana } from "@/db/repos/campanas";
import { deleteDepositos } from "@/db/repos/depositos";
import { loadDuplicadosCampana, type DepositoDuplicado } from "@/db/queries/duplicados";
import { formatFecha } from "@/domain/dates";
import { formatBs, formatUsd, toUsd } from "@/domain/money";
import { DomainError } from "@/domain/errors";
import { invalidate, useData } from "@/hooks/useData";
import { avisarDepositosEliminados } from "@/lib/deshacer";
import { reportError } from "@/lib/reportError";
import { conVolver } from "@/lib/volver";
import { cn } from "@/lib/utils";

/** Grupos de depósitos con el mismo banco y referencia: se elige cuál queda y se eliminan los demás (con Deshacer). */
export function DuplicadosPage() {
  const campanaId = Number(useParams().campanaId);
  const location = useLocation();
  const { data, error } = useData(
    async (db) => {
      const campana = await getCampana(db, campanaId);
      if (!campana) throw new DomainError("NO_ENCONTRADO", "La campaña no existe");
      return { campana, grupos: await loadDuplicadosCampana(db, campanaId) };
    },
    [campanaId],
  );
  if (!data) return <Cargando error={error} />;
  const { campana, grupos } = data;

  async function quedarse(grupo: DepositoDuplicado[], elegido: DepositoDuplicado) {
    try {
      const otros = grupo.filter((d) => d.id !== elegido.id).map((d) => d.id);
      avisarDepositosEliminados(await deleteDepositos(await getDb(), otros));
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: `/campanas/${campanaId}`, label: campana.nombre }}
        title="Depósitos duplicados"
        subtitle="Mismo banco y referencia: deja uno solo por grupo. Mientras haya duplicados no se puede exportar la campaña."
      />
      {grupos.length === 0 ? (
        <Vacio texto="No hay depósitos duplicados en esta campaña.">
          <Link to={`/campanas/${campanaId}`} className={buttonVariants({ variant: "outline" })}>
            Volver a la campaña
          </Link>
        </Vacio>
      ) : (
        grupos.map((g) => {
          const cerrados = g.filter((d) => d.campanaEstado === "cerrada");
          return (
            <Card key={g[0].id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {g[0].banco} · Ref. <span className="font-mono">{g[0].referencia}</span>
                  <span className="ml-2 font-normal text-muted-foreground">({g.length} depósitos)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cerrados.length > 0 && (
                  <Aviso tono="warning">
                    Hay depósitos en una campaña cerrada ({[...new Set(cerrados.map((d) => d.campanaNombre))].join(", ")}): solo se puede quedar con uno de ellos, o
                    reabrir esa campaña.
                  </Aviso>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Comprobante</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Gerente</TableHead>
                      <TableHead>Campaña</TableHead>
                      <TableHead className="text-right">Monto Bs</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead>Cuenta destino</TableHead>
                      <TableHead>Observaciones</TableHead>
                      <TableHead>Registrado</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.map((d) => {
                      // Se eliminan los demás: si alguno de ellos está en una campaña cerrada, no se puede.
                      const bloqueado = g.some((o) => o.id !== d.id && o.campanaEstado === "cerrada");
                      return (
                        <TableRow key={d.id}>
                          <TableCell>{d.imagenPath ? <ComprobanteThumb path={d.imagenPath} /> : "—"}</TableCell>
                          <TableCell className="tabular-nums">{formatFecha(d.fecha)}</TableCell>
                          <TableCell>{d.gerenteNombre}</TableCell>
                          <TableCell className={cn(d.campanaId !== campanaId && "font-medium text-amber-700 dark:text-amber-400")}>{d.campanaNombre}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBs(d.montoBs)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatUsd(toUsd(d.montoBs, d.tasaValor))}</TableCell>
                          <TableCell className="font-mono text-xs">{d.cuentaDestino}</TableCell>
                          <TableCell className="max-w-48 truncate" title={d.observaciones ?? undefined}>
                            {d.observaciones || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground tabular-nums">{new Date(d.creadoEn).toLocaleString("es-VE")}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Link
                                to={`/depositos/${d.id}`}
                                state={conVolver(location, "Depósitos duplicados")}
                                className={buttonVariants({ variant: "ghost", size: "sm" })}
                              >
                                Ver
                              </Link>
                              <Button size="sm" variant="outline" disabled={bloqueado} onClick={() => void quedarse(g, d)}>
                                <Check />
                                Quedarse con este
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
