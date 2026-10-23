import { useState } from "react";
import { Link } from "react-router";
import { CloudAlert } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { avisoEspejo } from "@/domain/espejo";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";
import { copiarUltimoAlEspejo, getEstadoEspejo } from "@/platform/espejo";

/** Si la copia de los respaldos a Google Drive falló o lleva días sin hacerse, se avisa aunque nadie abra Configuración. */
export function AvisoEspejo() {
  const { data } = useData(async (db) => {
    const e = await getEstadoEspejo(db);
    return avisoEspejo(e.carpeta, e.ultimo, e.ultimoOk, new Date().toISOString());
  }, []);
  const [busy, setBusy] = useState(false);

  async function reintentar() {
    setBusy(true);
    try {
      const r = await copiarUltimoAlEspejo(await getDb());
      if (r?.ok) toast.success("Respaldo copiado a Google Drive");
      else if (r) toast.error(r.mensaje ?? "No se pudo copiar el respaldo");
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        data.tipo === "error"
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
      )}
    >
      <CloudAlert className="size-4 shrink-0" />
      <span className="mr-auto">{data.mensaje}</span>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void reintentar()}>
        Reintentar
      </Button>
      <Link to="/configuracion?tab=datos" className={buttonVariants({ size: "sm", variant: "ghost" })}>
        Ir a Configuración
      </Link>
    </div>
  );
}
