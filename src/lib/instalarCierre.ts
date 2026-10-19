import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { closeDb, getDb } from "@/db";
import { huboEscrituras } from "@/db/tauriDriver";
import { deleteAjuste, getAjuste, setAjuste } from "@/db/repos/ajustes";
import { runAutoBackup } from "@/platform/backup";
import { pedirCierre } from "./cierre";
import { reportError } from "./reportError";

const AJUSTE_ERROR = "cierre_error";

let respaldando = false;
const oyentes = new Set<() => void>();
export const getRespaldando = () => respaldando;
export function suscribirRespaldando(l: () => void): () => void {
  oyentes.add(l);
  return () => {
    oyentes.delete(l);
  };
}
function setRespaldando(v: boolean) {
  respaldando = v;
  oyentes.forEach((l) => l());
}

/** Toma el cierre de la ventana: bloqueadores, respaldo de cierre (si hubo cambios) y destruir. */
export async function instalarCierre(): Promise<() => void> {
  const ventana = getCurrentWindow();
  return ventana.onCloseRequested((e) => {
    e.preventDefault();
    void pedirCierre({
      respaldar: async () => {
        if (huboEscrituras()) await runAutoBackup(await getDb(), { reemplazar: true });
      },
      destruir: async () => {
        await closeDb().catch(() => {});
        await ventana.destroy();
      },
      guardarError: async (err) => {
        const mensaje = err instanceof Error ? err.message : String(err);
        await setAjuste(await getDb(), AJUSTE_ERROR, JSON.stringify({ fecha: new Date().toISOString(), mensaje }));
      },
      onRespaldando: setRespaldando,
    }).catch(reportError);
  });
}

/** Si el respaldo al cerrar la vez anterior no se completó, se avisa una vez. */
export async function avisarErrorDeCierre(): Promise<void> {
  const db = await getDb();
  const v = await getAjuste(db, AJUSTE_ERROR);
  if (!v) return;
  const { mensaje } = JSON.parse(v) as { mensaje: string };
  toast.warning(`El respaldo al cerrar la app no se completó (${mensaje}). Hoy se hizo el respaldo al abrir.`, { duration: 15_000 });
  await deleteAjuste(db, AJUSTE_ERROR);
}
