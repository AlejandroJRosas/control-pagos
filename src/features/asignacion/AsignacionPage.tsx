import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FileImage, MessageCircle, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando, Vacio } from "@/components/Feedback";
import { ResumenCards } from "@/components/ResumenCards";
import { DepositosTable } from "@/components/DepositosTable";
import { getDb } from "@/db";
import { getAsignacion } from "@/db/repos/asignaciones";
import { getGerente, type Gerente } from "@/db/repos/gerentes";
import { loadCampanaData } from "@/db/queries/campanaData";
import { buildCampanaView, estadoGerente, filtrarDepositos } from "@/domain/campanaView";
import { todayIso } from "@/domain/dates";
import { mensajeEstadoCuenta, numeroWhatsApp, urlWhatsApp } from "@/domain/whatsapp";
import { EstadoGerenteBadge } from "@/components/EstadoGerenteBadge";
import { reportError } from "@/lib/reportError";
import { GerenteFormDialog } from "@/features/gerentes/GerenteFormDialog";
import { EstadoCuentaDialog } from "./EstadoCuentaDialog";
import { DomainError } from "@/domain/errors";
import { useData } from "@/hooks/useData";
import { useAtajo } from "@/hooks/useAtajo";

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

  const navigate = useNavigate();
  const [estadoCuenta, setEstadoCuenta] = useState(false);
  const [editarGerente, setEditarGerente] = useState<Gerente | null>(null);
  useAtajo("n", () => navigate(`/asignaciones/${asignacionId}/depositos/nuevo`), { activo: data?.a.campanaEstado === "activa" });

  if (!data) return <Cargando error={error} />;
  const { a, resumen, r } = data;
  const cerrada = a.campanaEstado === "cerrada";
  const numero = numeroWhatsApp(a.gerenteTelefono);
  const hoy = todayIso();

  async function abrirWhatsApp() {
    if (!numero) return;
    const { asignado, pagado, restante, cantidad } = resumen;
    const texto = mensajeEstadoCuenta({ gerenteNombre: a.gerenteNombre, campanaNombre: a.campanaNombre, fechaCorte: hoy, asignado, pagado, restante, cantidad });
    await openUrl(urlWhatsApp(numero, texto));
  }

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
        back={{ to: `/campanas/${a.campanaId}`, label: a.campanaNombre }}
        title={
          <span className="flex items-center gap-3">
            {a.gerenteNombre}
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
            <Button variant="outline" onClick={() => setEstadoCuenta(true)}>
              <FileImage />
              Estado de cuenta
            </Button>
            {cerrada ? (
              <Button disabled>
                <Plus />
                Registrar depósito
              </Button>
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
      <DepositosTable
        filas={r.filas}
        mostrarGerente={false}
        saldoLabel="Saldo restante"
        totales={r}
        soloLectura={cerrada}
        volverLabel={a.gerenteNombre}
        vacio={
          <Vacio texto={`${a.gerenteNombre} todavía no tiene depósitos en esta campaña.`}>
            {!cerrada && (
              <Link to={`/asignaciones/${a.id}/depositos/nuevo`} className={buttonVariants()}>
                <Plus />
                Registrar depósito
              </Link>
            )}
          </Vacio>
        }
      />
      <EstadoCuentaDialog
        open={estadoCuenta}
        onOpenChange={setEstadoCuenta}
        gerenteNombre={a.gerenteNombre}
        campanaNombre={a.campanaNombre}
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
