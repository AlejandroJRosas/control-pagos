import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { Aviso } from "@/components/Feedback";
import { ImageDrop } from "@/components/ImageDrop";
import { getDb } from "@/db";
import { createTasa, getTasa, updateTasa, type Tasa, type TasaConUsos } from "@/db/repos/tasas";
import { validateTasa, type TasaDraft } from "@/domain/validation";
import { parseMonto, toInputVE } from "@/domain/money";
import { todayIso } from "@/domain/dates";
import { persistImagen, type ImagenValue } from "@/platform/images";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = {
  tasa: TasaConUsos | null;
  fechaFija?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (t: Tasa) => void;
};

export function TasaFormDialog({ tasa, fechaFija, open, onOpenChange, onSaved }: Props) {
  const [draft, setDraft] = useState<TasaDraft>({ fecha: "", valor: "", notas: "" });
  const [imagen, setImagen] = useState<ImagenValue>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof TasaDraft, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({ fecha: tasa?.fecha ?? fechaFija ?? todayIso(), valor: tasa ? toInputVE(tasa.valor) : "", notas: tasa?.notas ?? "" });
    setImagen(tasa?.imagenPath ? { kind: "stored", path: tasa.imagenPath } : null);
    setErrors({});
  }, [open, tasa, fechaFija]);

  const nuevoValor = parseMonto(draft.valor);
  const afectados = tasa && nuevoValor !== null && nuevoValor !== tasa.valor ? tasa.usos : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateTasa(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      const imagenPath = await persistImagen(imagen);
      let id: number;
      if (tasa) {
        await updateTasa(db, tasa.id, { valor: r.value.valor, notas: r.value.notas, imagenPath });
        id = tasa.id;
      } else {
        id = await createTasa(db, { ...r.value, imagenPath });
      }
      const guardada = await getTasa(db, id);
      toast.success(tasa ? "Tasa actualizada" : "Tasa registrada");
      invalidate();
      onOpenChange(false);
      if (guardada) onSaved?.(guardada);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{tasa ? "Editar tasa" : "Registrar tasa del día"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field id="t-fecha" label="Fecha" error={errors.fecha}>
              <Input
                id="t-fecha"
                type="date"
                value={draft.fecha}
                disabled={tasa != null || fechaFija != null}
                onChange={(e) => setDraft({ ...draft, fecha: e.target.value })}
              />
            </Field>
            <Field id="t-valor" label="Bs por USD" error={errors.valor} hint="Ej. 36,50">
              <Input
                id="t-valor"
                autoFocus
                inputMode="decimal"
                className="text-right tabular-nums"
                value={draft.valor}
                onChange={(e) => setDraft({ ...draft, valor: e.target.value })}
              />
            </Field>
          </div>
          {afectados > 0 && <Aviso tono="warning">Cambiar esta tasa recalcula {afectados} depósito(s).</Aviso>}
          <Field id="t-notas" label="Notas (opcional)">
            <Textarea id="t-notas" rows={2} value={draft.notas} onChange={(e) => setDraft({ ...draft, notas: e.target.value })} />
          </Field>
          <ImageDrop label="Captura de la tasa (opcional)" value={imagen} onChange={setImagen} pasteEnabled={open} className="h-56" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {afectados > 0 ? `Guardar (afecta ${afectados})` : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
