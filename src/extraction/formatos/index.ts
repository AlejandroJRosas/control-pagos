import type { CamposDeposito, CamposTasa, Reconocedor } from "../tipos";
import { banescoOperacion } from "./banescoOperacion";
import { bdvTransferenciaTerceros } from "./bdvTransferenciaTerceros";
import { mercantilSolicitud } from "./mercantilSolicitud";
import { bncMovimiento } from "./bncMovimiento";
import { bdtTransferencia } from "./bdtTransferencia";
import { bdtOperacion } from "./bdtOperacion";
import { bdvOperacion } from "./bdvOperacion";
import { bdvPagomovil } from "./bdvPagomovil";
import { provincialDineroRapido } from "./provincialDineroRapido";
import { caroniPagos } from "./caroniPagos";
import { bancamigaTransaccion } from "./bancamigaTransaccion";
import { bdvOtrosBancos } from "./bdvOtrosBancos";
import { bancaribePagomovil } from "./bancaribePagomovil";
import { mercantilDetalle } from "./mercantilDetalle";
import { tasaMariandres } from "./tasaMariandres";

/** Formatos soportados, en orden de prueba: se usa el primero que detecta la imagen. Un formato nuevo se agrega aquí. */
export const reconocedoresDeposito: Reconocedor<CamposDeposito>[] = [bdvTransferenciaTerceros, bdvOperacion, banescoOperacion, mercantilSolicitud, bncMovimiento, bdtTransferencia, bdtOperacion, bdvPagomovil, provincialDineroRapido, caroniPagos, bancamigaTransaccion, bdvOtrosBancos, bancaribePagomovil, mercantilDetalle];
export const reconocedoresTasa: Reconocedor<CamposTasa>[] = [tasaMariandres];
