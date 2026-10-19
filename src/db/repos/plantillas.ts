import type { SqlDriver } from "../driver";
import { getAjuste, setAjuste } from "./ajustes";
import { PLANTILLAS_POR_DEFECTO, type Plantillas } from "@/domain/whatsapp";

const PENDIENTE = "whatsapp_pendiente";
const COMPLETO = "whatsapp_completo";

export async function getPlantillas(db: SqlDriver): Promise<Plantillas> {
  return {
    pendiente: (await getAjuste(db, PENDIENTE)) ?? PLANTILLAS_POR_DEFECTO.pendiente,
    completo: (await getAjuste(db, COMPLETO)) ?? PLANTILLAS_POR_DEFECTO.completo,
  };
}

export async function setPlantillas(db: SqlDriver, p: Plantillas): Promise<void> {
  await setAjuste(db, PENDIENTE, p.pendiente);
  await setAjuste(db, COMPLETO, p.completo);
}
