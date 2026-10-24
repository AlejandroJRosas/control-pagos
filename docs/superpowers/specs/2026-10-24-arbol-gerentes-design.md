# Árbol de gerentes por campaña — diseño

## Intención

En la realidad, los gerentes de una campaña forman una pirámide: una persona tiene gerentes, y esos gerentes tienen otros. Hoy la app los trata a todos como una lista plana. El objetivo es registrar esa estructura y usarla, sobre todo al **consolidar**: cuando se comparte un gerente, normalmente se quiere mandar también a todos los que están debajo de él, en todos los niveles, sin marcarlos uno por uno.

## Qué es el árbol

- **Por campaña.** Cada asignación (gerente en una campaña) puede tener un **jefe**: otra asignación de la **misma** campaña. La de la punta no tiene. El mismo gerente puede tener otro jefe, o ninguno, en otra campaña (casi siempre es el mismo, pero puede cambiar).
- **El de la punta es un gerente más**, con sus depósitos, asignado y saldo. El árbol **no cambia ninguna cuenta**: saldos, totales, Excel, PDF y estado de cuenta siguen exactamente igual.
- **Sin ciclos.** Nadie puede quedar debajo de sí mismo, ni directamente ni a través de otros (A jefe de B y B jefe de A). La regla vive en `domain/` y la aplica el repo con un `DomainError` en español.
- Un gerente sin jefe y sin nadie debajo es "sin estructura". Es válido, y es el estado de todo lo que ya existe.

## Metas

1. Registrar y editar quién es el jefe de cada gerente en una campaña.
2. Ver el árbol de dos maneras: en la tabla "Por gerente" (con sangría) y en un organigrama (pestaña "Estructura").
3. Armarlo rápido: con un buscador en el formulario y arrastrando en el organigrama.
4. En "Compartir para consolidar", marcar a un gerente marca a toda su rama.
5. Que el árbol viaje en el `.cpagos` y se arme en la app que lo recibe, agregando a la campaña los gerentes que le falten.

## No metas (por ahora)

- **Subtotales por rama.** Cada fila muestra solo los montos de ese gerente (lo decidió el usuario: "por ahora los de ella"). No se calcula ni se muestra cuánto debe "Ana y su equipo".
- Estructura global de gerentes, fuera de la campaña.
- Cambios en Excel, PDF, estado de cuenta, WhatsApp, "Todos los depósitos", resumen general o ficha del gerente. *(Decisión mía.)*
- Filtrar los depósitos por rama.

## Anti-metas

- Que el árbol altere un saldo, un total o un USD.
- Que consolidar cambie el jefe de alguien sin que el usuario lo vea, cuando ambos lados tenían uno distinto.
- Que al marcar la rama no se pueda dejar fuera a uno suelto.

## Datos

- Migración nueva (v8): `ALTER TABLE asignaciones ADD COLUMN jefe_id INTEGER REFERENCES asignaciones(id)` (nulo = sin jefe). La lectura de la asignación lo devuelve como `jefeId`. Al cambiar el jefe se actualiza `actualizado_en`, como cualquier edición de la asignación.
- El repo valida: el jefe es de la misma campaña, no es la misma asignación, no crea un ciclo y la campaña no está cerrada (`CAMPANA_CERRADA`).
- **Al sacar a un gerente de la campaña** (eliminar su asignación), los que tenía directamente debajo pasan a su jefe, o quedan en la punta si él no tenía. Lo hace la misma operación que elimina, antes de borrar. *(Decisión mía.)* Lo mismo al eliminar la campaña: no debe fallar por la referencia.
- No se guarda nada derivado (profundidad, cantidad debajo, ramas): todo sale de `jefeId` con funciones puras en `domain/` (p. ej. `domain/arbol.ts`: armar el árbol, descendientes, detectar ciclos, aplanar en orden de árbol). Estas funciones llevan su prueba primero.
- Los respaldos lo llevan solos, porque es una columna de la BD.

## Elegir el jefe

- **Formulario del gerente en la campaña** (`AsignacionFormDialog`, donde está el asignado): buscador "Jefe" (`BuscadorSelect`) con los demás gerentes de la campaña, sin él mismo ni nadie de su rama, más la opción "Sin jefe".
- **Al agregar gerentes a una campaña** (`AgregarGerentesDialog`): a cada uno se le propone el jefe que tenía en la **campaña anterior** donde estuvo, si ese jefe también está en esta campaña (ya estaba o se agrega en la misma tanda). Se aplica solo, sin preguntar, y después se cambia en el formulario o en el organigrama. *(Idea mía, aceptada por el usuario en la conversación.)* "Campaña anterior" = la más reciente en la que estuvo ese gerente, según el orden que la app ya usa para las campañas.
- **Arrastrando en el organigrama** (ver abajo).

