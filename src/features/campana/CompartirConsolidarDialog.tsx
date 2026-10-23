import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Cargando } from "@/components/Feedback";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { Casilla } from "@/components/Casilla";
import { getDb } from "@/db";
import { nowIso } from "@/db/clock";
import type { SqlDriver } from "@/db/driver";
import { loadDuplicadosCampana } from "@/db/queries/duplicados";
import { cargarEnvio } from "@/db/queries/envioConsolidar";
import { marcarIntercambio } from "@/db/repos/consolidacion";
import { listEtiquetas } from "@/db/repos/etiquetas";
import { listGerentesConCampanas } from "@/db/repos/gerentes";
import { formatFecha, todayIso } from "@/domain/dates";
import { formatNumberVE } from "@/domain/money";
import { armarPaquete, nombreArchivoPaquete } from "@/domain/paquete";
import { invalidate, useData } from "@/hooks/useData";
import { useVersion } from "@/hooks/useVersion";
import { copiarPaquete, guardarPaqueteComo, nombreEquipo, tamanoImagenes } from "@/platform/paquete";
import { reportError } from "@/lib/reportError";

async function cargar(db: SqlDriver, campanaId: number) {
  const [datos, gerentes, etiquetas, duplicados, equipo] = await Promise.all([
    cargarEnvio(db, campanaId),
    listGerentesConCampanas(db),
    listEtiquetas(db),
    loadDuplicadosCampana(db, campanaId),
    nombreEquipo(),
  ]);
  return { datos, etiquetasDe: new Map(gerentes.map((g) => [g.id, g.etiquetas])), etiquetas, hayDuplicados: duplicados.length > 0, equipo };
}

/** dd/mm/aaaa hh:mm en hora local. */
function fechaHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${formatFecha(todayIso(d))} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Props = { campanaId: number; open: boolean; onOpenChange: (open: boolean) => void };

