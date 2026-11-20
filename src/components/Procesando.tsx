import { Spinner } from "@/components/Feedback";
import { useProcesando } from "@/lib/procesando";

/**
 * Aviso a pantalla completa mientras se procesa algo que se soltó o se eligió (`procesando` en `lib/procesando.ts`).
 * Tapa la app para no soltar otra cosa encima; aparece tras un instante (`cargando-aparecer`) para que lo rápido no parpadee.
 */
export function Procesando() {
  const texto = useProcesando();
  if (texto === null) return null;
  return (
    <div className="fixed inset-0 z-50 cursor-progress">
      <div role="status" aria-live="polite" className="cargando-aparecer grid size-full place-items-center bg-background/60 p-4 backdrop-blur-[2px]">
        <div className="flex items-center gap-3 rounded-xl border bg-background px-6 py-4 text-sm font-medium shadow-lg">
          <Spinner />
          <span>{texto}</span>
        </div>
      </div>
    </div>
  );
}
