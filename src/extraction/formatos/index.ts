import type { CamposDeposito, CamposTasa, Reconocedor } from "../tipos";
import { bdvTransferenciaTerceros } from "./bdvTransferenciaTerceros";
import { tasaMariandres } from "./tasaMariandres";

/** Formatos soportados, en orden de prueba: se usa el primero que detecta la imagen. Un formato nuevo se agrega aquí. */
export const reconocedoresDeposito: Reconocedor<CamposDeposito>[] = [bdvTransferenciaTerceros];
export const reconocedoresTasa: Reconocedor<CamposTasa>[] = [tasaMariandres];
