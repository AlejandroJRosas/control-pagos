import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { instalarActualizacion, posponerActualizacion, useActualizacion } from "@/platform/actualizacion";
import { reportError } from "@/lib/reportError";

/** Aviso de versión nueva: aparece al abrir la app (si hay internet), al buscar desde Configuración o con el botón de la barra lateral. */
export function AvisoActualizacion() {
  const { update, abierto } = useActualizacion();
  const [instalando, setInstalando] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);

  async function instalar() {
    if (!update) return;
    setInstalando(true);
    setProgreso(0);
    try {
      await instalarActualizacion(update, setProgreso);
    } catch (e) {
      reportError(e, "Actualizar");
      setInstalando(false);
    }
  }

  return (
    <Dialog
      open={abierto && update !== null}
      onOpenChange={(o) => {
        if (!o && !instalando) posponerActualizacion();
      }}
    >
      <DialogContent showCloseButton={!instalando}>
        <DialogHeader>
          <DialogTitle>Hay una versión nueva</DialogTitle>
          <DialogDescription>
            Versión {update?.version} (tienes la {update?.currentVersion}). Antes de instalar se guarda un respaldo de los datos; la
            app se cierra y se vuelve a abrir sola.
          </DialogDescription>
        </DialogHeader>
        {update?.body && <div className="max-h-60 overflow-auto text-sm whitespace-pre-wrap">{update.body}</div>}
        {instalando && (
          <div className="space-y-1">
            <Progress value={progreso} />
            <div className="text-xs text-muted-foreground">
              {progreso === 100 ? "Respaldando e instalando…" : progreso === null ? "Descargando…" : `Descargando… ${progreso} %`}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={instalando} onClick={posponerActualizacion}>
            Más tarde
          </Button>
          <Button disabled={instalando} onClick={() => void instalar()}>
            <Download />
            Actualizar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
