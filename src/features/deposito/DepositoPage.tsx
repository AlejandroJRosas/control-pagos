import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { ImageDrop } from "@/components/ImageDrop";
import { getDb } from "@/db";
import { getAsignacion, type AsignacionDetalle } from "@/db/repos/asignaciones";
import { createDeposito, deleteDeposito, getDeposito, listBancosUsados, listCuentasDestinoUsadas, updateDeposito, type Deposito, type Duplicado } from "@/db/repos/depositos";
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import { registrarDepositoEnCampana } from "@/db/operaciones/destino";
import { actualizarDuplicado } from "@/db/operaciones/revision";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { todayIso } from "@/domain/dates";
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
import { tomarArchivos, useReceptorArchivos } from "@/lib/soltarArchivos";
import { receptorCampana, receptorCerrada } from "@/components/SoltarImagenes";
import { sugerenciasBancos } from "@/domain/bancos";
import { DepositoCampos } from "./DepositoCampos";
import { MotivoDuplicado } from "./DuplicadoBloqueo";
import { camposOcr, conExtraccion, depositoVacio, SIN_DESTINO, useDepositoForm, type DepositoFormState } from "./useDepositoForm";

/** `asignacion` es null al registrar desde la campaña: el gerente se elige (o se crea) en el formulario. */
/** Lo que el usuario puede cambiar; la tasa no cuenta porque se deriva de la fecha. */
const huella = (s: DepositoFormState, imagen: ImagenValue) =>
  JSON.stringify({ ...s.draft, tasaId: null, destino: s.destino, imagen: imagen?.kind === "stored" ? imagen.path : imagen ? imagen.previewUrl : null });

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
  const { pathname } = useLocation();
  const campana = data.campana;
  // Vuelve a la lista desde la que se abrió (con sus filtros); si no se sabe, al gerente o a la campaña.
  const volver =
    leerVolver(useLocation().state) ??
    (asignacion ? { to: `/asignaciones/${asignacion.id}`, label: asignacion.gerenteNombre } : { to: `/campanas/${campana.id}`, label: campana.nombre });
  const cerrada = campana.estado === "cerrada";
  const f = useDepositoForm({
    data,
    asignacion,
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
  const huellaInicial = useRef(huella(f.form, imagen));
  const aviso = useAvisoSinGuardar(!cerrada && huella(f.form, imagen) !== huellaInicial.current);

  // Mientras se busca la tasa de la fecha no se puede guardar: el depósito saldría sin tasa o con la anterior.
  const buscandoTasa = f.tasa === undefined;
  // Uno nuevo con el banco y la referencia de otro no se guarda: se actualiza el existente o se descarta.
  const duplicado = !deposito && f.duplicados.length > 0;
  useAtajo("Enter", () => void guardar(false), { ctrl: true, activo: !cerrada && !saving && !buscandoTasa && !duplicado });

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
      const fields = ajustarCuentaDestino(r.fields, await listCuentasDestinoUsadas(await getDb()));
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

  async function guardar(yNuevo: boolean) {
    if (buscandoTasa || duplicado) return;
    const r = f.validar();
    if (!r) return;
    setSaving(true);
    try {
      const db = await getDb();
      const v = { ...r.deposito, imagenPath: await persistImagen(imagen) };
      let asignacionId: number;
      if (deposito) {
        await updateDeposito(db, deposito.id, v);
        asignacionId = deposito.asignacionId;
      } else if (r.destino) {
        asignacionId = await registrarDepositoEnCampana(db, campana.id, r.destino, v);
      } else {
        await createDeposito(db, asignacion!.id, v);
        asignacionId = asignacion!.id;
      }
      toast.success(deposito ? "Depósito actualizado" : "Depósito registrado");
      if (yNuevo) {
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
          deposito && !cerrada ? (
            <Button variant="outline" className="text-destructive" onClick={() => void eliminar()}>
              <Trash2 />
              Eliminar
            </Button>
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
    </div>
  );
}
