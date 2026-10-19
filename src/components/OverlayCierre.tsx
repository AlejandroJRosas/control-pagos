import { useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { getRespaldando, suscribirRespaldando } from "@/lib/instalarCierre";

/** Cubre la ventana mientras se hace el respaldo al cerrar. */
export function OverlayCierre() {
  const respaldando = useSyncExternalStore(suscribirRespaldando, getRespaldando);
  if (!respaldando) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-5 py-4 text-sm shadow-lg">
        <Loader2 className="size-5 animate-spin" />
        Respaldando antes de cerrar…
      </div>
    </div>
  );
}
