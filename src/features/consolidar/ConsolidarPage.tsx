import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { FileUp, Merge } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { getDb } from "@/db";
import { nowIso } from "@/db/clock";
import { listCampanas, type Campana } from "@/db/repos/campanas";
import { loadCampanaData } from "@/db/queries/campanaData";
import { aplicarConsolidacion, cargarLocal, emparejamientoInicial, emparejarGerentesDe } from "@/db/operaciones/consolidar";
import {
  clasificar, decisionesIniciales, motivoPendiente, type Decisiones, type Eleccion, type EstadoEmparejamiento, type GerenteEmparejado,
} from "@/domain/consolidar";
import { mensajeConsolidado, resumenConsolidacion, tasaParaFecha, type CambioGerente } from "@/domain/consolidarResumen";
import { formatFecha, formatFechaHora } from "@/domain/dates";
import { formatTasa, formatUsd } from "@/domain/money";
import type { Paquete } from "@/domain/paquete";
import { invalidate, useData } from "@/hooks/useData";
import { errorMessage, reportError } from "@/lib/reportError";
import { rutaConsolidar } from "@/lib/rutaConsolidar";
import { abrirPaqueteDeDialogo, importarImagenRecibida, leerPaqueteDeCarpeta } from "@/platform/paquete";
import { respaldoAntesDe } from "@/platform/backup";
import { Correcciones, Diferencias, Eliminaciones, Nuevos, NoIncluidos } from "./Secciones";

type Inicial = { campanaId: number | null; estadoCampana: EstadoEmparejamiento; gerentes: Record<string, GerenteEmparejado> };

/** Lo que eligió el usuario sobre las decisiones por defecto del plan (se conserva al volver a clasificar). */
type Elecciones = { tasas: Record<string, Eleccion>; saldos: Record<number, Eleccion>; conflictos: Record<string, Eleccion>; noEliminar: ReadonlySet<string> };
const SIN_ELECCIONES: Elecciones = { tasas: {}, saldos: {}, conflictos: {}, noEliminar: new Set() };

const NO_INCLUIR = "no";

/** Revisa un paquete `.cpagos` recibido y lo aplica a una campaña: nada se escribe hasta confirmar. */
export function ConsolidarPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const carpeta = params.get("carpeta") ?? "";
  const sugerida = Number(params.get("campana")) || null;
  const { data, error } = useData(
    async (db) => {
      const paquete = await leerPaqueteDeCarpeta(carpeta);
      return { paquete, campanas: await listCampanas(db), inicial: await emparejamientoInicial(db, paquete, sugerida) };
    },
    [carpeta, sugerida],
  );

  async function abrirOtro() {
    try {
      const otra = await abrirPaqueteDeDialogo();
      if (otra) navigate(rutaConsolidar(otra, sugerida));
    } catch (e) {
      reportError(e);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader migas={[{ to: "/campanas", label: "Campañas" }]} title="Consolidar" />
        <Aviso tono="warning">{errorMessage(error)}</Aviso>
        <Button variant="outline" onClick={() => void abrirOtro()}>
          <FileUp />
          Abrir otro archivo
        </Button>
      </div>
    );
  }
  if (!data) return <Cargando />;
  // La clave reinicia lo elegido si se abre otro paquete; al recargar los datos (invalidate) se conserva.
  return <Consolidar key={carpeta} carpeta={carpeta} paquete={data.paquete} campanas={data.campanas} inicial={data.inicial} />;
}

