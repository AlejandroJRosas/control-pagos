import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MontoInput } from "@/components/MontoInput";
import { Field } from "@/components/Field";
import { getDb } from "@/db";
import { updateSaldoAsignacion } from "@/db/repos/asignaciones";
import { validateSaldo } from "@/domain/validation";
import { toInputVE } from "@/domain/money";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { useDialogoSinGuardar } from "@/hooks/useAvisoSinGuardar";

export type AsignacionEditable = { id: number; gerenteNombre: string; saldoUsd: string };

type Props = {
  asignacion: AsignacionEditable | null;
  onOpenChange: (open: boolean) => void;
};

/** Edita el saldo a pagar de un gerente en la campaña (agregar gerentes: `AgregarGerentesDialog`). */
export function AsignacionFormDialog({ asignacion, onOpenChange }: Props) {
  const [saldo, setSaldo] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const aviso = useDialogoSinGuardar(asignacion !== null && saldo !== toInputVE(asignacion.saldoUsd), onOpenChange);

  useEffect(() => {
    if (!asignacion) return;
    setSaldo(toInputVE(asignacion.saldoUsd));
    setError(undefined);
  }, [asignacion]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!asignacion) return;
    const r = validateSaldo(saldo);
    if (!r.ok) return setError(r.errors.saldoUsd);
    setSaving(true);
    try {
      await updateSaldoAsignacion(await getDb(), asignacion.id, r.value);
      toast.success("Saldo actualizado");
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={asignacion !== null} onOpenChange={aviso.onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Saldo de {asignacion?.gerenteNombre}</DialogTitle>
          </DialogHeader>
          <Field id="a-saldo" label="Saldo a pagar (USD)" error={error} hint="Ej. 1.500,00">
            <MontoInput
              id="a-saldo"
              autoFocus
              className="text-right tabular-nums"
              value={saldo}
              onChange={setSaldo}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => aviso.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
        {aviso.dialogo}
      </DialogContent>
    </Dialog>
  );
}
