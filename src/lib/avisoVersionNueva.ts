import { toast } from "sonner";
import type { Update } from "@tauri-apps/plugin-updater";
import { abrirAvisoActualizacion } from "@/platform/actualizacion";

/**
 * Mensaje cuando la búsqueda periódica encuentra una versión nueva con la app abierta: no interrumpe y queda
 * hasta que se cierre; "Actualizar" abre el aviso (igual que el botón de la barra lateral).
 */
export function avisarVersionNueva(u: Update): void {
  toast.info(`Hay una versión nueva (${u.version})`, {
    id: "version-nueva",
    duration: Infinity,
    closeButton: true,
    action: { label: "Actualizar", onClick: abrirAvisoActualizacion },
  });
}