function Consolidar({ carpeta, paquete, campanas, inicial }: { carpeta: string; paquete: Paquete; campanas: Campana[]; inicial: Inicial }) {
  const navigate = useNavigate();
  const [campanaId, setCampanaId] = useState(inicial.campanaId);
  const [gerentes, setGerentes] = useState(inicial.gerentes);
  const [elecciones, setElecciones] = useState<Elecciones>(SIN_ELECCIONES);
  const [ocupado, setOcupado] = useState(false);
  const mostrarCampana = inicial.estadoCampana !== "recordado";

  const { data: datos, error } = useData(
    async (db) => (campanaId === null ? null : { local: await cargarLocal(db, campanaId), base: await loadCampanaData(db, campanaId) }),
    [campanaId],
  );
  const plan = useMemo(() => (datos ? clasificar(paquete, datos.local, gerentes) : null), [paquete, datos, gerentes]);
  const d = useMemo<Decisiones | null>(() => {
    if (!plan) return null;
    const ini = decisionesIniciales(plan);
    return {
      tasas: { ...ini.tasas, ...elecciones.tasas },
      saldos: { ...ini.saldos, ...elecciones.saldos },
      conflictos: { ...ini.conflictos, ...elecciones.conflictos },
      eliminar: new Set([...ini.eliminar].filter((u) => !elecciones.noEliminar.has(u))),
    };
  }, [plan, elecciones]);

  const campana = campanas.find((c) => c.id === campanaId) ?? null;
  const asignaciones = datos?.local.asignaciones ?? [];
  const nombreDe = (id: number) => asignaciones.find((a) => a.id === id)?.gerenteNombre ?? "";
  const resumen = useMemo(() => (datos && plan && d ? resumenConsolidacion(datos.base, plan, d, datos.local.tasas) : []), [datos, plan, d]);
  const nombres = useMemo(() => Object.fromEntries(paquete.asignaciones.map((a) => [a.uuid, a.gerente.nombre])), [paquete]);
  const motivo = !plan || !d ? "Elige en qué campaña consolidar el archivo" : motivoPendiente(plan, gerentes, d, nombres);

  async function elegirCampana(valor: string) {
    const id = Number(valor) || null;
    try {
      const nuevos = id === null ? {} : await emparejarGerentesDe(await getDb(), paquete, id);
      setGerentes(nuevos);
      setElecciones(SIN_ELECCIONES);
      setCampanaId(id);
    } catch (e) {
      reportError(e);
    }
  }

  function elegirGerente(uuid: string, valor: string) {
    setGerentes((g) => ({ ...g, [uuid]: { asignacionId: valor === "" ? undefined : valor === NO_INCLUIR ? null : Number(valor), estado: "elegido" } }));
    // Lo elegido sobre los montos asignados era de otro emparejamiento.
    setElecciones((x) => ({ ...x, saldos: {} }));
  }

  const elegir = <K extends "tasas" | "saldos" | "conflictos">(k: K, clave: string | number, e: Eleccion) =>
    setElecciones((x) => ({ ...x, [k]: { ...x[k], [clave]: e } }));

  function marcarEliminar(uuids: string[], marcar: boolean) {
    setElecciones((x) => {
      const noEliminar = new Set(x.noEliminar);
      for (const u of uuids) {
        if (marcar) noEliminar.delete(u);
        else noEliminar.add(u);
      }
      return { ...x, noEliminar };
    });
  }

  async function consolidar() {
    if (!plan || !d || motivo) return;
    setOcupado(true);
    try {
      const db = await getDb();
      await respaldoAntesDe(db, "consolidar");
      const r = await aplicarConsolidacion(db, paquete, plan, gerentes, d, { importarImagen: (n) => importarImagenRecibida(carpeta, n), ahora: nowIso() });
      invalidate();
      toast.success(mensajeConsolidado(r));
      navigate(`/campanas/${plan.campana.id}`);
    } catch (e) {
      reportError(e);
      setOcupado(false);
    }
  }

  const porDecidir = paquete.asignaciones.filter((a) => gerentes[a.uuid] && gerentes[a.uuid].estado !== "recordado");
  /** Las asignaciones que ya tiene otro gerente del archivo no se ofrecen: el emparejamiento es uno a uno. */
  const opcionesGerente = (uuid: string) => [
    ...asignaciones
      .filter((a) => !Object.entries(gerentes).some(([otro, g]) => otro !== uuid && g.asignacionId === a.id))
      .map((a) => ({ value: String(a.id), label: a.gerenteNombre })),
    { value: NO_INCLUIR, label: "No incluir" },
  ];
  const valorGerente = (g: GerenteEmparejado) => (g.asignacionId === undefined ? "" : g.asignacionId === null ? NO_INCLUIR : String(g.asignacionId));
  const discretos = plan
    ? [
        plan.sinCambios > 0 && `Sin cambios: ${plan.sinCambios}`,
        plan.vinculos.length > 0 && `Ya lo tienes: ${plan.vinculos.length}`,
        plan.masNuevasAqui.length > 0 && `Tu versión es más nueva: ${plan.masNuevasAqui.length}`,
      ].filter((x): x is string => !!x)
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        migas={[{ to: "/campanas", label: "Campañas" }, ...(campana ? [{ to: `/campanas/${campana.id}`, label: campana.nombre }] : [])]}
        back={campana ? { to: `/campanas/${campana.id}`, label: campana.nombre } : undefined}
        title="Consolidar"
        subtitle={`Paquete de ${paquete.origen} · creado el ${formatFechaHora(paquete.creadoEn)} · campaña ${paquete.campana.nombre}`}
      />

      {(mostrarCampana || porDecidir.length > 0) && (
        <Card role="region" aria-label="Emparejamientos" className="px-4">
          <h2 className="text-base font-semibold">Emparejamientos</h2>
          <div className="grid max-w-2xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            {mostrarCampana && (
              <>
                <label htmlFor="consolidar-campana">Campaña {paquete.campana.nombre} es…</label>
                <BuscadorSelect
                  id="consolidar-campana"
                  value={campanaId === null ? "" : String(campanaId)}
                  onChange={(v) => void elegirCampana(v)}
                  opciones={campanas.map((c) => ({ value: String(c.id), label: c.nombre, detalle: c.estado === "cerrada" ? "Cerrada" : undefined }))}
                  placeholder="Elige la campaña…"
                />
              </>
            )}
            {campanaId !== null &&
              porDecidir.map((a) => (
                <div key={a.uuid} className="col-span-2 grid grid-cols-subgrid items-center">
                  <label htmlFor={`consolidar-${a.uuid}`}>{a.gerente.nombre} es…</label>
                  <BuscadorSelect
                    id={`consolidar-${a.uuid}`}
                    value={valorGerente(gerentes[a.uuid])}
                    onChange={(v) => elegirGerente(a.uuid, v)}
                    opciones={opcionesGerente(a.uuid)}
                    placeholder="Elige el gerente…"
                  />
                </div>
              ))}
          </div>
        </Card>
      )}

      {campanaId !== null && !plan && <Cargando error={error} />}
      {plan && d && (
        <>
          {plan.campana.estado === "cerrada" && <Aviso tono="warning">La campaña {plan.campana.nombre} está cerrada: reábrela para consolidar.</Aviso>}
          {plan.nuevos.length > 0 && <Nuevos plan={plan} carpeta={carpeta} nombreDe={nombreDe} tasaDe={(f) => tasaParaFecha(plan, d, datos!.local.tasas, f)} />}
          {plan.correcciones.length > 0 && <Correcciones plan={plan} nombreDe={nombreDe} />}
          {plan.eliminaciones.length > 0 && (
            <Eliminaciones plan={plan} origen={paquete.origen} eliminar={d.eliminar} nombreDe={nombreDe} onMarcar={marcarEliminar} />
          )}
          {plan.tasasDistintas.length + plan.saldos.length + plan.conflictos.length > 0 && (
            <Diferencias
              plan={plan}
              d={d}
              nombreDe={nombreDe}
              onTasa={(f, e) => elegir("tasas", f, e)}
              onSaldo={(id, e) => elegir("saldos", id, e)}
              onConflicto={(u, e) => elegir("conflictos", u, e)}
            />
          )}
          {plan.noIncluidos.length > 0 && <NoIncluidos plan={plan} />}
          {plan.tasasNuevas.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Se registra{plan.tasasNuevas.length === 1 ? " la tasa" : "n las tasas"} del archivo:{" "}
              {plan.tasasNuevas.map((t) => `${formatFecha(t.fecha)} (${formatTasa(t.valor)})`).join(", ")}.
            </p>
          )}
          {discretos.length > 0 && <p className="text-sm text-muted-foreground">{discretos.join(" · ")}</p>}
        </>
      )}

      <Card className="px-4">
        {resumen.length > 0 && <ResumenCambios filas={resumen} />}
        <div className="flex justify-end">
          <BotonConMotivo motivo={ocupado ? undefined : (motivo ?? undefined)}>
            <Button disabled={ocupado || !!motivo} onClick={() => void consolidar()}>
              <Merge />
              {ocupado ? "Consolidando…" : "Consolidar"}
            </Button>
          </BotonConMotivo>
        </div>
      </Card>
    </div>
  );
}

function ResumenCambios({ filas }: { filas: CambioGerente[] }) {
  return (
    <div>
      <h2 className="mb-1 text-base font-semibold">Cómo quedan los gerentes</h2>
      <ul className="text-sm">
        {filas.map((f) => (
          <li key={f.asignacionId} className="flex flex-wrap gap-x-3">
            <span className="font-medium">{f.gerenteNombre}</span>
            <span className="tabular-nums">
              Pagado {formatUsd(f.antes.pagado)} → {formatUsd(f.despues.pagado)}
            </span>
            {f.antes.asignado !== f.despues.asignado && (
              <span className="tabular-nums">
                Asignado {formatUsd(f.antes.asignado)} → {formatUsd(f.despues.asignado)}
              </span>
            )}
            <span className="tabular-nums text-muted-foreground">Restante {formatUsd(f.despues.restante)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
