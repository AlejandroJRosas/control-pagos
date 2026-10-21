import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { Check, SkipForward, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Aviso } from "@/components/Feedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import type { CampanaData } from "@/db/queries/campanaData";
import type { Gerente } from "@/db/repos/gerentes";
import { descartarDeposito, guardarBorradorDeposito, type BorradorDeposito, type ItemColaDeposito } from "@/db/repos/cola";
import { completarConDuplicado, completarDeposito } from "@/db/operaciones/revision";
import type { Duplicado } from "@/db/repos/depositos";
import { duplicadosEnCola } from "@/domain/cola";
import type { DestinoDraft } from "@/domain/validation";
import { deleteImage } from "@/platform/images";
import { invalidate } from "@/hooks/useData";
import { useAtajo } from "@/hooks/useAtajo";
import { reportError } from "@/lib/reportError";
import { conVolver } from "@/lib/volver";
import { DepositoCampos } from "@/features/deposito/DepositoCampos";
import { MotivoDuplicado } from "@/features/deposito/DuplicadoBloqueo";
import { useDepositoForm } from "@/features/deposito/useDepositoForm";
import { useAutoguardado } from "./useAutoguardado";
import { BarraAcciones, TeclaAtajo } from "./RevisionLayout";

export type Editor = { setDestino: (d: DestinoDraft) => void };

type EditorProps = {
  item: ItemColaDeposito;
  items: ItemColaDeposito[];
  data: CampanaData;
  gerentes: Gerente[];
  bancos: string[];
  cerrada: boolean;
  editor: React.RefObject<Editor | null>;
  onSiguiente: () => void;
  /** Como `onSiguiente`, pero si no hay otro pendiente se queda en este. */
  onSaltar: () => void;
};

export function EditorDeposito({ item, items, data, gerentes, bancos, cerrada, editor, onSiguiente, onSaltar }: EditorProps) {
  const location = useLocation();
  const hecho = item.estado === "hecho";
  const f = useDepositoForm({
    data,
    asignacion: null,
    // Un hecho ya está en los datos de la campaña: se excluye de los saldos y de los duplicados.
    depositoId: hecho ? (item.depositoId ?? undefined) : undefined,
    inicial: () => ({ draft: { ...item.borrador.draft, tasaId: null }, destino: item.borrador.destino, auto: item.borrador.auto }),
  });
  editor.current = hecho ? null : { setDestino: f.setDestino };
  const [saving, setSaving] = useState(false);
  const [confirmDescartar, setConfirmDescartar] = useState(false);

  const { tasaId: _tasa, ...draft } = f.form.draft;
  const borrador: BorradorDeposito = { draft, destino: f.form.destino, auto: f.form.auto };
  const auto = useAutoguardado(hecho ? "" : JSON.stringify(borrador), async (v) => {
    await guardarBorradorDeposito(await getDb(), item.id, JSON.parse(v) as BorradorDeposito);
    invalidate();
  });

  // Duplicados dentro de la cola, con lo que se está escribiendo en este elemento.
  const enCola = useMemo(() => {
    const filas = items.map((i) => ({
      id: i.id,
      estado: i.estado,
      banco: i.id === item.id ? draft.banco : i.borrador.draft.banco,
      referencia: i.id === item.id ? draft.referencia : i.borrador.draft.referencia,
    }));
    const ids = duplicadosEnCola(filas, item.id);
    return items.filter((i) => ids.includes(i.id));
  }, [items, item.id, draft.banco, draft.referencia]);

  // Ya registrado con este banco y referencia: no se hace "Hecho", se actualiza el existente o se descarta.
  const duplicado = !hecho && f.duplicados.length > 0;

  async function marcarHecho() {
    if (hecho || cerrada || saving || f.tasa === undefined || duplicado) return;
    const r = f.validar();
    if (!r) return;
    setSaving(true);
    auto.cancelar();
    try {
      // En la revisión no hay asignación fija: `validar` siempre devuelve el destino.
      await completarDeposito(await getDb(), item.id, r.deposito, r.destino!, borrador);
      toast.success("Depósito registrado");
      onSiguiente();
      invalidate();
    } catch (e) {
      reportError(e);
      void auto.guardar();
      setSaving(false);
    }
  }

  async function actualizarExistente(d: Duplicado) {
    if (cerrada || saving || f.tasa === undefined) return;
    const r = f.validar();
    if (!r) return;
    setSaving(true);
    auto.cancelar();
    try {
      await completarConDuplicado(await getDb(), item.id, d.id, r.deposito, borrador);
      toast.success(`Depósito de ${d.gerenteNombre} actualizado`);
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
      const imagen = await descartarDeposito(await getDb(), item.id);
      await deleteImage(imagen);
      toast.success("Comprobante descartado");
      onSiguiente();
      invalidate();
    } catch (e) {
      reportError(e);
      setConfirmDescartar(false);
      // Lo que se estaba editando sigue siendo el borrador: se vuelve a autoguardar.
      void auto.guardar();
    }
  }

  // useAtajo no actúa con un diálogo abierto (p. ej. la confirmación de Descartar).
  useAtajo("Enter", () => void marcarHecho(), { ctrl: true });
  // Ctrl+D: un duplicado se descarta de una vez (DuplicadoBloqueo); otro comprobante pide confirmación.
  useAtajo("d", () => setConfirmDescartar(true), { ctrl: true, activo: !hecho && !cerrada && !saving && !duplicado });

  return (
    <form
      className="grid content-start gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void marcarHecho();
      }}
    >
      {hecho && (
        <Aviso>
          Ya está hecho.{" "}
          {item.depositoId ? (
            <Link to={`/depositos/${item.depositoId}`} state={conVolver(location, "Revisión")} className="underline">
              Ver depósito
            </Link>
          ) : (
            "El depósito se eliminó después."
          )}
        </Aviso>
      )}
      {!hecho && item.formato === null && <Aviso tono="warning">No se leyó el comprobante: completa los datos a mano.</Aviso>}
      <DepositoCampos
        f={f}
        data={data}
        asignacion={null}
        gerentes={gerentes}
        bancos={bancos}
        disabled={hecho || cerrada || saving}
        duplicado={hecho ? undefined : { onActualizar: (d) => void actualizarExistente(d), onDescartar: () => void descartar(), ocupado: cerrada || saving }}
        avisosExtra={
          enCola.length > 0 && (
            <Aviso tono="warning">
              En la cola hay otro comprobante con este banco y esta referencia:{" "}
              {enCola.map((i) => i.nombreArchivo ?? `#${i.orden}`).join(", ")}
            </Aviso>
          )
        }
      />
      {!hecho && (
        <BarraAcciones>
          <Button type="button" variant="destructive" size="lg" className="mr-auto" disabled={cerrada || saving} title="Ctrl+D" onClick={() => setConfirmDescartar(true)}>
            <Trash2 />
            Descartar
          </Button>
          {duplicado && <MotivoDuplicado />}
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={onSaltar}>
            <SkipForward />
            Saltar
          </Button>
          <Button type="submit" size="lg" className="px-4" disabled={cerrada || saving || f.tasa === undefined || duplicado} title="Ctrl+Enter">
            <Check />
            Hecho
            <TeclaAtajo>Ctrl+Enter</TeclaAtajo>
          </Button>
        </BarraAcciones>
      )}
      <ConfirmDialog
        open={confirmDescartar}
        onOpenChange={setConfirmDescartar}
        title="Descartar comprobante"
        description="Se quita de la cola y se borra su imagen. No se registra ningún depósito."
        confirmLabel="Descartar"
        destructive
        onConfirm={descartar}
      />
    </form>
  );
}
