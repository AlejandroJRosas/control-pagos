import type { ReactNode } from "react";
import { Tecla } from "@/components/AyudaAtajos";

/**
 * Pasos del recorrido. `objetivo` es el `data-tour` del elemento que se resalta (sin él, o si no está en la
 * pantalla, la tarjeta va al centro). `ruta` es la pantalla a la que se va antes de mostrarlo.
 */
export type Paso = {
  titulo: string;
  texto: ReactNode;
  objetivo?: string;
  ruta?: (ctx: { campanaActual: number | null }) => string | undefined;
};

export const PASOS: Paso[] = [
  {
    titulo: "Bienvenido a Control de Pagos",
    texto: (
      <>
        <p>Aquí registras los depósitos y transferencias de los gerentes en cada campaña. La app convierte los bolívares a dólares con la tasa del día y lleva lo que paga y lo que debe cada uno.</p>
        <p>En un par de minutos te muestro dónde está cada cosa. Avanza con <Tecla>→</Tecla> o los botones; <Tecla>Esc</Tecla> lo cierra.</p>
      </>
    ),
  },
  {
    titulo: "Barra lateral",
    objetivo: "navegacion",
    texto: (
      <>
        <p>Desde aquí vas a las pantallas principales: Resumen, Campañas, Gerentes y Tasas. Arriba queda fija la última campaña que abriste.</p>
        <p>
          <Tecla>Ctrl</Tecla> <Tecla>B</Tecla> la colapsa o la expande.
        </p>
      </>
    ),
  },
  {
    titulo: "Buscar en toda la app",
    objetivo: "buscar",
    texto: (
      <p>
        Con <Tecla>Ctrl</Tecla> <Tecla>K</Tecla> buscas depósitos (por referencia o monto), gerentes y campañas desde cualquier pantalla. La tecla <Tecla>/</Tecla> te
        lleva al buscador de la tabla que estés viendo.
      </p>
    ),
  },
  {
    titulo: "Campañas",
    ruta: () => "/campanas",
    objetivo: "acciones",
    texto: (
      <>
        <p>Cada campaña es un período de cobro. Créala con «Nueva campaña» y luego agrégale los gerentes con lo que debe pagar cada uno (o impórtalos del Excel de facturas).</p>
        <p>Una campaña cerrada queda de solo lectura; se puede reabrir.</p>
      </>
    ),
  },
  {
    titulo: "Dentro de una campaña",
    ruta: ({ campanaActual }) => (campanaActual ? `/campanas/${campanaActual}` : undefined),
    objetivo: "acciones",
    texto: (
      <ul className="list-disc space-y-1 pl-4">
        <li>
          <b>Registrar depósito</b> (<Tecla>N</Tecla>): uno a la vez, con la imagen del comprobante.
        </li>
        <li>
          <b>Subir lote</b> (<Tecla>L</Tecla>): varios comprobantes juntos; la app los lee y tú revisas cada uno antes de guardarlo.
        </li>
        <li>
          <b>Exportar</b> a Excel o PDF, y en el menú <b>Campaña</b>: enviar estados de cuenta por WhatsApp, agregar gerentes o cerrarla.
        </li>
        <li>Las pestañas muestran todos los depósitos o el saldo por gerente.</li>
      </ul>
    ),
  },
  {
    titulo: "Suelta las imágenes donde sea",
    texto: (
      <>
        <p>Arrastra comprobantes a cualquier pantalla: una imagen abre el registro del depósito y varias, la subida en lote.</p>
        <p>La app lee la fecha, el monto, el banco y la referencia. Lo que sale en ámbar conviene revisarlo; nada cuenta hasta que lo guardas.</p>
      </>
    ),
  },
  {
    titulo: "Gerentes",
    ruta: () => "/gerentes",
    objetivo: "acciones",
    texto: (
      <p>
        La lista de gerentes con su teléfono (para el WhatsApp) y etiquetas para agruparlos y filtrarlos. Al abrir uno ves su ficha: todas sus campañas, lo que pagó y lo
        que debe.
      </p>
    ),
  },
  {
    titulo: "Tasas",
    ruta: () => "/tasas",
    objetivo: "acciones",
    texto: (
      <>
        <p>La tasa del día (Bs por USD), una por día hábil. Sábados, domingos y feriados usan la del siguiente día hábil: la del lunes, que la empresa da por adelantado (si el lunes es feriado, la del martes). Puedes cargarla a mano o subir capturas.</p>
        <p>Si falta la tasa que rige hoy (en fin de semana, la del lunes), aparece un aviso arriba en todas las pantallas.</p>
      </>
    ),
  },
  {
    titulo: "Resumen",
    ruta: () => "/resumen",
    texto: <p>Todas las campañas activas sumadas: lo cobrado en los últimos 7 días, lo pendiente por revisar y los gerentes que más deben.</p>,
  },
  {
    titulo: "Configuración",
    ruta: () => "/configuracion",
    objetivo: "tutorial-config",
    texto: (
      <>
        <p>Respaldos (se hace uno automático cada día), la copia en Google Drive, los mensajes de WhatsApp, los colores de la app y las actualizaciones.</p>
        <p>Aquí también activas o desactivas este tutorial.</p>
      </>
    ),
  },
  {
    titulo: "Ayuda siempre a mano",
    objetivo: "ayuda",
    texto: (
      <p>
        Con <Tecla>?</Tecla> ves todos los atajos de teclado, y con el botón «Tutorial» vuelves a ver este recorrido cuando quieras.
      </p>
    ),
  },
  {
    titulo: "¡Listo!",
    texto: <p>Para empezar, crea una campaña y agrégale sus gerentes. Si algo no queda claro, pasa el mouse sobre los botones: muchos explican qué hacen.</p>,
  },
];
