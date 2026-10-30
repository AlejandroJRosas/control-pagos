import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { Field } from "@/components/Field";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImageDrop } from "@/components/ImageDrop";
import { getDb } from "@/db";
import { getAsignacion, type AsignacionDetalle } from "@/db/repos/asignaciones";
import { createDeposito, deleteDeposito, getDeposito, listBancosUsados, listCuentasDestinoUsadas, updateDeposito, type Deposito, type Duplicado } from "@/db/repos/depositos";
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import { aliasCuentas } from "@/db/repos/cuentasAlias";
import { registrarDepositoEnCampana } from "@/db/operaciones/destino";
import { actualizarDuplicado } from "@/db/operaciones/revision";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { todayIso } from "@/domain/dates";
import { destinosPara } from "@/domain/moverDepositos";
import { DomainError } from "@/domain/errors";
import { toInputVE } from "@/domain/money";
import type { DepositoDraft } from "@/domain/validation";
import { extractor } from "@/extraction/extractor";
import { ajustarCuentaDestino } from "@/extraction/cuentaConocida";
import { autollenadoExistente, autollenadoNuevo } from "@/extraction/autollenado";
import { persistImagen, type ImagenValue } from "@/platform/images";
import { invalidate, useData } from "@/hooks/useData";
import { useAvisoSinGuardar } from "@/hooks/useAvisoSinGuardar";
import { useAtajo } from "@/hooks/useAtajo";
import { reportError } from "@/lib/reportError";
import { avisarDepositosEliminados } from "@/lib/deshacer";
import { leerVolver } from "@/lib/volver";
import { leerRecorrido, vecinos } from "@/lib/recorrido";
import { tomarArchivos, useReceptorArchivos } from "@/lib/soltarArchivos";
import { receptorCampana, receptorCerrada } from "@/components/SoltarImagenes";
import { sugerenciasBancos } from "@/domain/bancos";
import { DepositoCampos } from "./DepositoCampos";
import { MotivoDuplicado } from "./DuplicadoBloqueo";
import { camposOcr, conExtraccion, depositoVacio, SIN_DESTINO, useDepositoForm, type DepositoFormState } from "./useDepositoForm";

/** `asignacion` es null al registrar desde la campaña: el gerente se elige (o se crea) en el formulario. */
/** Lo que el usuario puede cambiar; la tasa no cuenta porque se deriva de la fecha. `gerente`: a quién se pasa uno existente. */
const huella = (s: DepositoFormState, imagen: ImagenValue, gerente?: number) =>
  JSON.stringify({ ...s.draft, tasaId: null, destino: s.destino, imagen: imagen?.kind === "stored" ? imagen.path : imagen ? imagen.previewUrl : null, gerente });

type Ctx = { deposito: Deposito | null; asignacion: AsignacionDetalle | null; data: CampanaData; bancos: string[]; gerentes: Gerente[] };

export function DepositoPage() {
  const { depositoId, asignacionId, campanaId } = useParams();
  const { data: ctx, error } = useData<Ctx>(
    async (db) => {
      if (campanaId) {
        const data = await loadCampanaData(db, Number(campanaId));
        return { deposito: null, asignacion: null, data, bancos: sugerenciasBancos(await listBancosUsados(db)), gerentes: await listGerentes(db) };
      }
      const deposito = depositoId ? await getDeposito(db, Number(depositoId)) : null;
      if (depositoId && !deposito) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
      const asignacion = await getAsignacion(db, deposito?.asignacionId ?? Number(asignacionId));
      if (!asignacion) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
      const data = await loadCampanaData(db, asignacion.campanaId);
      return { deposito, asignacion, data, bancos: sugerenciasBancos(await listBancosUsados(db)), gerentes: [] };
    },
    [depositoId, asignacionId, campanaId],
  );

  if (!ctx) return <Cargando error={error} />;
  return <DepositoForm key={`${depositoId ?? "nuevo"}-${asignacionId ?? ""}-${campanaId ?? ""}`} {...ctx} />;
}