## Vista A — "Por gerente" en árbol

- En el orden por defecto, cada gerente va debajo de su jefe, con sangría por nivel. Junto al nombre de quien tiene gente debajo dice "· N debajo", contando todos los niveles.
- Una flechita pliega y despliega su rama. Lo plegado se recuerda en localStorage por asignación de la campaña, como `lib/diasPlegados.ts`. Por defecto todo está desplegado y, con búsqueda o filtros, se ve todo.
- Si se ordena por otra columna, es **lista plana**, como hoy. Al volver al orden por defecto, vuelve el árbol.
- Entre hermanos se mantiene el orden por defecto que la tabla usa hoy.
- Con búsqueda o filtros activos: lista plana con lo que coincide. *(Decisión mía: es lo más simple y no esconde resultados.)*
- Los montos de cada fila son **solo de ese gerente**. El pie de totales no cambia.
- Columnas ocultables y reordenables, igual que hoy (`useColumnas`).

## Vista B — pestaña "Estructura" (organigrama)

- Pestaña nueva en la campaña, después de "Por gerente", en la URL con `usePestanaUrl` (`?tab=estructura`).
- Pirámide en cajitas de arriba hacia abajo. Cada cajita lleva el nombre y el **restante**, con un negativo en rojo (`text-destructive`) y "al día" en 0. Un clic abre la asignación del gerente.
- Los que no tienen jefe ni nadie debajo van aparte, en una zona "Sin estructura".
- **Arrastrar:** soltar una cajita sobre otra la pone de jefe. Soltarla en "Sin estructura", o en la zona de la punta, le quita el jefe y se lleva a su rama. No se puede soltar sobre alguien de su propia rama: ese destino no se resalta y, si igual se suelta, no pasa nada (o un aviso breve). Cada cambio se guarda al soltar y se puede deshacer, al estilo de los avisos con Deshacer que ya existen.
- Con 30 a 40 gerentes es ancho: la zona tiene scroll horizontal propio y las ramas se pueden plegar. El dibujo exacto (líneas, separación, plegado) queda al constructor, pero tiene que leerse con al menos 40 gerentes en 3 o 4 niveles.
- Con la campaña cerrada se ve igual, pero no se arrastra (motivo `MOTIVO_CERRADA`).

## Compartir para consolidar

- La lista de gerentes de `CompartirConsolidarDialog` se muestra como árbol (con sangría).
- Marcar a un gerente marca a **toda su rama**, en todos los niveles. Desmarcarlo desmarca toda la rama.
- Después se puede desmarcar a uno suelto de la rama. La casilla del jefe queda `indeterminado` si su rama está a medias (`Casilla`).
- "Marcar todos" sigue igual.

## El árbol en el `.cpagos`

- Cada asignación del paquete lleva `jefe`: `{ asignacionUuid, gerente: { uuid, nombre } }` del jefe en la app que envía, o `null`. Es **opcional al leer**: un archivo viejo sin el campo no cambia el árbol de nadie. `FORMATO_PAQUETE` no sube (como con `equivalentes`), y una app vieja ignora el campo.
- Se envía el `jefe` aunque no vaya en el archivo (p. ej. se mandó solo la rama de Luis, cuyo jefe es Ana).
- **Al recibir**, para cada asignación del archivo emparejada o agregada (ver "Agregar a mi campaña"):
  - Se resuelve el jefe del archivo a una asignación local de la misma campaña. Si el jefe está en el archivo, por su emparejamiento. Si no, por el **gerente**: uuid del gerente → equivalencia de `gerentes` → uuid local, y luego su asignación en esta campaña. No se busca por nombre. Las asignaciones de cada instalación tienen uuid propio, así que el uuid de la asignación solo sirve si coincide (p. ej. una agregada desde un archivo). Si no se encuentra, no se toca el jefe local de esa asignación. *(Decisión mía, tras la revisión.)*
  - Si local no tiene jefe y el archivo sí: se toma el del archivo, sin preguntar.
  - Si ambos tienen el mismo: nada.
  - Si son distintos, o el archivo dice "sin jefe" y local tiene uno: aparece en una sección nueva "**Jefe distinto**", como las diferencias de saldo: se ve "mía: Luis / archivo: Ana" y se elige. Por defecto queda **"mía"**, igual que en los saldos. *(Lo de "archivo sin jefe, local con jefe" es decisión mía: no se borra un jefe en silencio.)*
  - **Agrupado por jefe** (decisión del usuario): las filas de "Jefe distinto" se agrupan por el par (jefe mío → jefe del archivo). Por ejemplo: "Karla → Juan: A, B" o "Juan → sin jefe: C". Cada grupo tiene un botón para elegir "mía" o "archivo" para todos, y se abre para decidir uno por uno. Si dentro del grupo hay elecciones mezcladas, el grupo lo muestra. *(Lo del par como clave es decisión mía: cubre tanto "el archivo los pone bajo Juan" como "el archivo los saca de Juan".)* Los que tienen gente debajo se mueven con toda su rama, y la fila lo dice ("· N debajo").
  - **Ciclos** *(decisión mía, tras la revisión)*: un jefe del archivo que, solo o junto con los demás que se tomarían automáticamente, crearía un ciclo no se aplica en automático. Pasa a "Jefe distinto" sin la opción "archivo", con su motivo. Además, antes de aplicar se valida el árbol que resultaría con **todas** las decisiones juntas. Si hay un ciclo, se bloquea aplicar con un motivo que nombra a los gerentes, como `motivoRepetidos`. La comprobación por fila puede vivir en `clasificar`, pero la final es sobre el conjunto.
