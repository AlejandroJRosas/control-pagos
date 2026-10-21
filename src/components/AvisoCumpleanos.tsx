import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Cake, PartyPopper, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getCumpleanosProximos } from "@/db/queries/cumpleanos";
import { textoFaltan, type CumpleProximo } from "@/domain/cumpleanos";
import { formatFecha, nombreDia } from "@/domain/dates";
import { useData } from "@/hooks/useData";
import { useHoy } from "@/hooks/useHoy";

/** Día (YYYY-MM-DD) en que se cerró el aviso; al otro día vuelve a salir. */
const CLAVE_CERRADO = "cumpleanos-cerrado";
/** Día en que ya se mostró la notificación de los cumpleaños de hoy. */
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

const rosa = "rounded-lg border border-pink-300 bg-pink-50 px-3 py-2 text-sm text-pink-900 dark:border-pink-800 dark:bg-pink-950 dark:text-pink-200";
const enlace = "font-semibold underline-offset-2 hover:underline";

const NombreGerente = ({ c }: { c: CumpleProximo }) => (
  <Link to={`/gerentes/${c.id}`} className={enlace}>
    {c.nombre}
  </Link>
);

/** Cumpleaños de gerentes activos de hoy a los días de antelación configurados; se cierra por el resto del día. */
export function AvisoCumpleanos() {
  const hoy = useHoy();
  const { data } = useData((db) => getCumpleanosProximos(db, hoy), [hoy]);
  const [cerrado, setCerrado] = useState(() => leer(CLAVE_CERRADO));
  const deHoy = data?.proximos.filter((c) => c.dias === 0) ?? [];
  const proximos = data?.proximos.filter((c) => c.dias > 0) ?? [];
  const nombresHoy = deHoy.map((c) => `${c.id}`).join(",");

  useEffect(() => {
    if (!nombresHoy || leer(CLAVE_NOTIFICADO) === hoy) return;
    guardar(CLAVE_NOTIFICADO, hoy);
    for (const c of deHoy) toast(`🎉 ¡Hoy cumple ${c.edad} años ${c.nombre}!`, { duration: 10_000 });
    // Solo al cambiar el día o quiénes cumplen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoy, nombresHoy]);

  if (!data || data.proximos.length === 0 || cerrado === hoy) return null;

  function cerrar() {
    guardar(CLAVE_CERRADO, hoy);
    setCerrado(hoy);
  }

  return (
    <div className={`mb-4 flex items-start gap-2 ${rosa}`} role="status" aria-label="Cumpleaños">
      <div className="mr-auto grid gap-1">
        {deHoy.map((c) => (
          <p key={c.id} className="flex items-center gap-2 text-base font-medium">
            <PartyPopper className="size-4 shrink-0" />
            <span>
              ¡Hoy cumple {c.edad} años <NombreGerente c={c} />!
            </span>
          </p>
        ))}
        {proximos.map((c) => (
          <p key={c.id} className="flex items-center gap-2">
            <Cake className="size-4 shrink-0" />
            <span>
              <NombreGerente c={c} /> cumple {c.edad} años {textoFaltan(c.dias)} ({nombreDia(c.fecha)} {formatFecha(c.fecha).slice(0, 5)})
            </span>
          </p>
        ))}
      </div>
      <Button size="icon-sm" variant="ghost" className="hover:bg-pink-100 dark:hover:bg-pink-900" aria-label="Cerrar por hoy" title="Cerrar por hoy" onClick={cerrar}>
        <X />
      </Button>
    </div>
  );
}
