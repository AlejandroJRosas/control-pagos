import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { MessageCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Aviso, Cargando } from "@/components/Feedback";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import type { SqlDriver } from "@/db/driver";
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import { getPlantillas } from "@/db/repos/plantillas";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { loadDuplicadosCampana } from "@/db/queries/duplicados";
import { buildCampanaView, filtrarDepositos, type CampanaView, type FilaDeposito, type GerenteResumen } from "@/domain/campanaView";
import { todayIso } from "@/domain/dates";
import { seleccionInicial } from "@/domain/envioLote";
import { formatUsd } from "@/domain/money";
import { mensajeEstadoCuenta, numeroWhatsApp, urlWhatsApp, type Plantillas } from "@/domain/whatsapp";
import { useData } from "@/hooks/useData";
import { ETIQUETA_FORMATO, useFormatoEnvio } from "@/lib/formatoEnvio";
import { reportError } from "@/lib/reportError";
import { GerenteFormDialog } from "@/features/gerentes/GerenteFormDialog";
import { HojaEstadoCuenta } from "@/features/asignacion/HojaEstadoCuenta";
import { copiarEstadoCuenta } from "@/features/asignacion/envioEstadoCuenta";
import { FormatoEnvioSelector } from "@/features/asignacion/FormatoEnvioSelector";

type Fila = GerenteResumen & { telefono: string | null; numero: string | null; filas: FilaDeposito[] };
type Datos = { campana: CampanaData["campana"]; view: CampanaView; filas: Fila[]; gerentes: Gerente[]; plantillas: Plantillas; conDuplicados: Set<number> };

async function cargar(db: SqlDriver, campanaId: number): Promise<Datos> {
  const [d, gerentes, plantillas, duplicados] = await Promise.all([
    loadCampanaData(db, campanaId),
    listGerentes(db),
    getPlantillas(db),
    loadDuplicadosCampana(db, campanaId),
  ]);
  const view = buildCampanaView(d.asignaciones, d.depositos);
  const tel = new Map(gerentes.map((g) => [g.id, g.telefono]));
  const filas = view.gerentes.map((g) => {
    const telefono = tel.get(g.gerenteId) ?? null;
    return { ...g, telefono, numero: numeroWhatsApp(telefono), filas: filtrarDepositos(view.depositos, { gerenteId: g.gerenteId }).filas };
  });
  // Como en Exportar: con un depósito duplicado, su PDF o Excel saldría con los totales inflados.
  const conDuplicados = new Set(duplicados.flatMap((g) => g.map((dep) => dep.asignacionId)));
  return { campana: d.campana, view, filas, gerentes, plantillas, conDuplicados };
}

type Props = { campanaId: number; open: boolean; onOpenChange: (open: boolean) => void };

