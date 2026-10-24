# Provincial, nombres de banco, incidencias y ajustes del árbol — diseño

Cinco cambios pedidos juntos después de la v0.6.0. Son independientes entre sí; se pueden construir en este orden.

## 1. Orden del árbol: directos primero

**Por qué:** al mirar el equipo de alguien, se quiere ver primero a su gente directa (los que no tienen a nadie debajo) y después a los gerentes que tienen su propio equipo.

- Entre hermanos (mismo jefe, o entre las raíces), primero los que **no tienen hijos** y después los que **sí tienen**. Dentro de cada grupo se mantiene el orden que trae la lista (hoy, por nombre): una partición estable, no un nuevo ordenamiento.
- Vale donde se muestra el árbol: "Por gerente" (modo árbol), el organigrama de "Estructura" y la lista de "Compartir para consolidar". *(Decisión mía: es el mismo árbol en las tres partes.)* Lo más simple es hacerlo en `armarArbol` (`domain/arbol.ts`) para todos, con su prueba.
- En el organigrama, "Sin estructura" sigue aparte, como hoy.

## 2. Banco Provincial: la referencia es la cédula

**Por qué:** en los pagos del Provincial la "referencia" que llega (en el Excel y en el comprobante) es la cédula de quien paga. Una misma persona hace varios pagos, así que la referencia se repite, y hoy la app los bloquea como duplicados. Lo que distingue a un pago de otro es la fecha y el monto, pero **puede haber dos iguales** (misma cédula, fecha y monto) y ser pagos reales distintos.

- **El Provincial no tiene clave de duplicado.** `claveDuplicado` devuelve `""` para un banco cuya clave (`claveBanco`) sea la del Provincial. Por eso no hay bloqueo `DUPLICADO` al crear o editar, no aparece en la pantalla de duplicados, no bloquea Exportar ni los envíos en PDF o Excel, y no se agrupa en la revisión del lote. Se define en `domain/bancos.ts` como lista (`BANCOS_SIN_REFERENCIA_UNICA = ["Provincial"]`), por si aparece otro banco igual.
- **Posible repetido** (aviso, nunca bloqueo): un depósito del Provincial cuya cédula (`claveReferencia`), fecha y monto (`Decimal`) son iguales a los de otro ya registrado en cualquier campaña. Lo calcula una función pura en `domain/` (p. ej. `clavePosibleRepetido(banco, referencia, fecha, montoBs)`, vacía si no es del Provincial).
  - **Registro individual y revisión del lote:** un aviso en ámbar ("Posible repetido: ya hay un pago del Provincial de esta cédula con la misma fecha y monto") que no impide guardar.
  - **Importar Excel:** la fila sale **sin marcar** con la incidencia "Posible repetido", y se puede marcar si es un pago real. También cuenta repetido dentro del mismo archivo (dos filas iguales: la segunda sale sin marcar). Como hoy, las celdas se pueden editar.
  - **Consolidar** *(decisión mía)*: un depósito del archivo del Provincial que es posible repetido de uno local (y no se reconoce por uuid, equivalencia ni equivalentes) no entra solo. Va a una sección "Posibles repetidos", donde por defecto **no entra** y se puede elegir "Es otro pago: que entre". Sin esto, el mismo pago registrado en las dos apps quedaría dos veces.
- Los datos que ya existen del Provincial con referencia repetida dejan de figurar como duplicados. No se borra nada.

## 3. Nombres de banco unificados

**Por qué:** el Excel (y la gente al escribir) usa nombres distintos para el mismo banco ("BBVA Provincial", "BANCO PROVINCIAL", "Provincial"). Hoy la app los reconoce como el mismo banco solo al comparar (`claveBanco` con la lista fija `ALIAS`), pero guarda el texto tal cual. Se quiere **una sola forma de llamar a cada banco**.

- **Nombre canónico:** `bancoCanonico(nombre, aliasRecordados): string | null`. Devuelve el nombre de `BANCOS_SUGERIDOS` que corresponde (por la clave, por `ALIAS` o por los alias recordados), o `null` si no lo conoce.
- **Al guardar** (registro individual, revisión del lote, importación, consolidación al recibir), el banco se guarda con su nombre canónico si lo tiene. Si no lo conoce:
  - En la **importación**, la fila tiene la incidencia "Banco desconocido". Arriba de la tabla aparece una lista "Bancos del archivo que no conozco", con un `BuscadorSelect` por cada nombre distinto ("BANCO XYZ es…"), con los bancos conocidos y la opción "Es un banco nuevo: dejar este nombre". Al elegir, se aplica a todas las filas con ese nombre y **se recuerda** para la próxima importación. Una fila con banco desconocido no se puede importar hasta elegir.
  - En el **registro a mano** y en la **revisión del lote** se acepta tal cual (el campo ya sugiere los bancos conocidos con `BuscadorTexto`). Un nombre nuevo pasa a ser un banco más, como hoy. *(Decisión mía: no se interrumpe el registro a mano con un paso más.)*
