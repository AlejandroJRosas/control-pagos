import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { ImageDrop } from "@/components/ImageDrop";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { getAsignacion, type AsignacionDetalle } from "@/db/repos/asignaciones";
import { createDeposito, deleteDeposito, getDeposito, listBancosUsados, updateDeposito, type Deposito } from "@/db/repos/depositos";
import { listGerentes, type Gerente } from "@/db/repos/gerentes";
import { registrarDepositoEnCampana } from "@/db/operaciones/destino";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { todayIso } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { toInputVE } from "@/domain/money";
import type { DepositoDraft } from "@/domain/validation";
import { extractor } from "@/extraction/extractor";
import { autollenadoExistente, autollenadoNuevo } from "@/extraction/autollenado";
import { persistImagen, type ImagenValue } from "@/platform/images";
import { invalidate, useData } from "@/hooks/useData";
import { useAvisoSinGuardar } from "@/hooks/useAvisoSinGuardar";
import { reportError } from "@/lib/reportError";
import { sugerenciasBancos } from "./bancos";
import { DepositoCampos } from "./DepositoCampos";
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
  const campana = data.campana;
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const huellaInicial = useRef(huella(f.form, imagen));
  const aviso = useAvisoSinGuardar(!cerrada && huella(f.form, imagen) !== huellaInicial.current);

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
      if (imagenVigente.current !== file) return;
      f.setForm((s) => conExtraccion(s, r.fields, fechaInicial.current));
      if (r.formato === null) toast.info("No se reconoció el formato del comprobante; completa los datos a mano");
    } catch (e) {
      if (imagenVigente.current === file) reportError(e, "Lectura del comprobante");
    } finally {
      if (imagenVigente.current === file) setLeyendo(false);
    }
  }

  async function guardar(yNuevo: boolean) {
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
        if (imagen?.kind === "new") URL.revokeObjectURL(imagen.previewUrl);
        fechaInicial.current = draft.fecha;
        const siguiente: DepositoFormState = {
          draft: { ...depositoVacio(draft.fecha), tasaId: draft.tasaId },
          auto: autollenadoNuevo(),
          destino: asignacion ? SIN_DESTINO : { ...SIN_DESTINO, sel: `a:${asignacionId}` },
        };
        huellaInicial.current = huella(siguiente, null);
        f.reiniciar(siguiente);
        imagenVigente.current = null;
        setLeyendo(false);
        setImagen(null);
        invalidate();
      } else {
        aviso.permitirSalida();
        navigate(asignacion ? `/asignaciones/${asignacionId}` : `/campanas/${campana.id}`);
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
      await deleteDeposito(await getDb(), deposito.id);
      toast.success("Depósito eliminado");
      aviso.permitirSalida();
      navigate(`/asignaciones/${deposito.asignacionId}`, { replace: true });
      invalidate();
    } catch (e) {
      reportError(e);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        back={asignacion ? { to: `/asignaciones/${asignacion.id}`, label: asignacion.gerenteNombre } : { to: `/campanas/${campana.id}`, label: campana.nombre }}
        title={deposito ? "Editar depósito" : "Registrar depósito"}
        subtitle={asignacion ? `${asignacion.gerenteNombre} · ${asignacion.campanaNombre}` : `Campaña ${campana.nombre}`}
        actions={
          deposito && !cerrada ? (
            <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Eliminar
            </Button>
          ) : null
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: el depósito no se puede modificar.</Aviso>}

      <div className="grid grid-cols-2 gap-6">
        <ImageDrop
          label="Comprobante"
          value={imagen}
          onChange={onImagen}
          pasteEnabled={!tasaDialog}
          disabled={cerrada}
          className="h-[calc(100vh-11rem)] min-h-96"
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
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            {!deposito && (
              <Button type="button" variant="secondary" disabled={cerrada || saving} onClick={() => void guardar(true)}>
                Guardar y nuevo
              </Button>
            )}
            <Button type="submit" disabled={cerrada || saving}>
              Guardar
            </Button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar depósito"
        description="El depósito se eliminará y los saldos se recalcularán."
        confirmLabel="Eliminar"
        destructive
        onConfirm={eliminar}
      />
      {aviso.dialogo}
    </div>
  );
}
