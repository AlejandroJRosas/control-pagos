import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Check, Images, SkipForward, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Aviso, Cargando, Vacio } from "@/components/Feedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { descartarTasa, guardarBorradorTasa, listColaTasas, quitarHechosTasas, type BorradorTasa, type ItemColaTasa } from "@/db/repos/cola";
import { completarTasa } from "@/db/operaciones/revision";
import { siguientePendiente } from "@/domain/cola";
import { formatFecha, isValidIsoDate } from "@/domain/dates";
import { validateTasa, type TasaDraft } from "@/domain/validation";
import { marcarTocado } from "@/extraction/autollenado";
import { deleteImage } from "@/platform/images";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { TasaCampos } from "@/features/tasas/TasaCampos";
import { ListaCola, RevisionLayout, type Filtro } from "./RevisionLayout";
import { useAutoguardado } from "./useAutoguardado";

export function RevisionTasasPage() {
  const { data: items, error } = useData((db) => listColaTasas(db), []);
  if (!items) return <Cargando error={error} />;
  return <Revision items={items} />;
}

function Revision({ items }: { items: ItemColaTasa[] }) {
  const [actualId, setActualId] = useState<number | null>(() => siguientePendiente(items, null) ?? items[0]?.id ?? null);
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const actual = items.find((i) => i.id === actualId) ?? null;
  const hechos = items.filter((i) => i.estado === "hecho").length;

  async function quitarHechos() {
    try {
      const n = await quitarHechosTasas(await getDb());
      toast.success(`${n} hecho(s) quitados de la cola`);
      if (actual?.estado === "hecho") setActualId(siguientePendiente(items, null));
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <RevisionLayout
      back={{ to: "/tasas", label: "Tasas" }}
      titulo="Revisión de tasas"
      hechos={hechos}
      total={items.length}
      acciones={
        <>
          <Button variant="outline" disabled={hechos === 0} onClick={() => void quitarHechos()}>
            Quitar hechos
          </Button>
          <Link to="/tasas/lote" className={buttonVariants({ variant: "outline" })}>
            <Images />
            Subir más
          </Link>
        </>
      }
      lista={
        <ListaCola
          items={items.map((i) => ({
            id: i.id,
            estado: i.estado,
            titulo: isValidIsoDate(i.borrador.draft.fecha) ? formatFecha(i.borrador.draft.fecha) : "Sin fecha",
            detalle: `${i.borrador.draft.valor || "sin valor"} · ${i.nombreArchivo ?? `#${i.orden}`}`,
          }))}
          actualId={actualId}
          onElegir={setActualId}
          filtro={filtro}
          onFiltro={setFiltro}
        />
      }
      imagenPath={actual?.imagenPath ?? null}
    >
      {actual ? (
        <EditorTasa
          key={actual.id}
          item={actual}
          onSiguiente={() => setActualId(siguientePendiente(items, actual.id))}
          onSaltar={() => setActualId(siguientePendiente(items, actual.id) ?? actual.id)}
        />
      ) : (
        <Vacio texto="No quedan tasas por revisar.">
          <Link to="/tasas" className={buttonVariants({ variant: "outline" })}>
            Volver a Tasas
          </Link>
        </Vacio>
      )}
    </RevisionLayout>
  );
}

function EditorTasa({ item, onSiguiente, onSaltar }: { item: ItemColaTasa; onSiguiente: () => void; onSaltar: () => void }) {
  const hecho = item.estado === "hecho";
  const [form, setForm] = useState<BorradorTasa>(item.borrador);
  const [errors, setErrors] = useState<Partial<Record<keyof TasaDraft, string>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDescartar, setConfirmDescartar] = useState(false);
  // Fecha leída de la imagen: si se cambia a mano, se avisa que la imagen es de otro día.
  const fechaImagen = useRef(item.borrador.auto.estado.fecha === "ocr" ? item.borrador.draft.fecha : null);

  const auto = useAutoguardado(hecho ? "" : JSON.stringify(form), async (v) => {
    await guardarBorradorTasa(await getDb(), item.id, JSON.parse(v) as BorradorTasa);
    invalidate();
  });

  function set(k: keyof TasaDraft, v: string) {
    setForm((f) => ({ draft: { ...f.draft, [k]: v }, auto: k === "notas" ? f.auto : marcarTocado(f.auto, k) }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  }

  async function marcarHecho() {
    if (hecho || saving) return;
    const r = validateTasa(form.draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    auto.cancelar();
    try {
      await completarTasa(await getDb(), item.id, r.value, form);
      toast.success("Tasa registrada");
      onSiguiente();
      invalidate();
    } catch (e) {
      reportError(e);
      void auto.guardar();
      setSaving(false);
    }
  }

  async function descartar() {
    auto.cancelar();
    try {
      const imagen = await descartarTasa(await getDb(), item.id);
      await deleteImage(imagen);
      toast.success("Imagen descartada");
      onSiguiente();
      invalidate();
    } catch (e) {
      reportError(e);
      setConfirmDescartar(false);
    }
  }

  const marcarHechoRef = useRef(marcarHecho);
  marcarHechoRef.current = marcarHecho;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        void marcarHechoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      className="grid content-start gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void marcarHecho();
      }}
    >
      {hecho && <Aviso>Ya está hecho: la tasa quedó registrada.</Aviso>}
      {!hecho && item.formato === null && <Aviso tono="warning">No se leyó la imagen: completa los datos a mano.</Aviso>}
      <fieldset disabled={hecho || saving} className="grid gap-4">
        <TasaCampos form={form} set={set} errors={errors} fechaBloqueada={false} fechaImagen={fechaImagen.current} />
      </fieldset>
      {!hecho && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="text-destructive" disabled={saving} onClick={() => setConfirmDescartar(true)}>
            <Trash2 />
            Descartar
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={onSaltar}>
            <SkipForward />
            Saltar
          </Button>
          <Button type="submit" disabled={saving} title="Ctrl+Enter">
            <Check />
            Hecho
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmDescartar}
        onOpenChange={setConfirmDescartar}
        title="Descartar imagen de tasa"
        description="Se quita de la cola y se borra su imagen. No se registra ninguna tasa."
        confirmLabel="Descartar"
        destructive
        onConfirm={descartar}
      />
    </form>
  );
}
