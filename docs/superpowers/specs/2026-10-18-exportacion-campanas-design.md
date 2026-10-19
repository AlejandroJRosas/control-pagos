# Exportación de campañas: PDF para compartir y Excel con formato

## Intención

Hoy la campaña se exporta solo a Excel (`src/export/campanaWorkbook.ts`) y el usuario lo ve "muy plano y sin formato". Además quiere un reporte que se vea bien para **entregárselo a su jefe**. Al jefe le interesa primero **el resumen por gerente** y después **el detalle de depósitos de cada gerente**.

Se hacen dos cosas con la misma identidad visual (estilo "B": azul marino `#1f3a5f`, barras de avance):

1. **Exportar PDF** (nuevo): un reporte listo para enviar o imprimir.
2. **Exportar a Excel** (rediseño): mismas hojas y datos que hoy, con formato.

Maquetas aprobadas (referencia visual, no se suben): `.superpowers/brainstorm/674-1792380188/content/pdf-estilo.html` (opción B), `pdf-detalle.html` y `excel-diseno.html`.

## Objetivos

- El jefe abre el PDF y en la primera página ve cuánto se ha pagado de la campaña y cómo va cada gerente.
- Cada gerente tiene su detalle en página propia, con el saldo que le va quedando.
- El Excel conserva todo lo que trae hoy, pero se ve presentable y se imprime bien.
- PDF, Excel y pantalla dan exactamente las mismas cifras.

## No objetivos

- No se cambia qué datos se calculan ni las reglas del dominio.
- No se exporta el PDF por gerente ni por WhatsApp (para eso ya existe `EstadoCuentaDialog`).
- No se adjuntan imágenes de comprobantes al PDF.
- No se añaden opciones de personalización (elegir columnas, logo, colores).

## Anti-objetivos

- Cifras que no cuadren con la app (por usar `number` o redondear distinto).
- Un PDF que sea una captura rasterizada y borrosa, o con texto que no se pueda seleccionar.
- Un Excel "bonito" que deje de servir como Excel: los montos deben seguir siendo números (sumables, filtrables) y las fechas, fechas.

## Restricciones (del proyecto)

- Montos con `decimal.js`; USD por depósito con `toUsd` y totales como suma de esos redondeados. Todo sale de `buildCampanaView` (no se recalcula nada aparte).
- Orden cronológico de depósitos: `compareCronologico` (ya lo aplica `buildCampanaView`).
- Formato venezolano en el PDF: `formatNumberVE`, `formatUsd`, `formatTasa`, `formatPct`, `formatFecha` de `domain/`.
- Lógica nueva con prueba primero (TDD). La UI se verifica con `pnpm build`.
- Archivos se guardan con el diálogo `save` + `writeFile` de Tauri, igual que `saveWorkbook`.

## PDF

### Página 1: resumen (estilo B)

- **Franja de título** azul marino a todo el ancho, texto blanco: línea pequeña en mayúsculas "Reporte de campaña · corte dd/mm/aaaa", nombre de la campaña grande, período (`formatPeriodo`) y estado (Activa/Cerrada).
- **Barra general**: "$ X pagado" a la izquierda, "de $ Y" a la derecha, barra de avance debajo, y la línea "Faltan $ Z · NN,N % de avance". Si el total está excedido (restante negativo), en vez de "Faltan" dice "Pagado de más $ Z" en rojo.
- **Tabla "Resumen por gerente"**: Gerente, Asignado, Pagado, Restante, Avance (barra + porcentaje). Encabezado con texto azul y línea inferior azul; filas separadas por línea fina gris; fila **Total** en negrita con línea superior oscura. El orden de los gerentes es el de `view.gerentes`.
- Color de la barra por gerente: verde (`#059669`) si está completo, rojo si está excedido, ámbar (`#d97706`) si el avance es menor al 50 %, azul (`#2563eb`) en el resto. Para decidir completo/excedido usar `estadoGerente`. *(El umbral de 50 % es decisión mía.)*
- Restante negativo en rojo en la tabla.

### Una página por gerente

- Empieza en página nueva.
- Su nombre grande; su barra de avance ("$ X pagado" / "de $ Y asignado"); línea "Faltan $ Z · NN,N % · N depósitos" (o "Pagado de más" en rojo).
- **Tabla de depósitos**: Fecha, Banco, Referencia, **Cuenta destino**, Monto Bs, Tasa, USD, Saldo (`saldoGerenteRestante`; rojo si es negativo). Fila de total: "Total (N depósitos)", suma de Monto Bs, suma de USD (= pagado), y el saldo final (= restante).
- Si el gerente no tiene depósitos: una fila "Sin depósitos registrados".
- Si la tabla no cabe en una página, continúa en la siguiente repitiendo el encabezado de la tabla.
- No se incluyen observaciones.

### Todas las páginas

