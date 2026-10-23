# Consolidar una campaña entre dos instalaciones — diseño

Fecha: 2026-10-23. Estado: borrador para aprobar.

## Por qué

Dos personas de gerencia trabajan **la misma campaña** en **dos instalaciones distintas** de la app. Cada una crea a mano la campaña, sus gerentes y sus tasas, y cada una registra **depósitos distintos**. Necesitan juntar lo de una en la otra, y viceversa, de forma sencilla: un archivo que se manda por WhatsApp. Si no, las dos apps se separan y los saldos de los gerentes dejan de cuadrar entre ellas.

Esto es un puente hasta la fase 3 (BD en línea). Aprovecha que cada registro ya tiene `uuid` y `actualizado_en`.

## Qué es, en una frase

En una campaña, **"Compartir para consolidar"** genera un archivo `.cpagos` con los depósitos elegidos (con sus comprobantes), y la otra persona lo abre en su app, ve un **resumen antes de aplicar** y confirma.

## Metas

- Un archivo **por campaña**, fácil de mandar por WhatsApp (se copia al portapapeles como archivo, igual que el PDF del estado de cuenta).
- Elegir qué se manda: gerentes con casillas y la opción **"Solo lo que cambió desde mi último envío"**.
- Los **comprobantes van siempre**, tal cual, sin recomprimir.
- Al recibir:
  - entran los depósitos nuevos;
  - se aplican las **correcciones** (gana la versión más reciente);
  - se aplican las **eliminaciones** después de confirmarlas.
- Reenviar o volver a abrir el mismo archivo no hace daño, porque lo que ya está igual se ignora.
- Funciona igual en las dos direcciones, porque las dos apps tienen el mismo botón.

## No metas

- No es sincronización automática ni en tiempo real (eso es la fase 3).
- No consolida varias campañas en un archivo.
- No crea gerentes ni asignaciones en quien recibe. Solo se consolidan los gerentes que **las dos** tienen en la campaña (ver Emparejar).
- No viajan los datos propios del gerente: teléfono, etiquetas, cumpleaños ni estado activo.
- No viajan la cola de lote, el estado de la campaña (abierta o cerrada), sus fechas ni sus notas.

## Lo que sería un fracaso aunque "funcione"

- Que algo desaparezca o cambie sin aviso: un depósito excluido, una eliminación o una tasa cambiada.
- Que un depósito entre dos veces, sea por reenviar el archivo o porque las dos lo registraron.
- Que se cambie sola una tasa existente, porque movería los USD de lo ya registrado.
- Que un error a mitad de la aplicación deje la BD a medias.

## Comportamiento

### 1. Enviar

Menú de la campaña → **Compartir para consolidar** abre un diálogo con:

- **Gerentes de la campaña** con casillas, todas marcadas por defecto.
  - Arriba, "marcar todos" con `Casilla` (indeterminado) y un filtro por etiqueta para marcar un grupo rápido.
  - Cada gerente muestra cuántos depósitos van a viajar.
- **"Solo lo que cambió desde mi último envío"**:
  - Marcada por defecto si ya hubo un envío de esta campaña.
  - Si no hubo ninguno, aparece desmarcada y deshabilitada, con su motivo (`BotonConMotivo` / aviso flotante).
  - Desmarcada, se manda todo lo de los gerentes elegidos.
  - Bajo la casilla se muestra la fecha del último envío.
  - El último envío se recuerda **por gerente** (por asignación). Un gerente que nunca se mandó viaja completo aunque la casilla esté marcada. Así, desmarcar a C en un envío no hace que lo anterior de C se pierda después.
