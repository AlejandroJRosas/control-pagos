import Decimal from "decimal.js";
import { Aviso } from "@/components/Feedback";
import { getTasaConUsosByFecha, type TasaConUsos } from "@/db/repos/tasas";
import { formatFecha, isValidIsoDate } from "@/domain/dates";
import { formatTasa, parseTasa } from "@/domain/money";
import { useData } from "@/hooks/useData";

/** La tasa ya registrada en `fecha` (para ofrecer reemplazarla en vez de rechazar la nueva); `null` si no hay o no aplica. */
export function useTasaExistente(fecha: string, activo: boolean): TasaConUsos | null {
  const consultar = activo && isValidIsoDate(fecha);
  const { data } = useData(async (db) => (consultar ? getTasaConUsosByFecha(db, fecha) : null), [consultar, fecha]);
  return consultar ? (data ?? null) : null;
}

/** Aviso de que al guardar se reemplaza la tasa que ya tiene ese día. */
export function AvisoTasaExistente({ existente, valor, accion }: { existente: TasaConUsos; valor: string; accion: string }) {
  const nuevo = parseTasa(valor);
  const cambia = nuevo !== null && !new Decimal(nuevo).eq(existente.valor);
  return (
    <Aviso tono="warning">
      Ya hay una tasa el {formatFecha(existente.fecha)}: {formatTasa(existente.valor)}. {accion} se reemplaza
      {cambia ? ` por ${formatTasa(nuevo)}` : " (mismo valor; se le pone esta captura si la trae)"}
      {cambia && existente.usos > 0 ? ` y se recalculan ${existente.usos} depósito(s)` : ""}.
    </Aviso>
  );
}
