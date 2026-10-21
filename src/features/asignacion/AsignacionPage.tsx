import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronDown, Download, FileImage, FileSpreadsheet, FileText, Images, Loader2, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando, Vacio } from "@/components/Feedback";
import { ResumenCards } from "@/components/ResumenCards";
import { DepositosTable } from "@/components/DepositosTable";
import { FiltrosDepositos, useFiltrosDepositos } from "@/components/FiltrosDepositos";
import { BotonConMotivo, MOTIVO_CERRADA } from "@/components/BotonConMotivo";
import { getDb } from "@/db";
import { getAsignacion } from "@/db/repos/asignaciones";
import { getGerente, type Gerente } from "@/db/repos/gerentes";
import { loadCampanaData } from "@/db/queries/campanaData";
import { loadDuplicadosCampana } from "@/db/queries/duplicados";
import { buildGerenteWorkbook } from "@/export/campanaWorkbook";
import { buildGerentePdf } from "@/export/campanaPdf";
import { archivoExcel, archivoPdf } from "@/export/fileName";
import { precargarPdfMake, savePdf } from "@/export/savePdf";
import { saveWorkbook } from "@/export/saveWorkbook";
import { buildCampanaView, estadoGerente, filtrarDepositos, type DepositoCalculado } from "@/domain/campanaView";
import { todayIso } from "@/domain/dates";
import { mensajeEstadoCuenta, numeroWhatsApp, urlWhatsApp } from "@/domain/whatsapp";
import { EstadoGerenteBadge } from "@/components/EstadoGerenteBadge";
import { reportError } from "@/lib/reportError";
import { leerVolver } from "@/lib/volver";
import { GerenteFormDialog } from "@/features/gerentes/GerenteFormDialog";
import { EstadoCuentaDialog } from "./EstadoCuentaDialog";
import { getPlantillas } from "@/db/repos/plantillas";
import { DomainError } from "@/domain/errors";
import { useData } from "@/hooks/useData";
import { useAtajo } from "@/hooks/useAtajo";
import { useReceptorArchivos } from "@/lib/soltarArchivos";
import { receptorCampana, receptorCerrada, type EstadoLote } from "@/components/SoltarImagenes";

