import type { CamposDeposito, CamposTasa, Reconocedor } from "../tipos";
import { banescoOperacion } from "./banescoOperacion";
import { bdvTransferenciaTerceros } from "./bdvTransferenciaTerceros";
import { mercantilSolicitud } from "./mercantilSolicitud";
import { bncMovimiento } from "./bncMovimiento";
import { bdtTransferencia } from "./bdtTransferencia";
import { bdvOperacion } from "./bdvOperacion";
import { tasaMariandres } from "./tasaMariandres";

/** Formatos soportados, en orden de prueba: se usa el primero que detecta la imagen. Un formato nuevo se agrega aquí. */
export const reconocedoresDeposito: Reconocedor<CamposDeposito>[] = [bdvTransferenciaTerceros, bdvOperacion, banescoOperacion, mercantilSolicitud, bncMovimiento, bdtTransferencia];
export const reconocedoresTasa: Reconocedor<CamposTasa>[] = [tasaMariandres];
