import type { ReactNode } from "react";
import { FechaInput } from "@/components/FechaInput";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { Aviso } from "@/components/Feedback";
import { cn } from "@/lib/utils";
import { confClass } from "@/lib/confianza";
import type { TasaDraft } from "@/domain/validation";
import { formatTasa, parseTasa } from "@/domain/money";
import { esFinDeSemana, fechaDeTasa, formatFecha, isValidIsoDate, nombreDia } from "@/domain/dates";
import { useFeriados } from "@/hooks/useFeriados";
import type { Autollenado } from "@/extraction/autollenado";
import type { CamposTasa } from "@/extraction/extractor";

type Props = {
  form: { draft: TasaDraft; auto: Autollenado<CamposTasa> };
  set: (k: keyof TasaDraft, v: string) => void;
  errors: Partial<Record<keyof TasaDraft, string>>;
  fechaBloqueada: boolean;
  /** Fecha leída de la imagen: si la fecha del formulario no la puso el OCR y es otra, se avisa. */
  fechaImagen: string | null;
  /** Se muestra el aviso de fin de semana (al registrar; no al editar). */
  avisoFinDeSemana?: boolean;
  avisosExtra?: ReactNode;
};

/** Campos de la tasa del día; compartidos por el diálogo y la revisión en lote. */
export function TasaCampos({ form, set, errors, fechaBloqueada, fechaImagen, avisoFinDeSemana = true, avisosExtra }: Props) {
  const draft = form.draft;
  const nuevoValor = parseTasa(draft.valor);
  const feriados = useFeriados();
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field id="t-fecha" label="Fecha" error={errors.fecha}>
          <FechaInput
            id="t-fecha"
            className={confClass(form.auto.confianza.fecha)}
            value={draft.fecha}
            disabled={fechaBloqueada}
            onChange={(v) => set("fecha", v)}
          />
        </Field>
        <Field id="t-valor" label="Bs por USD" error={errors.valor} hint={nuevoValor ? `= ${formatTasa(nuevoValor)} Bs por USD` : "Ej. 36,50"}>
          <Input
            id="t-valor"
            autoFocus
            inputMode="decimal"
            className={cn("text-right tabular-nums", confClass(form.auto.confianza.valor))}
            value={draft.valor}
            onChange={(e) => set("valor", e.target.value)}
          />
        </Field>
      </div>
      {avisoFinDeSemana && isValidIsoDate(draft.fecha) && esFinDeSemana(draft.fecha) && (
        <Aviso tono="warning">
          Los sábados y domingos no llevan tasa propia: usan la del {nombreDia(fechaDeTasa(draft.fecha, feriados))}{" "}
          {formatFecha(fechaDeTasa(draft.fecha, feriados))}. Registra la tasa en esa fecha.
        </Aviso>
      )}
      {avisoFinDeSemana && isValidIsoDate(draft.fecha) && feriados.has(draft.fecha) && (
        <Aviso tono="warning">
          El {formatFecha(draft.fecha)} es feriado: usa la tasa del {nombreDia(fechaDeTasa(draft.fecha, feriados))}{" "}
          {formatFecha(fechaDeTasa(draft.fecha, feriados))}. Registra la tasa en esa fecha.
        </Aviso>
      )}
      {avisosExtra}
      <Field id="t-notas" label="Notas (opcional)">
        <Textarea id="t-notas" rows={2} value={draft.notas} onChange={(e) => set("notas", e.target.value)} />
      </Field>
      {fechaImagen && fechaImagen !== draft.fecha && form.auto.estado.fecha === "tocado" && (
        <Aviso tono="warning">La imagen es del {formatFecha(fechaImagen)}.</Aviso>
      )}
    </>
  );
}