- Desde la página 2, una línea pequeña arriba en azul: nombre de la campaña a la izquierda, "Corte dd/mm/aaaa · Pág. N de M" a la derecha, con línea fina debajo. En la página 1 basta el número de página al pie (o el mismo encabezado; a criterio del constructor mientras la franja azul quede como lo primero).
- Tamaño **carta, vertical**. *(Decisión mía; con 8 columnas en la tabla de depósitos, si no caben con letra legible ≥ 8 pt, se permite poner en horizontal solo las páginas de gerente.)*
- Fecha de corte = el día de la exportación (`todayIso()`).

### Cómo se genera *(decisión mía)*

- Librería **pdfmake**: PDF vectorial con texto seleccionable, tablas con encabezado repetido, saltos de página, encabezado/pie con número de página y dibujos (las barras se dibujan con `canvas` de pdfmake). Fuente por defecto de pdfmake (Roboto embebida).
- Separar en dos partes:
  - `src/export/campanaPdf.ts`: función **pura** `buildCampanaPdf(campana, view, generadoEn)` que devuelve el `TDocumentDefinitions`. Sin Tauri ni DOM; se prueba con vitest (estructura: páginas por gerente, cifras formateadas, totales, colores de restante negativo, gerente sin depósitos, nombres con acentos).
  - `src/export/savePdf.ts`: crea el PDF con pdfmake, pide la ruta con `save` (filtro "PDF") y escribe con `writeFile`. Devuelve `false` si el usuario cancela, como `saveWorkbook`.
- Nombre de archivo sugerido: `archivoPdf(nombre, fecha)` en `fileName.ts` → `<campaña>-<fecha>.pdf`, mismo patrón que `archivoExcel`.

### Botón

- En `CampanaPage.tsx`, junto al "Exportar a Excel" actual, un botón "Exportar PDF". Mismo manejo: toast "PDF guardado" al terminar, `reportError(e, "Exportar")` si falla. Disponible también en campañas cerradas (es solo lectura).

## Excel (rediseño de `campanaWorkbook.ts`)

Se mantienen las hojas: **Resumen**, **Todos los depósitos** y una por gerente (`safeSheetName`), y todas las columnas actuales (incluidas Observaciones y Comprobante en las hojas de depósitos).

### Hoja Resumen

- Filas 1-2: **franja de título** con fondo `#1f3a5f` combinada a lo ancho de la tabla: nombre de la campaña (≈17 pt, negrita, blanco) y debajo "período · estado · Corte dd/mm/aaaa" (texto azul claro).
- Cifras clave: fila de etiquetas pequeñas grises (Asignado, Pagado, Restante, Avance) y debajo los valores grandes en negrita (Pagado en verde, Restante en ámbar o rojo si es negativo). Son números con formato, no texto.
- Tabla por gerente con las columnas actuales (Gerente, Asignado USD, Pagado USD, Restante USD, % avance, Depósitos, Último depósito): encabezado azul marino con texto blanco y autofiltro; filas alternadas con fondo muy claro (`#f5f8fc`); bordes finos grises; **barra de datos** de Excel (formato condicional `dataBar`, azul) en la columna de avance, que sigue siendo un número; fila TOTAL en negrita con fondo `#eef2f7` y borde superior azul.
- Panel inmovilizado bajo el encabezado de la tabla.

### Hojas de depósitos (Todos y por gerente)

- Misma franja de título arriba: campaña + "Todos los depósitos" o el nombre del gerente.
- En las de gerente, debajo de la franja, una línea con su resumen (asignado, pagado, restante, avance).
- Tabla con el mismo estilo (encabezado azul, filas alternadas, bordes, total destacado, autofiltro, panel inmovilizado bajo el encabezado). Saldos negativos en rojo mediante formato numérico (`#,##0.00;[Red]-#,##0.00`).

### Impresión (todas las hojas)

- Horizontal, ajustar al ancho de una página, filas del encabezado de la tabla repetidas en cada página impresa, márgenes estrechos.

### Pruebas

- Las pruebas actuales de `campanaWorkbook.test.ts` que dependen de la fila donde empieza cada tabla se actualizan a la nueva disposición; deben seguir comprobando valores, formatos numéricos y totales tras el ida y vuelta (`roundTrip`).
- Agregar pruebas para: la franja de título (celdas combinadas y texto), las cifras clave como números, la barra de datos en la columna de avance y la configuración de impresión.
- `tasasWorkbook.ts` no entra en este cambio. *(Decisión mía; si es trivial reutilizar el estilo, puede quedar para después.)*

## Casos borde *(decisiones mías)*

- Campaña sin gerentes: el PDF tiene solo la página 1 con la barra en cero y la tabla con la fila "Sin gerentes asignados"; el Excel queda como hoy (Resumen y Todos los depósitos vacíos).
- Referencia en el PDF: se usa la misma fuente (Roboto) con cifras tabulares en lugar de monoespaciada, para no embeber otra fuente.
- Nombres largos de gerente o banco: se ajustan en varias líneas dentro de la celda, sin cortar.

## A criterio del constructor

- Medidas exactas, tamaños de letra y espaciados, siempre que se parezcan a las maquetas.
- Cómo compartir colores y utilidades de estilo entre el PDF y el Excel (p. ej. un pequeño módulo `export/estilo.ts`).
- Cómo cargar pdfmake (import dinámico para no pesar al arrancar es deseable).
