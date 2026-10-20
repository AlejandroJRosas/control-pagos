import { useEffect, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { DatabaseZap, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDataPaths, listBackups, restoreBackup, type BackupInfo } from "@/platform/backup";
import { reportError } from "@/lib/reportError";

type Props = {
  detalle: string[];
  /** Solo si la BD llegó a abrir: seguir sin respaldo automático ni limpieza. */
  onContinuar?: () => void;
};

/** Pantalla de arranque cuando la verificación de la BD falla: ofrece restaurar un respaldo en vez de fallar con errores raros. */
export function BdDanada({ detalle, onContinuar }: Props) {
  const [respaldos, setRespaldos] = useState<BackupInfo[] | null>(null);
  const [restaurar, setRestaurar] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listBackups()
      .then((b) => setRespaldos([...b].sort((x, y) => y.modifiedMs - x.modifiedMs)))
      .catch((e) => {
        setRespaldos([]);
        reportError(e, "Respaldos");
      });
  }, []);

  async function abrirCarpeta() {
    try {
      await openPath(await dirname((await getDataPaths()).backupsDir));
    } catch (e) {
      reportError(e, "Abrir carpeta");
    }
  }

  async function confirmar() {
    if (!restaurar) return;
    setBusy(true);
    try {
      await restoreBackup(restaurar.path);
      window.location.reload();
    } catch (e) {
      reportError(e, "Restaurar");
      setBusy(false);
      setRestaurar(null);
    }
  }

  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <DatabaseZap className="size-8 text-destructive" />
          <h1 className="text-2xl font-semibold">La base de datos parece dañada</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Al abrir se revisa la base de datos y algo no está bien. Lo más seguro es restaurar el respaldo más reciente: antes de reemplazar nada se
          guarda una copia de los datos actuales.
        </p>
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer">Detalle técnico</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
            {detalle.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </details>
        <div className="space-y-2">
          <h2 className="font-medium">Respaldos disponibles</h2>
          {respaldos === null ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : respaldos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay respaldos en la carpeta de respaldos.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {respaldos.map((b) => (
                <li key={b.path} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="font-mono text-xs">{b.name}</span>
                  <span className="text-muted-foreground">{new Date(b.modifiedMs).toLocaleString("es-VE")}</span>
                  <Button size="sm" className="ml-auto" disabled={busy} onClick={() => setRestaurar(b)}>
                    Restaurar este respaldo
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void abrirCarpeta()}>
            <FolderOpen />
            Abrir carpeta de datos
          </Button>
          {onContinuar && (
            <Button variant="ghost" onClick={onContinuar}>
              Continuar de todos modos
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={restaurar !== null}
        onOpenChange={(o) => {
          if (!o && !busy) setRestaurar(null);
        }}
        title="Restaurar respaldo"
        description={restaurar ? `Se reemplazarán los datos actuales por los de ${restaurar.name}.` : ""}
        confirmLabel="Restaurar"
        destructive
        onConfirm={confirmar}
      />
      <Toaster richColors position="top-right" />
    </div>
  );
}
