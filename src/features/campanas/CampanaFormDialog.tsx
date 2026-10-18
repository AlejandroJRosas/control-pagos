import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { getDb } from "@/db";
import { createCampana, updateCampana, type Campana } from "@/db/repos/campanas";
import { validateCampana, type CampanaDraft } from "@/domain/validation";
import { todayIso } from "@/domain/dates";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = { campana: Campana | null; open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (id: number) => void };

export function CampanaFormDialog({ campana, open, onOpenChange, onCreated }: Props) {
  const [draft, setDraft] = useState<CampanaDraft>({ nombre: "", fechaInicio: "", fechaFin: "", notas: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof CampanaDraft, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({
      nombre: campana?.nombre ?? "",
      fechaInicio: campana?.fechaInicio ?? todayIso(),
      fechaFin: campana?.fechaFin ?? "",
      notas: campana?.notas ?? "",
    });
    setErrors({});
  }, [open, campana]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateCampana(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      if (campana) {
        await updateCampana(db, campana.id, r.value);
        toast.success("Campaña actualizada");
      } else {
        const id = await createCampana(db, r.value);
        toast.success("Campaña creada");
        onCreated?.(id);
      }
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof CampanaDraft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{campana ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
          </DialogHeader>
          <Field id="c-nombre" label="Nombre" error={errors.nombre}>
            <Input id="c-nombre" autoFocus value={draft.nombre} onChange={set("nombre")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="c-inicio" label="Inicio" error={errors.fechaInicio}>
              <Input id="c-inicio" type="date" value={draft.fechaInicio} onChange={set("fechaInicio")} />
            </Field>
            <Field id="c-fin" label="Fin (opcional)" error={errors.fechaFin}>
              <Input id="c-fin" type="date" value={draft.fechaFin} onChange={set("fechaFin")} />
            </Field>
          </div>
          <Field id="c-notas" label="Notas (opcional)">
            <Textarea id="c-notas" rows={2} value={draft.notas} onChange={set("notas")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