function DepositoForm({ deposito, asignacion, data, bancos, gerentes }: Ctx) {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const campana = data.campana;
  // Vuelve a la lista desde la que se abrió (con sus filtros); si no se sabe, al gerente o a la campaña.
  const volver =
    leerVolver(location.state) ??
    (asignacion ? { to: `/asignaciones/${asignacion.id}`, label: asignacion.gerenteNombre } : { to: `/campanas/${campana.id}`, label: campana.nombre });
  const cerrada = campana.estado === "cerrada";
  // ← / → recorren la lista desde la que se abrió (fija mientras se recorre: un depósito movido no la corre).
  const recorrido = leerRecorrido(location.state);
  const lugar = deposito && recorrido ? vecinos(recorrido, deposito.id) : null;
  // Uno existente se puede pasar a otro gerente de la campaña: primero la gente de su estructura.
  const [gerente, setGerente] = useState(deposito ? asignacion?.id : undefined);
  const opcionesGerente = useMemo(
    () =>
      deposito && asignacion
        ? [
            { value: String(asignacion.id), label: asignacion.gerenteNombre, detalle: "Actual" },
            ...destinosPara(data.asignaciones, [asignacion.id]).map((d) => ({
              value: String(d.id),
              label: d.gerenteNombre,
              detalle: d.equipo ? "De su equipo" : undefined,
            })),
          ]
        : [],
    [deposito, asignacion, data.asignaciones],
  );
  const elegido = data.asignaciones.find((a) => a.id === gerente);
  // Los saldos del formulario son los del gerente elegido.
  const asignacionForm = asignacion && elegido && elegido.id !== asignacion.id ? { ...asignacion, id: elegido.id, gerenteNombre: elegido.gerenteNombre } : asignacion;
  const f = useDepositoForm({
    data,
    asignacion: asignacionForm,
    depositoId: deposito?.id,
    inicial: () => {
      if (!deposito) return { draft: depositoVacio(todayIso()), auto: autollenadoNuevo(), destino: SIN_DESTINO };
      const draft: DepositoDraft = {
        fecha: deposito.fecha,
        banco: deposito.banco,
        referencia: deposito.referencia,
        cuentaDestino: deposito.cuentaDestino,
        montoBs: toInputVE(deposito.montoBs),
        tasaId: deposito.tasaId,
        observaciones: deposito.observaciones ?? "",
      };
      return { draft, auto: autollenadoExistente(camposOcr(draft)), destino: SIN_DESTINO };
    },
  });
  const draft = f.form.draft;
  // Fecha con la que arrancó el formulario: a ella vuelve la fecha si se quita la imagen que la llenó.
  const fechaInicial = useRef(draft.fecha);
  // Imagen cuya lectura sigue vigente; un resultado de otra imagen se descarta.
  const imagenVigente = useRef<Blob | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [imagen, setImagen] = useState<ImagenValue>(deposito?.imagenPath ? { kind: "stored", path: deposito.imagenPath } : null);
  const [tasaDialog, setTasaDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const huellaInicial = useRef(huella(f.form, imagen, gerente));
  const sucio = !cerrada && huella(f.form, imagen, gerente) !== huellaInicial.current;
  const aviso = useAvisoSinGuardar(sucio);
  // Al pasar a otro depósito con cambios: a cuál se quería ir.
  const [preguntarIr, setPreguntarIr] = useState<number | null>(null);

  // Mientras se busca la tasa de la fecha no se puede guardar: el depósito saldría sin tasa o con la anterior.
  const buscandoTasa = f.tasa === undefined;
  // Uno nuevo con el banco y la referencia de otro no se guarda: se actualiza el existente o se descarta.
  const duplicado = !deposito && f.duplicados.length > 0;
  useAtajo("Enter", () => void guardar(false), { ctrl: true, activo: !cerrada && !saving && !buscandoTasa && !duplicado });
  useAtajo("ArrowLeft", () => pedirIr(lugar?.anterior ?? null), { activo: lugar?.anterior != null && !saving });
  useAtajo("ArrowRight", () => pedirIr(lugar?.siguiente ?? null), { activo: lugar?.siguiente != null && !saving });

  /** Al anterior o siguiente de la lista; con cambios sin guardar, primero pregunta. */
  function pedirIr(id: number | null) {
    if (id === null) return;
    if (sucio) setPreguntarIr(id);
    else irA(id);
  }

  function irA(id: number) {
    aviso.permitirSalida();
    navigate(`/depositos/${id}`, { state: location.state, replace: true });
  }

  // Una imagen soltada en cualquier parte es el comprobante; varias se van a la subida en lote de la campaña.
  const lote = receptorCampana(navigate, { id: campana.id, nombre: campana.nombre, asignacionId: asignacion?.id });
  useReceptorArchivos(
    cerrada
      ? receptorCerrada(campana.nombre)
      : {
          destino: (n) => (n === 1 ? "Suelta para usar la imagen como comprobante" : lote.destino(n)),
          recibir: (files) => (files.length === 1 ? usarArchivo(files[0]) : lote.recibir?.(files)),
        },
  );
  // La imagen que se soltó en otra pantalla para abrir este registro.
  useEffect(() => {
    const [file] = tomarArchivos(pathname);
    if (file && !cerrada) usarArchivo(file);
    // Solo al abrir el formulario.
  }, []);

  function usarArchivo(file: File) {
    if (imagen?.kind === "new") URL.revokeObjectURL(imagen.previewUrl);
    void onImagen({ kind: "new", file, previewUrl: URL.createObjectURL(file) });
  }

  async function onImagen(v: ImagenValue) {
    setImagen(v);
    const file = v?.kind === "new" ? v.file : null;
    imagenVigente.current = file;
    // Lo que puso la imagen anterior se quita de inmediato, no al terminar de leer la nueva.
    f.setForm((s) => conExtraccion(s, {}, fechaInicial.current));
    if (!file) {
      setLeyendo(false);
      return;
    }
    setLeyendo(true);
    try {
      const r = await extractor.extraerDeposito(file);
      const db = await getDb();
      const fields = ajustarCuentaDestino(r.fields, await listCuentasDestinoUsadas(db), await aliasCuentas(db));
      if (imagenVigente.current !== file) return;
      f.setForm((s) => conExtraccion(s, fields, fechaInicial.current));
      if (r.formato === null) toast.info("No se reconoció el formato del comprobante; completa los datos a mano");
    } catch (e) {
      if (imagenVigente.current === file) reportError(e, "Lectura del comprobante");
    } finally {
      if (imagenVigente.current === file) setLeyendo(false);
    }
  }

  /** Deja el formulario vacío para el siguiente, con la misma fecha (y el mismo gerente si se indica). */
  function reiniciar(asignacionId: number | null) {
    if (imagen?.kind === "new") URL.revokeObjectURL(imagen.previewUrl);
    fechaInicial.current = draft.fecha;
    const siguiente: DepositoFormState = {
      draft: { ...depositoVacio(draft.fecha), tasaId: draft.tasaId },
      auto: autollenadoNuevo(),
      destino: asignacion || asignacionId === null ? SIN_DESTINO : { ...SIN_DESTINO, sel: `a:${asignacionId}` },
    };
    huellaInicial.current = huella(siguiente, null);
    f.reiniciar(siguiente);
    imagenVigente.current = null;
    setLeyendo(false);
    setImagen(null);
  }

  function descartar() {
    reiniciar(null);
    toast.success("Depósito descartado");
  }

  async function actualizarExistente(d: Duplicado) {
    if (buscandoTasa) return;
    const r = f.validar();
    if (!r) return;
    setSaving(true);
    try {
      await actualizarDuplicado(await getDb(), d.id, { ...r.deposito, imagenPath: await persistImagen(imagen) });
      toast.success(`Depósito de ${d.gerenteNombre} actualizado`);
      reiniciar(null);
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  /** `ir`: después de guardar, el depósito de la lista al que se pasa. */
  async function guardar(yNuevo: boolean, ir?: number) {
    if (buscandoTasa || duplicado) return;
    const r = f.validar();
    if (!r) return;
    setSaving(true);
    try {
      const db = await getDb();
      const v = { ...r.deposito, imagenPath: await persistImagen(imagen) };
      let asignacionId: number;
      if (deposito) {
        const otro = gerente !== undefined && gerente !== deposito.asignacionId ? gerente : undefined;
        await updateDeposito(db, deposito.id, v, otro === undefined ? undefined : { asignacionId: otro });
        asignacionId = otro ?? deposito.asignacionId;
      } else if (r.destino) {
        asignacionId = await registrarDepositoEnCampana(db, campana.id, r.destino, v);
      } else {
        await createDeposito(db, asignacion!.id, v);
        asignacionId = asignacion!.id;
      }
      const movido = deposito && asignacionId !== deposito.asignacionId ? elegido?.gerenteNombre : undefined;
      toast.success(movido ? `Depósito movido a ${movido}` : deposito ? "Depósito actualizado" : "Depósito registrado");
      if (ir !== undefined) {
        irA(ir);
        invalidate();
      } else if (yNuevo) {
        reiniciar(asignacionId);
        invalidate();
      } else {
        aviso.permitirSalida();
        navigate(volver.to);
        invalidate();
      }
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    if (!deposito) return;
    try {
      avisarDepositosEliminados(await deleteDeposito(await getDb(), deposito.id));
      aviso.permitirSalida();
      navigate(volver.to, { replace: true });
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        migas={[
          { to: "/campanas", label: "Campañas" },
          { to: `/campanas/${campana.id}`, label: campana.nombre },
          ...(asignacion ? [{ to: `/asignaciones/${asignacion.id}`, label: asignacion.gerenteNombre }] : []),
        ]}
        back={volver}
        title={deposito ? "Editar depósito" : "Registrar depósito"}
        subtitle={asignacion ? `${asignacion.gerenteNombre} · ${asignacion.campanaNombre}` : `Campaña ${campana.nombre}`}
        actions={
          deposito && (lugar || !cerrada) ? (
            <>
              {lugar && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Button variant="ghost" size="icon" aria-label="Depósito anterior" title="←" disabled={lugar.anterior === null} onClick={() => pedirIr(lugar.anterior)}>
                    <ChevronLeft />
                  </Button>
                  <span className="tabular-nums">
                    {lugar.posicion} de {lugar.total}
                  </span>
                  <Button variant="ghost" size="icon" aria-label="Depósito siguiente" title="→" disabled={lugar.siguiente === null} onClick={() => pedirIr(lugar.siguiente)}>
                    <ChevronRight />
                  </Button>
                </div>
              )}
              {!cerrada && (
                <Button variant="outline" className="text-destructive" onClick={() => void eliminar()}>
                  <Trash2 />
                  Eliminar
                </Button>
              )}
            </>
          ) : null
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: el depósito no se puede modificar.</Aviso>}

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
        <ImageDrop
          label="Comprobante"
          value={imagen}
          onChange={onImagen}
          pasteEnabled={!tasaDialog}
          disabled={cerrada}
          className="sticky top-4 h-[min(calc(100vh-11rem),40rem)] min-h-80"
        />

        <form
          className="grid content-start gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(false);
          }}
        >
          {leyendo && <p className="text-sm text-muted-foreground">Leyendo comprobante…</p>}
          {deposito && asignacion && (
            <Field id="d-gerente" label="Gerente" hint={gerente !== asignacion.id ? `Al guardar pasa de ${asignacion.gerenteNombre} a ${elegido?.gerenteNombre}` : undefined}>
              <BuscadorSelect
                id="d-gerente"
                value={String(gerente)}
                onChange={(v) => v && setGerente(Number(v))}
                opciones={opcionesGerente}
                disabled={cerrada || saving}
              />
            </Field>
          )}
          <DepositoCampos
            f={f}
            data={data}
            asignacion={asignacion}
            gerentes={gerentes}
            bancos={bancos}
            disabled={cerrada || saving}
            onTasaDialog={setTasaDialog}
            duplicado={deposito ? undefined : { onActualizar: (d) => void actualizarExistente(d), onDescartar: descartar, ocupado: cerrada || saving }}
          />

          <div className="flex flex-wrap justify-end gap-2">
            {duplicado && <MotivoDuplicado className="mr-auto" />}
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            {!deposito && (
              <Button type="button" variant="secondary" disabled={cerrada || saving || buscandoTasa || duplicado} onClick={() => void guardar(true)}>
                {saving ? "Guardando…" : "Guardar y nuevo"}
              </Button>
            )}
            <Button type="submit" disabled={cerrada || saving || buscandoTasa || duplicado} title="Ctrl+Enter">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </div>

      {aviso.dialogo}
      <AlertDialog open={preguntarIr !== null} onOpenChange={(o) => !o && setPreguntarIr(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>Este depósito tiene cambios sin guardar. Puedes guardarlos antes de pasar al otro o descartarlos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const id = preguntarIr;
                setPreguntarIr(null);
                if (id !== null) irA(id);
              }}
            >
              No guardar
            </Button>
            <Button
              autoFocus
              disabled={saving || buscandoTasa || duplicado}
              onClick={() => {
                const id = preguntarIr;
                setPreguntarIr(null);
                if (id !== null) void guardar(false, id);
              }}
            >
              {saving ? "Guardando…" : "Guardar y seguir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
