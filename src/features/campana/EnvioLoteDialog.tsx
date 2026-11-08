import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { join } from "@tauri-apps/api/path";
import { open as elegirCarpeta } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, Download, MessageCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Aviso, Cargando } from "@/components/Feedback";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import { Casilla } from "@/components/Casilla";
import type { SqlDriver } from "@/db/driver";
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import { getPlantillas } from "@/db/repos/plantillas";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { loadDuplicadosCampana } from "@/db/queries/duplicados";
import { buildCampanaView, filtrarDepositos, type CampanaView, type FilaDeposito, type GerenteResumen } from "@/domain/campanaView";
import { todayIso } from "@/domain/dates";
import { alternarRama, aplanarArbol, armarArbol, estadoRama } from "@/domain/arbol";
import { nombresSinRepetir, seleccionInicial } from "@/domain/envioLote";
import { formatUsd } from "@/domain/money";
import { mensajeEstadoCuenta, numeroWhatsApp, urlWhatsApp, type Plantillas } from "@/domain/whatsapp";
import { useData } from "@/hooks/useData";
import { ETIQUETA_FORMATO, useFormatoEnvio } from "@/lib/formatoEnvio";
import { reportError } from "@/lib/reportError";
import { GerenteFormDialog } from "@/features/gerentes/GerenteFormDialog";
import { HojaEstadoCuenta } from "@/features/asignacion/HojaEstadoCuenta";
import { archivoEstadoCuenta, copiarEstadoCuenta } from "@/features/asignacion/envioEstadoCuenta";
import { copiarArchivos } from "@/platform/envios";
import { FormatoEnvioSelector } from "@/features/asignacion/FormatoEnvioSelector";

type Fila = GerenteResumen & { jefeId: number | null; telefono: string | null; numero: string | null; filas: FilaDeposito[] };
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
  const jefe = new Map(d.asignaciones.map((a) => [a.id, a.jefeId]));
  const filas = view.gerentes.map((g) => {
    const telefono = tel.get(g.gerenteId) ?? null;
    const filas = filtrarDepositos(view.depositos, { gerenteId: g.gerenteId }).filas;
    return { ...g, jefeId: jefe.get(g.asignacionId) ?? null, telefono, numero: numeroWhatsApp(telefono), filas };
  });
  // Como en Exportar: con un depósito duplicado, su PDF o Excel saldría con los totales inflados.
  const conDuplicados = new Set(duplicados.flatMap((g) => g.map((dep) => dep.asignacionId)));
  return { campana: d.campana, view, filas, gerentes, plantillas, conDuplicados };
}

type Props = { campanaId: number; open: boolean; onOpenChange: (open: boolean) => void };

/**
 * Estados de cuenta de varios gerentes (elegidos sobre la estructura: marcar a un jefe marca su rama). "Empezar" recorre uno a uno
 * los que tienen teléfono (copia y abre su chat con el mensaje listo); "Copiar" y "Descargar" sacan todos los marcados de una vez.
 */
