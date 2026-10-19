import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { CloudUpload, FolderOpen, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { deleteAjuste, setAjuste } from "@/db/repos/ajustes";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { AJUSTE_CARPETA, copiarUltimoAlEspejo, getEstadoEspejo } from "@/platform/espejo";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-VE");

/** Carpeta de Google Drive (u otra sincronizada) donde se copia cada respaldo automático. */
export function CopiaDrive() {
  const { data: e } = useData((db) => getEstadoEspejo(db), []);
  const [busy, setBusy] = useState(false);

  async function elegir() {
    const dir = await open({ directory: true, multiple: false, title: "Carpeta de Google Drive para los respaldos" });
    if (typeof dir !== "string") return;
    try {
      await setAjuste(await getDb(), AJUSTE_CARPETA, dir);
      invalidate();
      await copiarAhora();
    } catch (err) {
      reportError(err);
    }
  }

  async function quitar() {
    try {
      await deleteAjuste(await getDb(), AJUSTE_CARPETA);
      invalidate();
    } catch (err) {
      reportError(err);
    }
  }

  async function copiarAhora() {
    setBusy(true);
    try {
      const r = await copiarUltimoAlEspejo(await getDb());
      if (!r) toast.info("Todavía no hay un respaldo automático para copiar");
      else if (r.ok) toast.success("Respaldo copiado a Google Drive");
      else toast.error(r.mensaje ?? "No se pudo copiar el respaldo");
      invalidate();
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Copia en Google Drive</CardTitle>
        <CardDescription>
          Elige una carpeta de Google Drive sincronizada para tener una copia de los respaldos fuera de esta computadora. Cada respaldo automático se copia
          allí y se conservan los últimos 7.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {e?.carpeta ? (
          <div>
            <span className="text-muted-foreground">Carpeta: </span>
            <code>{e.carpeta}</code>
          </div>
        ) : (
          <p className="text-muted-foreground">Sin configurar: los respaldos solo quedan en esta computadora.</p>
        )}
        {e?.carpeta && (
          <div className="text-muted-foreground">
            {e.ultimoOk ? `Última copia: ${fechaHora(e.ultimoOk)}` : "Todavía no se ha copiado ningún respaldo."}
            {e.ultimo && !e.ultimo.ok && (
              <span className="block text-destructive">
                Último intento ({fechaHora(e.ultimo.fecha)}): {e.ultimo.mensaje}
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant={e?.carpeta ? "outline" : "default"} onClick={() => void elegir()} disabled={busy}>
            <FolderOpen />
            {e?.carpeta ? "Cambiar carpeta…" : "Elegir carpeta…"}
          </Button>
          {e?.carpeta && (
            <>
              <Button variant="outline" onClick={() => void copiarAhora()} disabled={busy}>
                <CloudUpload />
                Copiar ahora
              </Button>
              <Button variant="ghost" onClick={() => void quitar()} disabled={busy}>
                <X />
                Quitar
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
