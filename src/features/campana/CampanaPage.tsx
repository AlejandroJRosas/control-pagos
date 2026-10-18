import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { FileSpreadsheet, FileUp, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { EstadoBadge } from "@/components/EstadoBadge";
import { ResumenCards } from "@/components/ResumenCards";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { loadCampanaData } from "@/db/queries/campanaData";
import { setEstadoCampana } from "@/db/repos/campanas";
import { deleteAsignacion } from "@/db/repos/asignaciones";
import { buildCampanaView, type GerenteResumen } from "@/domain/campanaView";
import { formatPeriodo, todayIso } from "@/domain/dates";
import { buildCampanaWorkbook } from "@/export/campanaWorkbook";
import { archivoExcel } from "@/export/fileName";
import { saveWorkbook } from "@/export/saveWorkbook";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { setCampanaActual } from "@/lib/campanaActual";
import { CampanaFormDialog } from "@/features/campanas/CampanaFormDialog";
import { AsignacionFormDialog, type AsignacionEditable } from "./AsignacionFormDialog";
import { PorGerenteTab } from "./PorGerenteTab";
import { TodosDepositosTab } from "./TodosDepositosTab";

export function CampanaPage() {
  const campanaId = Number(useParams().campanaId);
  const { data, error } = useData(
    async (db) => {
      const d = await loadCampanaData(db, campanaId);
      return { ...d, view: buildCampanaView(d.asignaciones, d.depositos) };
    },
    [campanaId],
  );
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "gerentes" ? "gerentes" : "depositos";
  const [editar, setEditar] = useState(false);
  const [asig, setAsig] = useState<{ open: boolean; asignacion: AsignacionEditable | null }>({ open: false, asignacion: null });
  const [confirmEstado, setConfirmEstado] = useState(false);
  const [quitar, setQuitar] = useState<GerenteResumen | null>(null);

  const existe = data !== undefined;
  useEffect(() => {
    if (existe) setCampanaActual(campanaId);
  }, [existe, campanaId]);

  if (!data) return <Cargando error={error} />;
  const { campana, view, asignaciones } = data;
  const cerrada = campana.estado === "cerrada";

  async function cambiarEstado() {
    try {
      await setEstadoCampana(await getDb(), campanaId, cerrada ? "activa" : "cerrada");
      toast.success(cerrada ? "Campaña reabierta" : "Campaña cerrada");
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setConfirmEstado(false);
    }
  }

  async function quitarGerente(g: GerenteResumen) {
    try {
      await deleteAsignacion(await getDb(), g.asignacionId);
      toast.success(`${g.gerenteNombre} quitado de la campaña`);
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setQuitar(null);
    }
  }

  async function exportar() {
    try {
      if (await saveWorkbook(buildCampanaWorkbook(campana, view), archivoExcel(campana.nombre, todayIso()))) toast.success("Excel guardado");
    } catch (e) {
      reportError(e, "Exportar");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: "/campanas", label: "Campañas" }}
        title={
          <span className="flex items-center gap-3">
            {campana.nombre}
            <EstadoBadge estado={campana.estado} />
          </span>
        }
        subtitle={formatPeriodo(campana.fechaInicio, campana.fechaFin)}
        actions={
          <>
            <Button variant="outline" onClick={exportar}>
              <FileSpreadsheet />
              Exportar a Excel
            </Button>
            <Button variant="outline" disabled={cerrada} onClick={() => setEditar(true)}>
              Editar
            </Button>
            <Button variant="outline" onClick={() => setConfirmEstado(true)}>
              {cerrada ? "Reabrir" : "Cerrar campaña"}
            </Button>
            <Button variant="outline" disabled={cerrada} onClick={() => setAsig({ open: true, asignacion: null })}>
              <UserPlus />
              Agregar gerente
            </Button>
            {cerrada ? (
              <>
                <Button variant="outline" disabled>
                  <FileUp />
                  Importar Excel
                </Button>
                <Button disabled>
                  <Plus />
                  Registrar depósito
                </Button>
              </>
            ) : (
              <>
                <Link to={`/campanas/${campanaId}/importar`} className={buttonVariants({ variant: "outline" })}>
                  <FileUp />
                  Importar Excel
                </Link>
                <Link to={`/campanas/${campanaId}/depositos/nuevo`} className={buttonVariants()}>
                  <Plus />
                  Registrar depósito
                </Link>
              </>
            )}
          </>
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: solo lectura. Reábrela para hacer cambios.</Aviso>}
      <ResumenCards resumen={view.total} etiquetaAsignado="Saldo general" />
      <Tabs value={tab} onValueChange={(v) => setParams(v === "gerentes" ? { tab: "gerentes" } : {}, { replace: true })}>
        <TabsList>
          <TabsTrigger value="depositos">Todos los depósitos ({view.depositos.length})</TabsTrigger>
          <TabsTrigger value="gerentes">Por gerente ({view.gerentes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="gerentes">
          <PorGerenteTab
            gerentes={view.gerentes}
            cerrada={cerrada}
            onEditarSaldo={(g) => setAsig({ open: true, asignacion: { id: g.asignacionId, gerenteNombre: g.gerenteNombre, saldoUsd: g.asignado } })}
            onQuitar={setQuitar}
          />
        </TabsContent>
        <TabsContent value="depositos">
          <TodosDepositosTab campanaId={campanaId} view={view} cerrada={cerrada} />
        </TabsContent>
      </Tabs>

      <CampanaFormDialog campana={campana} open={editar} onOpenChange={setEditar} />
      <AsignacionFormDialog
        campanaId={campanaId}
        gerentesEnCampana={asignaciones.map((a) => a.gerenteId)}
        asignacion={asig.asignacion}
        open={asig.open}
        onOpenChange={(open) => setAsig((s) => ({ ...s, open }))}
      />
      <ConfirmDialog
        open={confirmEstado}
        onOpenChange={setConfirmEstado}
        title={cerrada ? "Reabrir campaña" : "Cerrar campaña"}
        description={
          cerrada ? "La campaña volverá a aceptar cambios." : "La campaña quedará de solo lectura: no se podrán registrar, editar ni eliminar depósitos."
        }
        confirmLabel={cerrada ? "Reabrir" : "Cerrar"}
        onConfirm={cambiarEstado}
      />
      <ConfirmDialog
        open={quitar !== null}
        onOpenChange={(o) => !o && setQuitar(null)}
        title="Quitar gerente"
        description={quitar ? `Se quitará a ${quitar.gerenteNombre} de esta campaña.` : ""}
        confirmLabel="Quitar"
        destructive
        onConfirm={() => (quitar ? quitarGerente(quitar) : undefined)}
      />
    </div>
  );
}
