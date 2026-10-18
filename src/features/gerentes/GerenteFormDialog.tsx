import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { getDb } from "@/db";
import { createGerente, updateGerente, type Gerente } from "@/db/repos/gerentes";
import { validateGerente, type GerenteDraft } from "@/domain/validation";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = { gerente: Gerente | null; open: boolean; onOpenChange: (open: boolean) => void };

export function GerenteFormDialog({ gerente, open, onOpenChange }: Props) {
  const [draft, setDraft] = useState<GerenteDraft>({ nombre: "", telefono: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof GerenteDraft, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({ nombre: gerente?.nombre ?? "", telefono: gerente?.telefono ?? "" });
    setErrors({});
  }, [open, gerente]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateGerente(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      if (gerente) await updateGerente(db, gerente.id, r.value);
      else await createGerente(db, r.value);
      toast.success(gerente ? "Gerente actualizado" : "Gerente creado");
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{gerente ? "Editar gerente" : "Nuevo gerente"}</DialogTitle>
          </DialogHeader>
          <Field id="g-nombre" label="Nombre" error={errors.nombre}>
            <Input id="g-nombre" autoFocus value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
          </Field>
          <Field id="g-tel" label="Teléfono (opcional)">
            <Input id="g-tel" value={draft.telefono} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })} />
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