- **Tamaño estimado** del archivo: suma de las imágenes más un margen por los datos. Se actualiza al cambiar la selección.
- Acciones:
  - **Copiar para WhatsApp**: escribe el archivo en `envios\` y usa `copiar_envio`, como el PDF/Excel del estado de cuenta.
  - **Guardar como…**: diálogo de guardar.
  - Cualquiera de las dos registra la fecha y hora del envío de esa campaña.

Si la campaña tiene depósitos duplicados pendientes, el envío queda bloqueado con su motivo (mismo criterio que Exportar).

### 2. Qué lleva el archivo

Un zip con extensión `.cpagos`, escrito en `.part` y renombrado al terminar. Contiene:

- `paquete.json` con:
  - `formato`: versión del formato, empieza en 1;
  - `appVersion`;
  - `creadoEn`;
  - `origen`: un nombre legible, el nombre del equipo, como en `subcarpeta_espejo`;
  - `desde`: la fecha del último envío si se usó "solo lo que cambió", o null;
  - la **campaña**: uuid y nombre;
  - las **asignaciones** de los gerentes elegidos: uuid, gerente (uuid y nombre) y monto asignado;
  - los **depósitos**: todos sus campos, con `uuid`, `creadoEn`, `actualizadoEn`, la fecha de su tasa y el nombre del archivo de la imagen dentro del zip;
  - las **tasas** de las fechas que usan esos depósitos: fecha y valor (la imagen de la tasa no viaja);
  - las **eliminaciones**: uuids de depósitos de esos gerentes eliminados desde `desde`, o todas las registradas si `desde` es null, cada una con su fecha.
- `imagenes/<archivo>`: los comprobantes de los depósitos incluidos.

Con "solo lo que cambió", van los depósitos de cada gerente con `actualizado_en` posterior al último envío de ese gerente, más sus eliminaciones posteriores. Por eso `desde` va por asignación y no en la cabecera. Las asignaciones y tasas necesarias van siempre.

### 3. Recibir

El archivo se abre de dos formas:

- **soltándolo** en cualquier parte, como las imágenes (`SoltarImagenes` acepta `.cpagos`);
- desde el menú de la campaña → **Consolidar desde archivo…**.

Si se suelta fuera de una campaña, se busca la campaña por emparejamiento.

La app arma un **plan** y muestra la pantalla **Consolidar** (`/campanas/:id/consolidar`), sin escribir nada todavía. La pantalla tiene estas secciones:

- **Encabezado**: "Paquete de *origen* · creado el … · campaña *nombre*".
- **Emparejamientos** (solo si hace falta decidir):
  - la campaña, si no se reconoce sola;
  - cada gerente del archivo que no se reconoce: "¿'Jose Perez' es tu 'José Pérez'?", con un `BuscadorSelect` de los gerentes de tu campaña más la opción **No incluir**.
- **Nuevos**: los depósitos que entran, agrupados por gerente, con monto, USD y comprobante (`ComprobanteIcono`).
- **Correcciones**: cada depósito que cambia, con el antes y el después de los campos distintos.
  - Si tu copia es más reciente que la del archivo, no se toca. Aparece en "Sin cambios: tu versión es más nueva".
- **Eliminaciones**: "*origen* eliminó N depósitos", con su detalle y una casilla por cada uno, marcadas.
  - Se aplican solo las marcadas, al confirmar.
- **No se incluyen**, para que nada se pierda en silencio:
  - depósitos de gerentes que no están en tu campaña ("3 depósitos de C: no está en tu campaña");
  - duplicados de uno que ya tienes por banco y referencia ("ya lo tienes");
  - depósitos que se eliminaron en tu app.
- **Diferencias**, cada una decidida por quien recibe:
  - **Tasa** distinta para una fecha: muestra las dos y **hay que elegir una**; no hay valor por defecto. Mientras falte decidir, Consolidar queda deshabilitado con su motivo. Las tasas las da la empresa y deberían coincidir, así que una diferencia es un error de tipeo que conviene ver. Si no tienes tasa para esa fecha, se crea con la del archivo, y eso se indica.
  - **El mismo depósito registrado por las dos** (duplicado por banco y referencia, con distinto uuid): si los campos coinciden va a "Ya lo tienes". Si difieren (monto, fecha…) se muestra aquí lado a lado y se elige cuál queda. En ambos casos se **vinculan** (equivalencia del uuid remoto al depósito local), para que las correcciones y eliminaciones futuras de la otra copia se apliquen a este.
  - **Editado en las dos apps** desde el último intercambio: se muestra lado a lado con la más reciente preseleccionada, en vez de aplicarla sola. Así no se depende solo de los relojes de los dos equipos.
  - **Monto asignado** distinto en un gerente compartido: muestra las dos cifras y por defecto queda la tuya.
- **Resumen** con los totales que cambian por gerente, y el botón **Consolidar**.

El botón se deshabilita con su motivo mientras quede un emparejamiento sin decidir, o si la campaña está cerrada (`MOTIVO_CERRADA`).

Al confirmar:

1. Respaldo `antes-de-consolidar-*`.
2. Se aplica todo o nada, con reversión manual como en `importarPagos`.
3. Aviso con el resultado ("12 nuevos, 2 corregidos, 1 eliminado") y vuelta a la campaña.

### 4. Emparejar

- **Depósitos**: por `uuid` (o por su equivalencia, si se vinculó un duplicado). Un depósito recibido se guarda con **el mismo uuid, `creado_en` y `actualizado_en` del origen**. Así, en el próximo intercambio las dos apps lo reconocen como el mismo.
  - El uuid solo se busca en **la campaña destino**. Si existe en otra campaña local, el depósito va a "No se incluyen" con el motivo ("está en tu campaña X").
- **Campaña y gerentes**: las dos los crearon a mano, así que sus uuid no coinciden.
  - La primera vez se emparejan por nombre con `claveComparacion` (sin acentos, espacios ni mayúsculas).
  - La campaña se busca entre las campañas locales. Los gerentes, entre los **asignados a esa campaña**.
  - Una coincidencia única se toma sola. Sin coincidencia, o con varias, se pregunta.
  - Cada emparejamiento confirmado se **recuerda** (uuid remoto → registro local), para no volver a preguntar.
- **Tasas**: por fecha, con `fechaDeTasa` para fines de semana y feriados de quien recibe.

### 5. Reglas al aplicar

- **Nuevo** (uuid desconocido):
  - entra si su gerente está emparejado y no es duplicado de uno local según `claveDuplicado`;
  - su imagen se copia a `imagenes\` con un nombre nuevo.
- **Corrección** (uuid conocido): se aplica si `actualizado_en` del archivo es más reciente que el local. Queda con el `actualizado_en` del origen.
  - Si la local también cambió desde el último archivo recibido de esa campaña, va a Diferencias.
  - Si la corrección cambia la fecha, aplica la misma regla de tasa faltante o distinta que un depósito nuevo.
  - Si la corrección lo deja duplicado de otro local, se reporta y no se aplica.
  - Si la corrección cambia de gerente a uno no emparejado, se trata como "no se incluye".
- **Eliminación**: se borra solo si está marcada y existe localmente. Además, se registra también como eliminación local, para que si esta app reenvía no vuelva a aparecer.
- **Eliminado aquí, pero vigente en el archivo**: gana la eliminación local. El depósito no se recrea y aparece en "No se incluyen".
- **Tasa faltante**: se crea con `createTasa`. Si la fecha cae en un día que para quien recibe es fin de semana o feriado, se usa la del siguiente hábil según sus feriados. Si con eso no hay tasa, el depósito va a "No se incluyen" con el motivo.
- Se respetan las reglas de dominio: montos como texto, sin derivados guardados y campaña cerrada = no se aplica.

## Cambios de datos (los decidí yo)

Migración nueva (v7):

- `eliminaciones (uuid TEXT PRIMARY KEY, tabla TEXT, campana_uuid TEXT, asignacion_uuid TEXT, eliminado_en TEXT)`.
  - `asignacion_uuid` permite filtrar las eliminaciones por gerente al enviar.
  - `deleteDepositos` y la eliminación de duplicados la llenan.
  - `restaurarDepositos` (Deshacer) quita la fila.
  - Eliminar una campaña completa no la llena.
- `equivalencias (tabla TEXT, uuid_remoto TEXT, id_local INTEGER, PRIMARY KEY(tabla, uuid_remoto))` para campañas, gerentes y depósitos duplicados vinculados.
- `consolidaciones (asignacion_id INTEGER, sentido TEXT 'envio'|'recibo', en TEXT, PRIMARY KEY(asignacion_id, sentido))`: último envío y último recibo por gerente de la campaña.

Un nuevo camino de inserción de depósitos con uuid y fechas dadas, en el estilo de `restaurarDepositos`, pero pasando por las mismas validaciones de `createDeposito`.

## Calls que hice yo (revisar)

- La extensión `.cpagos`, el zip y el nombre del archivo: `<campaña> - <origen> - <fecha>.cpagos`.
- El zip se arma y se lee en **Rust**, reutilizando el patrón y la validación de rutas de `backup.rs`. `copiar_envio` acepta `.cpagos`.
- Los comprobantes van tal cual, sin recomprimir.
- Ante un conflicto gana la versión más reciente, y las eliminaciones se confirman por casilla.
- Ante un monto asignado distinto, queda por defecto el de quien recibe. Una tasa distinta hay que elegirla siempre.
- Un depósito que registraron las dos se vincula, y si difiere se elige cuál queda.
- Una edición hecha en las dos apps se muestra para elegir, en vez de aplicarse sola.
- El último envío se recuerda por gerente.
- El envío se bloquea si la campaña tiene duplicados pendientes.
- `origen` = nombre del equipo.

## Para quien construya

- La forma interna del plan y de la pantalla; si el plan vive en `db/operaciones/consolidar.ts` y la lógica pura de comparación en `domain/consolidar.ts` (recomendado, con pruebas primero).
- Cómo estimar el tamaño.
- Si la lectura del zip devuelve las imágenes a JS o las deja en una carpeta temporal hasta aplicar.
- Pruebas: dominio y operaciones con sql.js, y un `*.ui.test.tsx` del flujo recibir → confirmar.