export function EnvioLoteDialog({ campanaId, open, onOpenChange }: Props) {
  const { data, error } = useData((db) => cargar(db, campanaId), [campanaId]);
  const [marcados, setMarcados] = useState<Set<number> | null>(null);
  const [cola, setCola] = useState<number[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [enviados, setEnviados] = useState<Set<number>>(new Set());
  const [editar, setEditar] = useState<Gerente | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [fuera, setFuera] = useState<string[]>([]);
  /** El gerente cuya hoja se dibuja fuera de la vista para sacarle la imagen (Copiar/Descargar en imagen). */
  const [enHoja, setEnHoja] = useState<Fila | null>(null);
  const hoja = useRef<HTMLDivElement>(null);
  const hojaOculta = useRef<HTMLDivElement>(null);
  const [formato, setFormato] = useFormatoEnvio();
  const hoy = todayIso();

  // Cada vez que se abre se empieza de nuevo (el avance no se guarda).
  useEffect(() => {
    if (!open) return;
    setMarcados(null);
    setCola(null);
    setIndice(0);
    setEnviados(new Set());
    setFuera([]);
  }, [open]);
  useEffect(() => {
    if (open && data && marcados === null) setMarcados(seleccionInicial(data.filas));
  }, [open, data, marcados]);

  const porId = useMemo(() => new Map((data?.filas ?? []).map((f) => [f.asignacionId, f])), [data]);
  const jefes = useMemo(() => new Map((data?.filas ?? []).map((f) => [f.asignacionId, f.jefeId])), [data]);
  const arbol = useMemo(() => aplanarArbol(armarArbol(data?.filas ?? [], (f) => f.asignacionId, jefes), (f) => f.asignacionId), [data, jefes]);
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

  /** Con gente debajo marca o desmarca la rama entera; si no, solo a él. */
  function alternarFila(id: number, tieneHijos: boolean) {
    if (tieneHijos) setMarcados((m) => alternarRama(m ?? new Set(), jefes, id));
    else alternar(id);
  }

  /** Arma el archivo de cada marcado (en el orden de la estructura); en PDF o Excel salta a quien tiene duplicados. */
  async function armarArchivos(): Promise<{ bytes: Uint8Array; nombre: string }[]> {
    if (!data) return [];
    const saltados = formato === "imagen" ? [] : marcadosEnOrden.filter((f) => data.conDuplicados.has(f.asignacionId));
    const van = marcadosEnOrden.filter((f) => !saltados.includes(f));
    const archivos = [];
    setFuera(saltados.map((f) => f.gerenteNombre));
    setProgreso({ hechos: 0, total: van.length });
    try {
      for (const f of van) {
        // La imagen sale de la hoja dibujada: se dibuja la de este gerente antes de capturarla.
        if (formato === "imagen") flushSync(() => setEnHoja(f));
        archivos.push(
          await archivoEstadoCuenta(formato, {
            hoja: hojaOculta.current,
            campana: data.campana,
            view: data.view,
            asignacionId: f.asignacionId,
            gerenteNombre: f.gerenteNombre,
            fechaCorte: hoy,
          }),
        );
        setProgreso({ hechos: archivos.length, total: van.length });
      }
    } finally {
      setEnHoja(null);
      setProgreso(null);
    }
    const nombres = nombresSinRepetir(archivos.map((a) => a.nombre));
    return archivos.map((a, i) => ({ ...a, nombre: nombres[i] }));
  }

  async function copiarTodos() {
    setOcupado(true);
    try {
      const archivos = await armarArchivos();
      if (archivos.length === 0) return;
      await copiarArchivos(archivos);
      toast.success(`${archivos.length === 1 ? "1 archivo copiado" : `${archivos.length} archivos copiados`}: pégalos en el chat con Ctrl+V`);
    } catch (e) {
      reportError(e, "Copiar estados de cuenta");
    } finally {
      setOcupado(false);
    }
  }

  async function descargarTodos() {
    setOcupado(true);
    try {
      const carpeta = await elegirCarpeta({ directory: true, multiple: false, recursive: true, title: "Carpeta donde guardar los estados de cuenta" });
      if (typeof carpeta !== "string") return;
      const archivos = await armarArchivos();
      for (const a of archivos) await writeFile(await join(carpeta, a.nombre), a.bytes);
      if (archivos.length > 0) toast.success(archivos.length === 1 ? "1 estado de cuenta guardado" : `${archivos.length} estados de cuenta guardados`);
    } catch (e) {
      reportError(e, "Descargar estados de cuenta");
    } finally {
      setOcupado(false);
    }
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

  const marcadosEnOrden = arbol.map((n) => n.item).filter((f) => marcados?.has(f.asignacionId));
  const elegidos = marcadosEnOrden.filter((f) => f.numero);
  const total = data?.filas.length ?? 0;
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
              ? `Marca a quiénes (un jefe marca su rama). Copiar o Descargar saca todos de una vez; Empezar abre el chat de cada uno con teléfono para pegar el ${nombre} con Ctrl+V.`
              : terminado
                ? "Listo."
                : `${indice + 1} de ${cola.length}`}
          </DialogDescription>
        </DialogHeader>

        {!data || !marcados ? (
          <Cargando error={error} />
        ) : cola === null ? (
          <div className="space-y-2">
            <div className="max-h-[50vh] space-y-1 overflow-auto">
              <label className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-fila-hover">
                <Casilla
                  className="size-4"
                  checked={marcados.size === total && total > 0}
                  indeterminado={marcados.size > 0 && marcados.size < total}
                  onChange={() => setMarcados(marcados.size === total ? new Set() : new Set(data.filas.map((f) => f.asignacionId)))}
                  aria-label="Marcar todos"
                />
                <span className="flex-1">Todos</span>
              </label>
              {arbol.map(({ item: f, nivel, debajo, tieneHijos }) => {
                const estado = tieneHijos ? estadoRama(marcados, jefes, f.asignacionId) : marcados.has(f.asignacionId) ? "todo" : "nada";
                return (
                  <label
                    key={f.asignacionId}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-fila-hover"
                    style={{ paddingLeft: `calc(0.5rem + ${nivel * 1.25}rem)` }}
                  >
                    <Casilla
                      className="size-4"
                      checked={estado === "todo"}
                      indeterminado={estado === "parte"}
                      onChange={() => alternarFila(f.asignacionId, tieneHijos)}
                    />
                    <span className="flex-1">
                      {f.gerenteNombre}
                      {tieneHijos && <span className="ml-2 text-muted-foreground">· {debajo} debajo</span>}
                      {tieneHijos && estado === "parte" && !marcados.has(f.asignacionId) && <span className="ml-2 text-muted-foreground">(él no)</span>}
                    </span>
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
                );
              })}
            </div>
            {progreso && (
              <p className="text-sm text-muted-foreground">
                Preparando {Math.min(progreso.hechos + 1, progreso.total)} de {progreso.total}…
              </p>
            )}
            {fuera.length > 0 && <Aviso>Quedaron fuera por tener depósitos duplicados (resuélvelos o usa la imagen): {fuera.join(", ")}.</Aviso>}
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
              <>
                <Button variant="outline" disabled={ocupado || marcadosEnOrden.length === 0} onClick={() => void descargarTodos()}>
                  <Download />
                  Descargar ({marcadosEnOrden.length})
                </Button>
                <Button variant="outline" disabled={ocupado || marcadosEnOrden.length === 0} onClick={() => void copiarTodos()}>
                  <Copy />
                  Copiar ({marcadosEnOrden.length})
                </Button>
                <BotonConMotivo motivo={marcadosEnOrden.length > 0 && elegidos.length === 0 ? "Ninguno de los marcados tiene teléfono" : undefined}>
                  <Button disabled={ocupado || elegidos.length === 0} onClick={() => setCola(elegidos.map((f) => f.asignacionId))}>
                    <MessageCircle />
                    Empezar ({elegidos.length} con teléfono)
                  </Button>
                </BotonConMotivo>
              </>
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
      {enHoja && data && (
        <div aria-hidden className="pointer-events-none fixed top-0 -left-[10000px]">
          <HojaEstadoCuenta
            ref={hojaOculta}
            gerenteNombre={enHoja.gerenteNombre}
            campanaNombre={data.campana.nombre}
            fechaCorte={hoy}
            resumen={enHoja}
            filas={enHoja.filas}
          />
        </div>
      )}
      <GerenteFormDialog gerente={editar} open={editar !== null} onOpenChange={(o) => !o && setEditar(null)} />
    </Dialog>
  );
}
