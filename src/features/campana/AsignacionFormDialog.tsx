import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { NativeSelect } from "@/components/NativeSelect";
import { getDb } from "@/db";
import { listGerentes } from "@/db/repos/gerentes";
import { createAsignacion, updateSaldoAsignacion } from "@/db/repos/asignaciones";
import { validateSaldo } from "@/domain/validation";
import { toInputVE } from "@/domain/money";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

export type AsignacionEditable = { id: number; gerenteNombre: string; saldoUsd: string };

type Props = {
  campanaId: number;
  gerentesEnCampana: number[];
  asignacion: AsignacionEditable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AsignacionFormDialog({ campanaId, gerentesEnCampana, asignacion, open, onOpenChange }: Props) {
  const { data: gerentes } = useData((db) => listGerentes(db, { soloActivos: true }), []);
  const [gerenteId, setGerenteId] = useState("");
  const [saldo, setSaldo] = useState("");
  const [errors, setErrors] = useState<{ gerenteId?: string; saldoUsd?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGerenteId("");
    setSaldo(asignacion ? toInputVE(asignacion.saldoUsd) : "");
    setErrors({});
  }, [open, asignacion]);

  const disponibles = (gerentes ?? []).filter((g) => !gerentesEnCampana.includes(g.id));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateSaldo(saldo);
    const errs: typeof errors = r.ok ? {} : { ...r.errors };
    if (!asignacion && !gerenteId) errs.gerenteId = "Elige un gerente";
    if (!r.ok || errs.gerenteId) return setErrors(errs);
    setSaving(true);
    try {
      const db = await getDb();
      if (asignacion) await updateSaldoAsignacion(db, asignacion.id, r.value);
      else await createAsignacion(db, { campanaId, gerenteId: Number(gerenteId), saldoUsd: r.value });
      toast.success(asignacion ? "Saldo actualizado" : "Gerente agregado a la campaña");
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
            <DialogTitle>{asignacion ? `Saldo de ${asignacion.gerenteNombre}` : "Agregar gerente a la campaña"}</DialogTitle>
          </DialogHeader>
          {!asignacion && (
            <Field
              id="a-gerente"
              label="Gerente"
              error={errors.gerenteId}
              hint={disponibles.length === 0 ? "No hay gerentes disponibles: créalos en Gerentes." : undefined}
            >
              <NativeSelect id="a-gerente" value={gerenteId} onChange={(e) => setGerenteId(e.target.value)}>
                <option value="">Selecciona…</option>
                {disponibles.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field id="a-saldo" label="Saldo a pagar (USD)" error={errors.saldoUsd} hint="Ej. 1.500,00">
            <Input
              id="a-saldo"
              autoFocus={!!asignacion}
              inputMode="decimal"
              className="text-right tabular-nums"
              value={saldo}
              onChange={(e) => setSaldo(e.target.value)}
            />
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
