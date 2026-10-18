import { Link, useParams } from "react-router";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { ResumenCards } from "@/components/ResumenCards";
import { DepositosTable } from "@/components/DepositosTable";
import { getAsignacion } from "@/db/repos/asignaciones";
import { loadCampanaData } from "@/db/queries/campanaData";
import { buildCampanaView, filtrarDepositos } from "@/domain/campanaView";
import { DomainError } from "@/domain/errors";
import { useData } from "@/hooks/useData";

export function AsignacionPage() {
  const asignacionId = Number(useParams().asignacionId);
  const { data, error } = useData(
    async (db) => {
      const a = await getAsignacion(db, asignacionId);
      if (!a) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
      const d = await loadCampanaData(db, a.campanaId);
      const view = buildCampanaView(d.asignaciones, d.depositos);
      const resumen = view.gerentes.find((g) => g.asignacionId === asignacionId);
      if (!resumen) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
      return { a, resumen, r: filtrarDepositos(view.depositos, { gerenteId: a.gerenteId }) };
    },
    [asignacionId],
  );

  if (!data) return <Cargando error={error} />;
  const { a, resumen, r } = data;
  const cerrada = a.campanaEstado === "cerrada";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: `/campanas/${a.campanaId}`, label: a.campanaNombre }}
        title={a.gerenteNombre}
        subtitle={`Campaña ${a.campanaNombre}`}
        actions={
          cerrada ? (
            <Button disabled>
              <Plus />
              Registrar depósito
            </Button>
          ) : (
            <Link to={`/asignaciones/${a.id}/depositos/nuevo`} className={buttonVariants()}>
              <Plus />
              Registrar depósito
            </Link>
          )
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: solo lectura.</Aviso>}
      <ResumenCards resumen={resumen} />
      <DepositosTable filas={r.filas} mostrarGerente={false} saldoLabel="Saldo restante" totales={r} />
    </div>
  );
}
