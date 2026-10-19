import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvanceBar } from "@/components/ResumenCards";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { EstadoBadge } from "@/components/EstadoBadge";
import { listCampanas } from "@/db/repos/campanas";
import { loadCampanaData } from "@/db/queries/campanaData";
import { buildCampanaView } from "@/domain/campanaView";
import { formatPeriodo } from "@/domain/dates";
import { formatPct, formatUsd } from "@/domain/money";
import { useData } from "@/hooks/useData";
import { useAtajo } from "@/hooks/useAtajo";
import { cn } from "@/lib/utils";
import { CampanaFormDialog } from "./CampanaFormDialog";

export function CampanasPage() {
  const navigate = useNavigate();
  const [nueva, setNueva] = useState(false);
  useAtajo("n", () => setNueva(true));
  const { data, error } = useData(async (db) => {
    const campanas = await listCampanas(db);
    return Promise.all(
      campanas.map(async (campana) => {
        const d = await loadCampanaData(db, campana.id);
        return { campana, total: buildCampanaView(d.asignaciones, d.depositos).total, gerentes: d.asignaciones.length };
      }),
    );
  }, []);

  return (
    <div>
      <PageHeader
        title="Campañas"
        actions={
          <Button title="N" onClick={() => setNueva(true)}>
            <Plus />
            Nueva campaña
          </Button>
        }
      />
      {!data ? (
        <Cargando error={error} />
      ) : data.length === 0 ? (
        <Vacio texto="Todavía no hay campañas. Crea la primera.">
          <Button onClick={() => setNueva(true)}>
            <Plus />
            Nueva campaña
          </Button>
        </Vacio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map(({ campana, total, gerentes }) => (
            <Link key={campana.id} to={`/campanas/${campana.id}`}>
              <Card className={cn("transition-colors hover:ring-primary-intenso", campana.estado === "cerrada" && "bg-muted/40")}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{campana.nombre}</CardTitle>
                    <EstadoBadge estado={campana.estado} />
                  </div>
                  <CardDescription>
                    {formatPeriodo(campana.fechaInicio, campana.fechaFin)} · {gerentes} gerente(s)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="tabular-nums">
                      {formatUsd(total.pagado)} de {formatUsd(total.asignado)}
                    </span>
                    <span className={cn("font-medium tabular-nums", total.pct >= 100 && "text-emerald-700 dark:text-emerald-400")}>{formatPct(total.pct)}</span>
                  </div>
                  <AvanceBar pct={total.pct} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <CampanaFormDialog campana={null} open={nueva} onOpenChange={setNueva} onCreated={(id) => navigate(`/campanas/${id}`)} />
    </div>
  );
}