/** Genera el `.cpagos` con los depósitos de los gerentes elegidos, para consolidarlos en la app de otra persona. */
export function CompartirConsolidarDialog({ campanaId, open, onOpenChange }: Props) {
  const { data, error } = useData((db) => cargar(db, campanaId), [campanaId, open]);
  const version = useVersion();
  const [marcados, setMarcados] = useState<Set<number> | null>(null);
  const [soloElegido, setSoloElegido] = useState<boolean | null>(null);
  const [etiqueta, setEtiqueta] = useState("");
  const [ocupado, setOcupado] = useState<"copiar" | "guardar" | null>(null);
  const [imagenesBytes, setImagenesBytes] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setMarcados(null);
    setSoloElegido(null);
    setEtiqueta("");
  }, [open]);
  useEffect(() => {
    if (open && data && marcados === null) setMarcados(new Set(data.datos.asignaciones.map((a) => a.id)));
  }, [open, data, marcados]);

  const asignaciones = data?.datos.asignaciones ?? [];
  const ids = useMemo(() => asignaciones.filter((a) => marcados?.has(a.id)).map((a) => a.id), [asignaciones, marcados]);
  const ultimo = asignaciones.filter((a) => marcados?.has(a.id) && a.ultimoEnvio).map((a) => a.ultimoEnvio as string).sort().pop() ?? null;
  const hayEnvio = asignaciones.some((a) => a.ultimoEnvio);
  const soloCambios = hayEnvio && (soloElegido ?? true);

  const armado = useMemo(() => {
    if (!data || !version) return null;
    const meta = { appVersion: version, creadoEn: "", origen: data.equipo };
    const todos = armarPaquete(data.datos, { asignacionIds: data.datos.asignaciones.map((a) => a.id), soloCambios }, meta);
    const elegido = armarPaquete(data.datos, { asignacionIds: ids, soloCambios }, meta);
    return { porAsignacion: todos.porAsignacion, elegido };
  }, [data, version, ids, soloCambios]);

  useEffect(() => {
    if (!armado) return;
    let vivo = true;
    setImagenesBytes(null);
    tamanoImagenes(armado.elegido.imagenes)
      .then((n) => vivo && setImagenesBytes(n))
      .catch(() => vivo && setImagenesBytes(0));
    return () => {
      vivo = false;
    };
  }, [armado]);

  const megas = armado && imagenesBytes !== null ? (imagenesBytes + JSON.stringify(armado.elegido.paquete).length) / (1024 * 1024) : null;
  const motivo = data?.hayDuplicados ? "Resuelve los depósitos duplicados para compartir" : ids.length === 0 ? "Marca al menos un gerente" : undefined;

  function alternar(id: number) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function porEtiqueta(valor: string) {
    setEtiqueta(valor);
    if (!data || !valor) return;
    const et = Number(valor);
    setMarcados(new Set(asignaciones.filter((a) => data.etiquetasDe.get(a.gerenteId)?.includes(et)).map((a) => a.id)));
  }

  async function compartir(como: "copiar" | "guardar") {
    if (!data || !version) return;
    setOcupado(como);
    try {
      const creadoEn = nowIso();
      const { paquete, imagenes } = armarPaquete(data.datos, { asignacionIds: ids, soloCambios }, { appVersion: version, creadoEn, origen: data.equipo });
      const nombre = nombreArchivoPaquete(data.datos.campana.nombre, data.equipo, todayIso());
      if (como === "copiar") {
        await copiarPaquete(paquete, imagenes, nombre);
        toast.success("Copiado: pégalo en el chat de WhatsApp con Ctrl+V");
      } else if (await guardarPaqueteComo(paquete, imagenes, nombre)) {
        toast.success("Paquete guardado");
      } else {
        return;
      }
      await marcarIntercambio(await getDb(), ids, "envio", creadoEn);
      invalidate();
      onOpenChange(false);
    } catch (e) {
      reportError(e, "Compartir para consolidar");
    } finally {
      setOcupado(null);
    }
  }

  const opcionesEtiqueta = (data?.etiquetas ?? []).filter((e) => e.gerentes > 0).map((e) => ({ value: String(e.id), label: e.nombre }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compartir para consolidar</DialogTitle>
          <DialogDescription>Genera un archivo con los depósitos de los gerentes elegidos para pasarlos a la app de otra persona.</DialogDescription>
        </DialogHeader>

        {!data || !marcados ? (
          <Cargando error={error} />
        ) : (
          <div className="space-y-3">
            {opcionesEtiqueta.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="shrink-0">Marcar por etiqueta</span>
                <BuscadorSelect value={etiqueta} onChange={porEtiqueta} opciones={opcionesEtiqueta} placeholder="Etiqueta…" />
              </div>
            )}
            <div className="max-h-[40vh] space-y-1 overflow-auto">
              <label className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-fila-hover">
                <Casilla
                  className="size-4"
                  checked={ids.length === asignaciones.length && asignaciones.length > 0}
                  indeterminado={ids.length > 0 && ids.length < asignaciones.length}
                  onChange={() => setMarcados(ids.length === asignaciones.length ? new Set() : new Set(asignaciones.map((a) => a.id)))}
                  aria-label="Marcar todos"
                />
                <span className="flex-1">Todos</span>
              </label>
              {asignaciones.map((a) => {
                const n = armado?.porAsignacion.get(a.id) ?? 0;
                return (
                  <label key={a.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-fila-hover">
                    <Casilla className="size-4" checked={marcados.has(a.id)} onChange={() => alternar(a.id)} />
                    <span className="flex-1">{a.gerenteNombre}</span>
                    <span className="text-muted-foreground tabular-nums">{n === 1 ? "1 depósito" : `${n} depósitos`}</span>
                  </label>
                );
              })}
            </div>
            <div className="space-y-1 text-sm">
              <BotonConMotivo motivo={hayEnvio ? undefined : "Todavía no enviaste esta campaña"}>
                <label className="inline-flex items-center gap-2">
                  <Casilla className="size-4" disabled={!hayEnvio} checked={soloCambios} onChange={(e) => setSoloElegido(e.target.checked)} />
                  Solo lo que cambió desde mi último envío
                </label>
              </BotonConMotivo>
              {ultimo && <p className="text-muted-foreground">Último envío: {fechaHora(ultimo)}</p>}
              <p className="text-muted-foreground">Tamaño aproximado: {megas === null ? "…" : `${formatNumberVE(megas, 1)} MB`}</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <BotonConMotivo motivo={motivo}>
            <Button variant="outline" disabled={!!motivo || ocupado !== null || !marcados} onClick={() => void compartir("guardar")}>
              <Save />
              Guardar como…
            </Button>
          </BotonConMotivo>
          <BotonConMotivo motivo={motivo}>
            <Button disabled={!!motivo || ocupado !== null || !marcados} onClick={() => void compartir("copiar")}>
              <MessageCircle />
              {ocupado === "copiar" ? "Generando…" : "Copiar para WhatsApp"}
            </Button>
          </BotonConMotivo>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