- **Alias recordados:** tabla nueva `bancos_alias (alias TEXT PRIMARY KEY, banco TEXT NOT NULL)`, donde `alias` es la clave `claveComparacion` del nombre del Excel y `banco`, el nombre elegido. Va en una migración nueva, viaja en los respaldos y no viaja en el `.cpagos`. "Es un banco nuevo" guarda el alias apuntando al mismo nombre, para no volver a preguntar.
- `claveBanco` también usa los alias recordados, para que los duplicados se sigan detectando con los nombres nuevos.
- **Unificar lo ya guardado:** una migración (como la v5 con "Venezuela") reescribe `depositos.banco` y el banco de los borradores de `cola_depositos` con el nombre canónico de cada alias de `ALIAS`, y actualiza `actualizado_en` de los depósitos que cambian. Así viajan al consolidar y la otra app los ve como corrección sin cambios de verdad. *(Decisión mía: ojo, si en la otra app el depósito estaba editado, esto genera un conflicto. Es aceptable, pero el constructor debe comprobar que una corrección que solo cambia el nombre del banco a su forma canónica cuente como "sin cambios" al comparar, usando `claveBanco`.)*

## 4. Estructura: mover varios a la vez

**Por qué:** armar el árbol de una campaña nueva moviendo cajita por cajita es lento. Se quiere elegir varios gerentes y ponerlos bajo el mismo jefe de una vez.

- **Selección:** Ctrl+clic agrega o quita una cajita de la selección, y Shift+clic elige el rango, en el orden en que se ven las cajitas. Es igual que en la lista de la cola (`domain/seleccion.ts`, `clicSeleccion`). El clic simple sigue abriendo al gerente. Esc limpia la selección. Las cajitas elegidas se ven resaltadas y arriba dice "N elegidos · Esc para soltar".
- **Arrastrar una elegida** mueve a **todas las elegidas** (cada una con su rama) bajo el destino. Si se arrastra una no elegida, se mueve solo esa, como hoy.
- **Destino inválido:** si cualquiera de las elegidas no puede ir ahí (el destino es una de ellas o está en la rama de alguna), el destino no se resalta y no se mueve ninguna.
- **Un solo aviso:** "3 gerentes ahora están bajo Ana", con un "Deshacer" que devuelve a cada uno a su jefe anterior.
- **Escritura:** todo o nada, con reversión manual (como `agregarGerentes`). Va en una operación `moverAJefe(db, ids, jefeId)` en `db/operaciones/`, con su prueba.
- Con la campaña cerrada no hay selección ni arrastre.

## 5. Filtrar por incidencias (importar Excel y revisión del lote)

**Por qué:** con muchos pagos, se quiere ir directo a los que necesitan atención.

- **Importar Excel** (`features/importar/`): cada archivo lleva un filtro "Todas / Bien / Con incidencias (N)", con chips como los de "Por gerente".
  - Incidencia = falta un dato o hay uno inválido, duplicado ya registrado, repetida en el archivo, posible repetido del Provincial, banco desconocido o falta la tasa de su fecha.
  - Las incidencias ya se calculan en buena parte (`problemas`, `duplicados`, `repetidaEnArchivo` en `importarPagos.ts`). Se reúnen en una lista de motivos por fila (función pura, probada) y cada fila con incidencia muestra un ícono de aviso con los motivos en un `Tooltip`.
  - "Marcar todos" actúa sobre lo visible, igual que hoy con la búsqueda.
- **Revisión del lote** (`features/lote/RevisionLayout.tsx`): al filtro de hoy ("Todos / Pendientes / Hechos") se agrega "Con incidencias (N)".
  - Incidencia de un pendiente = el OCR no reconoció el formato, falta un dato obligatorio, algún campo quedó en ámbar (heurística), es duplicado, es posible repetido del Provincial o falta la tasa.
  - Se calcula con una función pura sobre el borrador (`domain/cola.ts` ya tiene lógica del borrador), probada.
  - En la lista, el ícono de aviso con los motivos.
  - ↑/↓ y "siguiente pendiente" siguen recorriendo lo visible.
- Los filtros no se guardan en la URL *(decisión mía: son pantallas de trabajo de una sola vez)*.

## No metas

- Detectar al Provincial de otra forma que por el nombre del banco.
- Unificar los nombres de banco en las tasas u otras tablas: solo depósitos y borradores de la cola.
- Que los alias recordados viajen en el `.cpagos`.

## Restricciones (del proyecto)

- Lógica en `domain/` con su prueba primero. Flujos de UI con `*.ui.test.tsx`.
- Migraciones nuevas, nunca editar las existentes. SQL con `?`.
- Casos nuevos de consolidar en `consolidarIdaYVuelta.test.ts`: dos pagos reales iguales del Provincial (que no se pierda ninguno si se elige "Es otro pago") y el mismo pago registrado en las dos apps (que no se duplique por defecto).
- Actualizar CLAUDE.md: reglas de duplicados (excepción del Provincial), alias de banco recordados, incidencias y selección múltiple en Estructura.
