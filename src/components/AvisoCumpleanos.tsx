import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Cake, PartyPopper, X } from "lucide-react";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { getCumpleanosProximos } from "@/db/queries/cumpleanos";
import { textoFaltan, type CumpleProximo } from "@/domain/cumpleanos";
import { formatFecha, nombreDia } from "@/domain/dates";
import { useData } from "@/hooks/useData";
import { useHoy } from "@/hooks/useHoy";
import { cn } from "@/lib/utils";

/** Día (YYYY-MM-DD) en que se cerró el aviso; al otro día vuelve a salir (y el día del cumpleaños sale aunque se cerrara antes). */
const CLAVE_CERRADO = "cumpleanos-cerrado";
/** Día en que ya se llamó la atención en la barra de tareas por los cumpleaños de hoy. */
const CLAVE_NOTIFICADO = "cumpleanos-notificado";

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento el aviso simplemente vuelve a salir.
  }
}

/** Si la app está minimizada o detrás de otra ventana, parpadea en la barra de tareas (hasta que se vuelve a ella). */
function llamarAtencion(hoy: string) {
  if (leer(CLAVE_NOTIFICADO) === hoy) return;
  guardar(CLAVE_NOTIFICADO, hoy);
  if (document.hasFocus()) return;
  void Promise.resolve()
    .then(() => getCurrentWindow().requestUserAttention(UserAttentionType.Informational))
    .catch(() => {});
}

const NombreGerente = ({ c }: { c: CumpleProximo }) => (
  <Link to={`/gerentes/${c.id}`} className="font-semibold underline-offset-2 hover:underline">
    {c.nombre}
  </Link>
);

/**
 * Cumpleaños de gerentes activos de hoy a los días de antelación configurados, en una ventanita abajo a la derecha (como
 * las de Steam) que queda hasta cerrarla; se cierra por el resto del día. Sale también si la app quedó abierta de un día
 * a otro (`useHoy`).
 */
export function AvisoCumpleanos() {
  const hoy = useHoy();
  const { data } = useData((db) => getCumpleanosProximos(db, hoy), [hoy]);
  const [cerrado, setCerrado] = useState(() => leer(CLAVE_CERRADO));
  const deHoy = data?.proximos.filter((c) => c.dias === 0) ?? [];
  const proximos = data?.proximos.filter((c) => c.dias > 0) ?? [];
  const hayHoy = deHoy.length > 0;
  const visible = !!data && data.proximos.length > 0 && cerrado !== hoy;

  useEffect(() => {
    if (visible && hayHoy) llamarAtencion(hoy);
  }, [visible, hayHoy, hoy]);

  if (!visible) return null;

  function cerrar() {
    guardar(CLAVE_CERRADO, hoy);
    setCerrado(hoy);
  }

  return (
    <div
      role="status"
      aria-label="Cumpleaños"
      className={cn(
        "fixed right-20 bottom-6 z-40 w-80 max-w-[calc(100vw-6rem)] overflow-hidden rounded-xl border shadow-xl",
        "animate-in fade-in slide-in-from-bottom-4 duration-200 ease-out",
        "border-pink-300 bg-pink-50 text-pink-900 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-100",
      )}
    >
      <div className="flex items-center gap-2 bg-pink-200/70 px-3 py-1.5 text-xs font-semibold tracking-wide uppercase dark:bg-pink-900/70">
        {hayHoy ? <PartyPopper className="size-3.5" /> : <Cake className="size-3.5" />}
        <span className="mr-auto">{hayHoy ? "¡Cumpleaños hoy!" : "Cumpleaños cercanos"}</span>
        <Button size="icon-xs" variant="ghost" className="hover:bg-pink-300/60 dark:hover:bg-pink-800" aria-label="Cerrar por hoy" title="Cerrar por hoy" onClick={cerrar}>
          <X />
        </Button>
      </div>
      <div className="grid gap-2 px-4 py-3 text-sm">
        {deHoy.map((c) => (
          <p key={c.id} className="flex items-start gap-2 text-base font-medium">
            <PartyPopper className="mt-1 size-4 shrink-0" />
            <span>
              ¡Hoy cumple {c.edad} años <NombreGerente c={c} />!
            </span>
          </p>
        ))}
        {proximos.map((c) => (
          <p key={c.id} className="flex items-start gap-2">
            <Cake className="mt-0.5 size-4 shrink-0" />
            <span>
              <NombreGerente c={c} /> cumple {c.edad} años {textoFaltan(c.dias)} ({nombreDia(c.fecha)} {formatFecha(c.fecha).slice(0, 5)})
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
