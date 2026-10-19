import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { closeDb, getDb } from "@/db";
import { deleteAjuste, getAjuste, setAjuste } from "@/db/repos/ajustes";
import { AJUSTE_ERROR_CIERRE, esperarArranque, mensajeErrorDeCierre, respaldoDeCierre } from "@/platform/backup";
import { pedirCierre } from "./cierre";
import { reportError } from "./reportError";


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
      respaldar: async () => respaldoDeCierre(await getDb()),
      destruir: async () => {
        await closeDb().catch(() => {});
        await ventana.destroy();
      },
      guardarError: async (err) => {
        const mensaje = err instanceof Error ? err.message : String(err);
        await setAjuste(await getDb(), AJUSTE_ERROR_CIERRE, JSON.stringify({ fecha: new Date().toISOString(), mensaje }));
      },
      onRespaldando: setRespaldando,
    }).catch(reportError);
  });
}

/** Si el respaldo al cerrar la vez anterior no se completó, se avisa una vez (después de rehacerlo al abrir). */
export async function avisarErrorDeCierre(): Promise<void> {
  await esperarArranque();
  const db = await getDb();
  const v = await getAjuste(db, AJUSTE_ERROR_CIERRE);
  if (!v) return;
  toast.warning(mensajeErrorDeCierre(v), { duration: 15_000 });
  await deleteAjuste(db, AJUSTE_ERROR_CIERRE);
}