- El cambio de jefe y los gerentes agregados entran en el resumen antes/después, en `aplicarConsolidacion` con su reversión y en el respaldo `antes-de-consolidar-*`, como lo demás.
- Casos de intercambio nuevos en `consolidarIdaYVuelta.test.ts`: rama enviada y armada en la otra app con gerentes agregados; rama con gerentes que ya estaban; jefe distinto en ambos lados; jefe fuera del archivo; ciclo entre lo local y lo del archivo; archivo viejo sin `jefe`; segundo intercambio tras agregar (se reconoce a los agregados sin preguntar).

## Agregar a mi campaña (al consolidar)

Hoy cada gerente del archivo solo se empareja con una asignación que ya existe en la campaña local, o queda como "No incluir". **Se agrega una tercera opción: "Agregar a mi campaña"** (decisión del usuario: "sí, que lo agregue"). Sin ella, una rama no se podría armar en la otra app.

- **Dónde:** en el paso de emparejar gerentes de `ConsolidarPage`, junto a las asignaciones locales y "No incluir".
- **Propuesta por defecto** *(decisión mía)*: si el gerente del archivo no se puede emparejar con ninguna asignación de la campaña local, se propone "Agregar a mi campaña" en vez de dejarlo sin decidir. Así, una rama nueva se arma con un solo "Aplicar". Se puede cambiar a "No incluir".
- **Qué gerente usa** *(decisión mía)*: si el gerente del archivo ya existe localmente (por uuid o equivalencia de `gerentes`), se usa ese. Si no, se crea un gerente nuevo con el nombre del archivo, activo y sin etiquetas ni cumpleaños, y se guarda la equivalencia de su uuid. Si hay un gerente local con el mismo nombre (sin acentos ni mayúsculas) que no está en la campaña, se ofrece en el selector como "Agregar a <nombre local>" para no duplicarlo, y se propone ese.
- **La asignación nueva** *(decisión mía)*: lleva el **mismo uuid** que la del archivo (como los depósitos recibidos conservan el suyo), así el próximo intercambio la reconoce directamente. Su asignado es el `saldoUsd` del archivo, sin diferencia de saldo que mostrar, y su jefe es el del archivo, resuelto como arriba. Todos los depósitos del archivo para ese gerente entran como nuevos.
- **Uno a uno:** "Agregar a mi campaña" y "Agregar a <nombre local>" cuentan para la regla de que dos del archivo no vayan al mismo local (`gerentesRepetidos`).
- **Reversión:** si aplicar falla, también se borran las asignaciones agregadas y los gerentes creados, dentro de la reversión manual de `aplicarConsolidacion`. El respaldo `antes-de-consolidar-*` ya lo cubre.
- **Resumen antes/después:** una línea "Gerentes agregados a la campaña: N", con los nombres.
- Con la campaña cerrada no se consolida (sin cambios).
- "Solo lo que cambió desde mi último envío": un cambio de jefe cuenta como cambio de la asignación (por `actualizado_en`), así que la asignación vuelve a viajar.

## Restricciones (del proyecto)

- Lógica en `domain/` con su prueba primero. Flujos de UI en `*.ui.test.tsx`, incluido el arrastre si se puede simular, o, si no, por `docs/checklist-mvp.md`.
- Migración agregada, no editada. SQL con `?`.
- UI en español. Sin `<select>`: `BuscadorSelect`.
- Actualizar `CLAUDE.md` (arquitectura y comportamientos de consolidar) al terminar.

## Queda al constructor

- La librería o técnica del arrastre (HTML5 drag and drop ya se usa en `ColumnasMenu`) y el dibujo del organigrama.
- Nombres de funciones y archivos, más allá de los sugeridos.
- Cómo se ve "· N debajo" y la flechita, siguiendo el estilo de la fila del día.