/** Recorre los gerentes elegidos uno a uno: copia la imagen del estado de cuenta y abre su chat con el mensaje listo. */
export function EnvioLoteDialog({ campanaId, open, onOpenChange }: Props) {
  const { data, error } = useData((db) => cargar(db, campanaId), [campanaId]);
  const [marcados, setMarcados] = useState<Set<number> | null>(null);
  const [cola, setCola] = useState<number[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [enviados, setEnviados] = useState<Set<number>>(new Set());
  const [editar, setEditar] = useState<Gerente | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const hoja = useRef<HTMLDivElement>(null);
  const [formato, setFormato] = useFormatoEnvio();
  const hoy = todayIso();

  // Cada vez que se abre se empieza de nuevo (el avance no se guarda).
  useEffect(() => {
    if (!open) return;
    setMarcados(null);
    setCola(null);
    setIndice(0);
    setEnviados(new Set());
  }, [open]);
  useEffect(() => {
    if (open && data && marcados === null) setMarcados(seleccionInicial(data.filas));
  }, [open, data, marcados]);

  const porId = useMemo(() => new Map((data?.filas ?? []).map((f) => [f.asignacionId, f])), [data]);
  const actual = cola && indice < cola.length ? porId.get(cola[indice]) : undefined;
  const terminado = cola !== null && indice >= cola.length;

  function alternar(id: number) {
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function enviar(f: Fila) {
    if (!f.numero || !data) return;
    setOcupado(true);
    try {
      const aviso = await copiarEstadoCuenta(formato, {
        hoja: hoja.current,
        campana: data.campana,
        view: data.view,
        asignacionId: f.asignacionId,
        gerenteNombre: f.gerenteNombre,
        fechaCorte: hoy,
      });
      const texto = mensajeEstadoCuenta(
        { gerenteNombre: f.gerenteNombre, campanaNombre: data.campana.nombre, fechaCorte: hoy, asignado: f.asignado, pagado: f.pagado, restante: f.restante, cantidad: f.cantidad },
        data.plantillas,
      );
      await openUrl(urlWhatsApp(f.numero, texto));
      setEnviados((s) => new Set(s).add(f.asignacionId));
      toast.success(`${aviso}: pégalo en el chat con Ctrl+V`);
    } catch (e) {
      reportError(e, "WhatsApp");
    } finally {
      setOcupado(false);
    }
  }

  const conTelefono = data?.filas.filter((f) => f.numero) ?? [];
  const elegidos = conTelefono.filter((f) => marcados?.has(f.asignacionId));
  const nombre = ETIQUETA_FORMATO[formato].toLowerCase();
  const motivo =
    actual && formato !== "imagen" && data?.conDuplicados.has(actual.asignacionId)
      ? `Tiene depósitos duplicados: resuélvelos para enviar el ${nombre}, o envía la imagen`
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Enviar estados de cuenta</DialogTitle>
          <DialogDescription>
            {cola === null
              ? `Elige a quién enviarlo. Luego se abre el chat de cada uno con el mensaje listo; pega el ${nombre} con Ctrl+V y envía.`
              : terminado
                ? "Listo."
                : `${indice + 1} de ${cola.length}`}
          </DialogDescription>
        </DialogHeader>

        {!data || !marcados ? (
          <Cargando error={error} />
        ) : cola === null ? (
          <div className="max-h-[55vh] space-y-1 overflow-auto">
            <div className="flex gap-2 pb-2">
              <Button size="sm" variant="outline" onClick={() => setMarcados(new Set(conTelefono.map((f) => f.asignacionId)))}>
                Marcar todos
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMarcados(new Set())}>
                Ninguno
              </Button>
            </div>
            {data.filas.map((f) => (
              <label key={f.asignacionId} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-fila-hover">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={!f.numero}
                  checked={marcados.has(f.asignacionId)}
                  onChange={() => alternar(f.asignacionId)}
                />
                <span className="flex-1">{f.gerenteNombre}</span>
                {!f.numero && (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      setEditar(data.gerentes.find((g) => g.id === f.gerenteId) ?? null);
                    }}
                  >
                    Agregar teléfono…
                  </Button>
                )}
                <span className="w-28 text-right tabular-nums">{formatUsd(f.restante)}</span>
              </label>
            ))}
          </div>
        ) : actual ? (
          <div className="max-h-[55vh] overflow-auto rounded-md border bg-neutral-100 p-3">
            <HojaEstadoCuenta
              ref={hoja}
              gerenteNombre={actual.gerenteNombre}
              campanaNombre={data.campana.nombre}
              fechaCorte={hoy}
              resumen={actual}
              filas={actual.filas}
            />
          </div>
        ) : (
          <Aviso>
            Enviados: {enviados.size} · Omitidos: {(cola?.length ?? 0) - enviados.size}
          </Aviso>
        )}

        <DialogFooter className="sm:justify-between">
          {!terminado && <FormatoEnvioSelector formato={formato} onChange={setFormato} />}
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            {cola === null ? (
              <Button disabled={elegidos.length === 0} onClick={() => setCola(elegidos.map((f) => f.asignacionId))}>
                Empezar ({elegidos.length})
              </Button>
            ) : actual ? (
              <>
                <Button variant="ghost" disabled={ocupado} onClick={() => setIndice((i) => i + 1)}>
                  <SkipForward />
                  {enviados.has(actual.asignacionId) ? "Siguiente" : "Omitir"}
                </Button>
                <BotonConMotivo motivo={motivo}>
                  <Button disabled={ocupado || !!motivo} onClick={() => void enviar(actual)}>
                    <MessageCircle />
                    Copiar y abrir WhatsApp
                  </Button>
                </BotonConMotivo>
              </>
            ) : (
              <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
      <GerenteFormDialog gerente={editar} open={editar !== null} onOpenChange={(o) => !o && setEditar(null)} />
    </Dialog>
  );
}
