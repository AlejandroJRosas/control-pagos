import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDb } from "@/db";
import { listCampanas } from "@/db/repos/campanas";
import { formatFecha } from "@/domain/dates";
import { novedadesPendientes, type Novedad } from "@/domain/novedades";
import { useVersion } from "@/hooks/useVersion";
import { NOVEDADES, leerVersionVista, marcarVersionVista } from "@/lib/novedades";
import { useTutorialAbierto } from "@/lib/tutorial";
import { reportError } from "@/lib/reportError";

/** Notas de varias versiones, la más nueva primero; `instalada` lleva la marca "Instalada". */
export function ListaNovedades({ novedades, instalada }: { novedades: readonly Novedad[]; instalada?: string | null }) {
  return (
    <div className="space-y-5">
      {novedades.map((n) => (
        <section key={n.version} aria-label={`Versión ${n.version}`} className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="font-semibold">Versión {n.version}</h3>
            {n.fecha && <span className="text-xs text-muted-foreground">{formatFecha(n.fecha)}</span>}
            {n.version === instalada && <Badge variant="secondary">Instalada</Badge>}
          </div>
          {n.notas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin notas.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {n.notas.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * La primera vez que se abre una versión nueva muestra sus novedades (y las de las versiones que se saltaron). En una
 * instalación nueva (sin versión vista y sin campañas) no sale: todo es nuevo. Espera a que se cierre el tutorial.
 */
export function NovedadesVersion() {
  const version = useVersion();
  const tutorial = useTutorialAbierto();
  const navigate = useNavigate();
  const [pendientes, setPendientes] = useState<Novedad[]>([]);

  useEffect(() => {
    if (!version) return;
    const vista = leerVersionVista();
    if (vista === version) return;
    let vivo = true;
    (async () => {
      let p = novedadesPendientes(NOVEDADES, vista, version);
      if (vista === null && p.length > 0 && (await listCampanas(await getDb())).length === 0) p = [];
      if (!vivo) return;
      if (p.length > 0) setPendientes(p);
      else marcarVersionVista(version);
    })().catch((e) => reportError(e));
    return () => {
      vivo = false;
    };
  }, [version]);

  function cerrar() {
    if (version) marcarVersionVista(version);
    setPendientes([]);
  }

  return (
    <Dialog open={pendientes.length > 0 && !tutorial} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Novedades de la versión {version}
          </DialogTitle>
          <DialogDescription>
            {pendientes.length > 1 ? `La app se actualizó. Esto es lo nuevo de las versiones ${pendientes[pendientes.length - 1].version} a ${pendientes[0].version}:` : "La app se actualizó. Esto es lo nuevo:"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto pr-1">
          <ListaNovedades novedades={pendientes} />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              cerrar();
              navigate("/configuracion?tab=acerca");
            }}
          >
            Ver todo el historial
          </Button>
          <Button onClick={cerrar}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
