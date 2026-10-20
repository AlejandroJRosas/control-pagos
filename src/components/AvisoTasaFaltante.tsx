import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CalendarX2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { createFeriado } from "@/db/repos/feriados";
import { getTasasFaltantes } from "@/db/queries/tasaFaltante";
import { formatFecha, nombreDia, todayIso } from "@/domain/dates";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { TasaFormDialog } from "@/features/tasas/TasaFormDialog";

const ambar = "flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";

/** Hoy, actualizado al volver a la ventana (puede quedar abierta de un día a otro). */
function useHoy(): string {
  const [hoy, setHoy] = useState(todayIso);
  useEffect(() => {
    const onFocus = () => setHoy(todayIso());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  return hoy;
}

/**
 * La tasa se registra en la mañana al abrir: si falta la que rige hoy (en fin de semana, la del lunes, que la empresa
 * da por adelantado) o la que necesitan depósitos en revisión, se avisa.
 */
export function AvisoTasaFaltante() {
  const hoy = useHoy();
  const { data } = useData((db) => getTasasFaltantes(db, hoy), [hoy]);
  const navigate = useNavigate();
  const [registrar, setRegistrar] = useState(false);
  const [feriado, setFeriado] = useState(false);

  async function marcarFeriado() {
    try {
      await createFeriado(await getDb(), { fecha: hoy, nombre: null });
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setFeriado(false);
    }
  }

  if (!data || (!data.hoy && data.anteriores.length === 0)) return null;
  return (
    <div className="mb-4 grid gap-2">
      {data.hoy && (
        <div className={ambar} role="status">
          <CalendarX2 className="size-4 shrink-0" />
          <span className="mr-auto font-medium">
            {data.hoy === hoy
              ? `Falta la tasa de hoy (${nombreDia(hoy)} ${formatFecha(hoy)})`
              : `Falta la tasa del ${nombreDia(data.hoy)} ${formatFecha(data.hoy)}, que rige hoy`}
          </span>
          <Button size="sm" onClick={() => setRegistrar(true)}>
            Registrar tasa
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/tasas/lote")}>
            Subir captura
          </Button>
          {data.hoy === hoy && (
            <Button size="sm" variant="ghost" onClick={() => setFeriado(true)}>
              Hoy es feriado
            </Button>
          )}
        </div>
      )}
      {data.anteriores.length > 0 && (
        <div className={ambar} role="status">
          <CalendarX2 className="size-4 shrink-0" />
          <span className="mr-auto">
            Faltan tasas de {data.anteriores.length} día(s) con depósitos en revisión:{" "}
            {data.anteriores.map((f) => formatFecha(f).slice(0, 5)).join(", ")}
          </span>
          <Link to="/tasas" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Ver calendario
          </Link>
        </div>
      )}
      <TasaFormDialog tasa={null} fechaFija={data.hoy ?? hoy} open={registrar} onOpenChange={setRegistrar} />
      <ConfirmDialog
        open={feriado}
        onOpenChange={setFeriado}
        title="Marcar hoy como feriado"
        description={`El ${formatFecha(hoy)} no llevará tasa propia: sus depósitos usarán la del siguiente día hábil.`}
        confirmLabel="Es feriado"
        onConfirm={marcarFeriado}
      />
    </div>
  );
}
