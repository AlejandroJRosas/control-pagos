import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ChevronDown, CopyX, Download, FileSpreadsheet, FileText, FileUp, Images, ListChecks, Loader2, Lock, LockOpen, Pencil, Plus, MessageCircle, Settings2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { EstadoBadge } from "@/components/EstadoBadge";
import { ResumenCards } from "@/components/ResumenCards";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EnvioLoteDialog } from "./EnvioLoteDialog";
import { getDb } from "@/db";
import { loadCampanaData } from "@/db/queries/campanaData";
import { setEstadoCampana } from "@/db/repos/campanas";
import { deleteAsignacion } from "@/db/repos/asignaciones";
import { contarPendientesDepositos } from "@/db/repos/cola";
import { loadDuplicadosCampana } from "@/db/queries/duplicados";
import { buildCampanaView, type GerenteResumen } from "@/domain/campanaView";
import { formatPeriodo, todayIso } from "@/domain/dates";
import { buildCampanaWorkbook } from "@/export/campanaWorkbook";
import { buildCampanaPdf } from "@/export/campanaPdf";
import { archivoExcel, archivoPdf } from "@/export/fileName";
import { precargarPdfMake, savePdf } from "@/export/savePdf";
import { saveWorkbook } from "@/export/saveWorkbook";
import { invalidate, useData } from "@/hooks/useData";
import { useAtajo } from "@/hooks/useAtajo";
import { reportError } from "@/lib/reportError";
import { setCampanaActual } from "@/lib/campanaActual";
import { CampanaFormDialog } from "@/features/campanas/CampanaFormDialog";
import { AsignacionFormDialog, type AsignacionEditable } from "./AsignacionFormDialog";
import { AgregarGerentesDialog } from "./AgregarGerentesDialog";
import { EliminarCampanaDialog } from "./EliminarCampanaDialog";
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
  const { data: pendientes } = useData((db) => contarPendientesDepositos(db, campanaId), [campanaId]);
  const { data: duplicados } = useData(async (db) => (await loadDuplicadosCampana(db, campanaId)).length, [campanaId]);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "gerentes" ? "gerentes" : "depositos";
  const [editar, setEditar] = useState(false);
  const navigate = useNavigate();
  const [agregar, setAgregar] = useState(false);
  const [asig, setAsig] = useState<AsignacionEditable | null>(null);
  const [confirmEstado, setConfirmEstado] = useState(false);
  const [quitar, setQuitar] = useState<GerenteResumen | null>(null);
  const [eliminar, setEliminar] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [envio, setEnvio] = useState(false);

  const cerradaAtajo = data?.campana.estado !== "activa";
  useAtajo("n", () => navigate(`/campanas/${campanaId}/depositos/nuevo`), { activo: !cerradaAtajo });

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

  /** Mientras se exporta, el menú queda deshabilitado: generar el PDF tarda unos segundos la primera vez. */
  async function conExportando(guardar: (avisar: (texto: string) => void) => Promise<boolean>, mensaje: string) {
    setExportando(true);
    let aviso: string | number | undefined;
    try {
      const guardado = await guardar((texto) => (aviso = toast.loading(texto)));
      if (guardado) toast.success(mensaje, { id: aviso });
    } catch (e) {
      if (aviso !== undefined) toast.dismiss(aviso);
      reportError(e, "Exportar");
    } finally {
      setExportando(false);
    }
  }

  // Con duplicados sin resolver (o mientras se cuentan) no se exporta: los totales saldrían inflados.
  const exportable = duplicados === 0;
  const exportar = () => conExportando(() => saveWorkbook(buildCampanaWorkbook(campana, view), archivoExcel(campana.nombre, todayIso())), "Excel guardado");
  const exportarPdf = () =>
    conExportando(
      (avisar) => savePdf(buildCampanaPdf(campana, view), archivoPdf(campana.nombre, todayIso()), () => avisar("Generando PDF…")),
      "PDF guardado",
    );

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
            {!!pendientes && (
              <Link to={`/campanas/${campanaId}/revision`} className={buttonVariants({ variant: "secondary" })}>
                <ListChecks />
                Revisar pendientes ({pendientes})
              </Link>
            )}
            {/* Al abrir el menú se va cargando pdfmake, para que el PDF salga más rápido. */}
            <DropdownMenu onOpenChange={(abierto) => abierto && void precargarPdfMake().catch(() => {})}>
              <DropdownMenuTrigger
                render={<Button variant="outline" disabled={exportando || !exportable} title={duplicados ? "Resuelve los depósitos duplicados para exportar" : undefined} />}
              >
                {exportando ? <Loader2 className="animate-spin" /> : <Download />}
                {exportando ? "Exportando…" : "Exportar"}
                <ChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-48">
                <DropdownMenuItem onClick={() => void exportar()}>
                  <FileSpreadsheet />
                  Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void exportarPdf()}>
                  <FileText />
                  PDF (.pdf)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                <Settings2 />
                Campaña
                <ChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-48">
                <DropdownMenuItem disabled={view.gerentes.length === 0} onClick={() => setEnvio(true)}>
                  <MessageCircle />
                  Enviar estados de cuenta
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={cerrada} onClick={() => setAgregar(true)}>
                  <UserPlus />
                  Agregar gerentes
                </DropdownMenuItem>
                <DropdownMenuItem disabled={cerrada} onClick={() => setEditar(true)}>
                  <Pencil />
                  Editar datos
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmEstado(true)}>
                  {cerrada ? <LockOpen /> : <Lock />}
                  {cerrada ? "Reabrir campaña" : "Cerrar campaña"}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" disabled={cerrada} onClick={() => setEliminar(true)}>
                  <Trash2 />
                  Eliminar campaña
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex">
              <Button disabled={cerrada} title="N" className="rounded-r-none" onClick={() => navigate(`/campanas/${campanaId}/depositos/nuevo`)}>
                <Plus />
                Registrar depósito
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={cerrada}
                  render={<Button size="icon" aria-label="Más formas de cargar depósitos" className="rounded-l-none border-l border-l-primary-foreground/25" />}
                >
                  <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-48">
                  <DropdownMenuItem onClick={() => navigate(`/campanas/${campanaId}/lote`)}>
                    <Images />
                    Subir lote de comprobantes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate(`/campanas/${campanaId}/importar`)}>
                    <FileUp />
                    Importar Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: solo lectura. Reábrela para hacer cambios.</Aviso>}
      {!!duplicados && (
        <Aviso tono="warning">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              Hay {duplicados === 1 ? "1 grupo" : `${duplicados} grupos`} de depósitos duplicados (mismo banco y referencia). Deja uno solo en cada grupo para poder
              exportar.
            </span>
            <Link to={`/campanas/${campanaId}/duplicados`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CopyX />
              Revisar duplicados
            </Link>
          </div>
        </Aviso>
      )}
      <ResumenCards resumen={view.total} etiquetaAsignado="Saldo general" />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setParams(
            (p) => {
              const n = new URLSearchParams(p);
              if (v === "gerentes") n.set("tab", "gerentes");
              else n.delete("tab");
              return n;
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          <TabsTrigger value="depositos">Todos los depósitos ({view.depositos.length})</TabsTrigger>
          <TabsTrigger value="gerentes">Por gerente ({view.gerentes.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="gerentes">
          <PorGerenteTab
            campanaId={campanaId}
            gerentes={view.gerentes}
            cerrada={cerrada}
            onEditarSaldo={(g) => setAsig({ id: g.asignacionId, gerenteNombre: g.gerenteNombre, saldoUsd: g.asignado })}
            onQuitar={setQuitar}
            onAgregar={() => setAgregar(true)}
          />
        </TabsContent>
        <TabsContent value="depositos">
          <TodosDepositosTab campanaId={campanaId} campanaNombre={campana.nombre} view={view} cerrada={cerrada} />
        </TabsContent>
      </Tabs>

      <CampanaFormDialog campana={campana} open={editar} onOpenChange={setEditar} />
      <EliminarCampanaDialog campana={campana} open={eliminar} onOpenChange={setEliminar} />
      <AgregarGerentesDialog
        campanaId={campanaId}
        gerentesEnCampana={asignaciones.map((a) => a.gerenteId)}
        open={agregar}
        onOpenChange={setAgregar}
      />
      <AsignacionFormDialog asignacion={asig} onOpenChange={(open) => !open && setAsig(null)} />
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
      <EnvioLoteDialog campanaId={campanaId} open={envio} onOpenChange={setEnvio} />
    </div>
  );
}