const SIN_DEPOSITOS: DepositoCalculado[] = [];

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
      // Con un depósito suyo duplicado no se exporta: los totales saldrían inflados.
      const duplicado = (await loadDuplicadosCampana(db, a.campanaId)).some((g) => g.some((dep) => dep.asignacionId === asignacionId));
      return { a, campana: d.campana, view, duplicado, resumen, r: filtrarDepositos(view.depositos, { gerenteId: a.gerenteId }) };
    },
    [asignacionId],
  );

  const navigate = useNavigate();
  // Abierta desde la ficha del gerente vuelve a ella; si no, a la campaña.
  const volver = leerVolver(useLocation().state);
  const [estadoCuenta, setEstadoCuenta] = useState(false);
  const [editarGerente, setEditarGerente] = useState<Gerente | null>(null);
  const [exportando, setExportando] = useState(false);
  const activa = data?.a.campanaEstado === "activa";
  const subirLote = () => data && navigate(`/campanas/${data.a.campanaId}/lote`, { state: { gerente: `a:${asignacionId}` } satisfies EstadoLote });
  useAtajo("n", () => navigate(`/asignaciones/${asignacionId}/depositos/nuevo`), { activo: activa });
  useAtajo("l", subirLote, { activo: activa });
  // Las imágenes soltadas aquí quedan para este gerente.
  useReceptorArchivos(
    !data
      ? { destino: () => "Cargando…", recibir: null }
      : activa
        ? receptorCampana(navigate, { id: data.a.campanaId, nombre: `${data.a.gerenteNombre} (${data.a.campanaNombre})`, asignacionId })
        : receptorCerrada(data.a.campanaNombre),
  );

  const filtros = useFiltrosDepositos(`asignacion-${asignacionId}`, data?.view.depositos ?? SIN_DEPOSITOS, data?.a.gerenteId);

  if (!data) return <Cargando error={error} />;
  const { a, campana, view, duplicado, resumen, r } = data;
  const cerrada = a.campanaEstado === "cerrada";
  const numero = numeroWhatsApp(a.gerenteTelefono);
  const hoy = todayIso();

  async function abrirWhatsApp() {
    if (!numero) return;
    const { asignado, pagado, restante, cantidad } = resumen;
    const plantillas = await getPlantillas(await getDb());
    const texto = mensajeEstadoCuenta(
      { gerenteNombre: a.gerenteNombre, campanaNombre: a.campanaNombre, fechaCorte: hoy, asignado, pagado, restante, cantidad },
      plantillas,
    );
    await openUrl(urlWhatsApp(numero, texto));
  }

  const archivo = `${a.gerenteNombre} ${a.campanaNombre}`;

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

  const exportarExcel = () => conExportando(() => saveWorkbook(buildGerenteWorkbook(campana, view, asignacionId), archivoExcel(archivo, hoy)), "Excel guardado");
  const exportarPdf = () =>
    conExportando(
      (avisar) => savePdf(buildGerentePdf(campana, view, asignacionId), archivoPdf(archivo, hoy), () => avisar("Generando PDF…")),
      "PDF guardado",
    );

  async function whatsapp() {
    try {
      if (numero) await abrirWhatsApp();
      else setEditarGerente(await getGerente(await getDb(), a.gerenteId));
    } catch (e) {
      reportError(e, "WhatsApp");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        migas={[{ to: "/campanas", label: "Campañas" }, { to: `/campanas/${a.campanaId}`, label: a.campanaNombre }]}
        back={volver ?? undefined}
        title={
          <span className="flex items-center gap-3">
            <Link to={`/gerentes/${a.gerenteId}`} className="hover:underline" title="Ver todas sus campañas">
              {a.gerenteNombre}
            </Link>
            <EstadoGerenteBadge estado={estadoGerente(resumen)} />
          </span>
        }
        subtitle={`Campaña ${a.campanaNombre}${a.gerenteTelefono ? ` · ${a.gerenteTelefono}` : ""}`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => void whatsapp()}
              title={numero ? "Abre WhatsApp con un resumen del saldo para enviárselo" : "Agrega el teléfono del gerente para escribirle por WhatsApp"}
            >
              <MessageCircle />
              {numero ? "Recordatorio por WhatsApp" : "Agregar teléfono…"}
            </Button>
            {/* Al abrir el menú se va cargando pdfmake, para que el PDF salga más rápido. */}
            <BotonConMotivo motivo={duplicado ? "Resuelve los depósitos duplicados de la campaña para exportar" : undefined}>
              <DropdownMenu onOpenChange={(abierto) => abierto && void precargarPdfMake().catch(() => {})}>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" disabled={exportando || duplicado} title={duplicado ? undefined : "Los depósitos y el saldo de este gerente"} />
                  }
                >
                  {exportando ? <Loader2 className="animate-spin" /> : <Download />}
                  {exportando ? "Exportando…" : "Exportar"}
                  <ChevronDown data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-auto min-w-48">
                  <DropdownMenuItem onClick={() => void exportarExcel()}>
                    <FileSpreadsheet />
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void exportarPdf()}>
                    <FileText />
                    PDF (.pdf)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </BotonConMotivo>
            <Button variant="outline" onClick={() => setEstadoCuenta(true)}>
              <FileImage />
              Estado de cuenta
            </Button>
            <BotonConMotivo motivo={cerrada ? MOTIVO_CERRADA : undefined}>
              <Button variant="outline" disabled={cerrada} title="L · también puedes soltar las imágenes en cualquier parte" onClick={subirLote}>
                <Images />
                Subir lote
              </Button>
            </BotonConMotivo>
            {cerrada ? (
              <BotonConMotivo motivo={MOTIVO_CERRADA}>
                <Button disabled>
                  <Plus />
                  Registrar depósito
                </Button>
              </BotonConMotivo>
            ) : (
              <Link to={`/asignaciones/${a.id}/depositos/nuevo`} title="N" className={buttonVariants()}>
                <Plus />
                Registrar depósito
              </Link>
            )}
          </>
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: solo lectura.</Aviso>}
      <ResumenCards resumen={resumen} />
      {filtros.hayDepositos && <FiltrosDepositos filtros={filtros} />}
      <DepositosTable
        filas={filtros.r.filas}
        mostrarGerente={false}
        saldoLabel="Saldo restante"
        totales={filtros.r}
        soloLectura={cerrada}
        volverLabel={a.gerenteNombre}
        clave={`asignacion-${a.id}`}
        filtrando={filtros.activos}
        vacio={
          filtros.hayDepositos ? (
            <Vacio texto="Ningún depósito coincide con la búsqueda o los filtros.">
              <Button variant="outline" onClick={filtros.limpiar}>
                Limpiar filtros
              </Button>
            </Vacio>
          ) : (
            <Vacio texto={`${a.gerenteNombre} todavía no tiene depósitos en esta campaña.`}>
              {!cerrada && (
                <>
                  <Link to={`/asignaciones/${a.id}/depositos/nuevo`} className={buttonVariants()}>
                    <Plus />
                    Registrar depósito
                  </Link>
                  <Button variant="outline" onClick={subirLote}>
                    <Images />
                    Subir lote de comprobantes
                  </Button>
                </>
              )}
            </Vacio>
          )
        }
      />
      <EstadoCuentaDialog
        open={estadoCuenta}
        onOpenChange={setEstadoCuenta}
        gerenteNombre={a.gerenteNombre}
        campana={campana}
        view={view}
        asignacionId={asignacionId}
        duplicado={duplicado}
        fechaCorte={hoy}
        resumen={resumen}
        filas={r.filas}
        numero={numero}
        onWhatsApp={abrirWhatsApp}
      />
      <GerenteFormDialog gerente={editarGerente} open={editarGerente !== null} onOpenChange={(o) => !o && setEditarGerente(null)} />
    </div>
  );
}
