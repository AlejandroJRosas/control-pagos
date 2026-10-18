import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { getDb } from "@/db";
import type { Campana } from "@/db/repos/campanas";
import { eliminarCampana, resumenEliminacion } from "@/db/operaciones/eliminarCampana";
import { invalidate, useData } from "@/hooks/useData";
import { getCampanaActual, setCampanaActual } from "@/lib/campanaActual";
import { reportError } from "@/lib/reportError";
import { respaldoAntesDe } from "@/platform/backup";

type Props = { campana: Campana; open: boolean; onOpenChange: (open: boolean) => void };

/** Doble verificación: primero muestra qué se borra; después pide escribir el nombre de la campaña. */
export function EliminarCampanaDialog({ campana, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [nombre, setNombre] = useState("");
  const [borrando, setBorrando] = useState(false);
  const { data: resumen } = useData((db) => (open ? resumenEliminacion(db, campana.id) : Promise.resolve(null)), [open, campana.id]);

  useEffect(() => {
    if (!open) return;
    setPaso(1);
    setNombre("");
  }, [open]);

  const coincide = nombre.trim() === campana.nombre.trim();

  async function eliminar(e?: FormEvent) {
    e?.preventDefault();
    if (!coincide || borrando) return;
    setBorrando(true);
    try {
      const db = await getDb();
      await respaldoAntesDe(db, "eliminar");
      await eliminarCampana(db, campana.id);
      if (getCampanaActual() === campana.id) setCampanaActual(null);
      toast.success(`Campaña "${campana.nombre}" eliminada. Se guardó un respaldo previo en la carpeta de respaldos.`);
      onOpenChange(false);
      navigate("/campanas", { replace: true });
      invalidate();
    } catch (err) {
      reportError(err);
    } finally {
      setBorrando(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !borrando && onOpenChange(o)}>
      <AlertDialogContent>
        {paso === 1 ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar campaña</AlertDialogTitle>
              <AlertDialogDescription>
                Se borrará «{campana.nombre}» con{" "}
                {resumen
                  ? `${resumen.depositos} depósito(s), ${resumen.gerentes} gerente(s) asignado(s) y ${resumen.pendientes} comprobante(s) pendiente(s) de revisión`
                  : "todos sus depósitos y asignaciones"}
                . Los gerentes y las tasas no se borran. Antes de eliminar se guardará un respaldo automático.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => setPaso(2)}>
                Continuar
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <form onSubmit={eliminar} className="grid gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Seguro? No se puede deshacer</AlertDialogTitle>
              <AlertDialogDescription>Para confirmar, escribe el nombre de la campaña: «{campana.nombre}».</AlertDialogDescription>
            </AlertDialogHeader>
            <Field id="confirmar-nombre" label="Nombre de la campaña">
              <Input id="confirmar-nombre" autoFocus autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={borrando} />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive" disabled={!coincide || borrando}>
                {borrando ? "Eliminando…" : "Eliminar definitivamente"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
