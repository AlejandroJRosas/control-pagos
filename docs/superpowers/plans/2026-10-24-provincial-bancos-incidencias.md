# Provincial, nombres de banco, incidencias y ajustes del árbol — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Directos primero en el árbol; el Provincial sin bloqueo de duplicados (con aviso de "posible repetido"); un solo nombre por banco (con alias recordados al importar); mover varios gerentes a la vez en Estructura; filtro "Con incidencias" en Importar y en la revisión del lote.

**Architecture:** Lo puro va en `domain/` (`arbol.ts`, `bancos.ts`, `incidencias.ts`, `consolidar.ts`); los repos guardan el banco con su nombre canónico (así todo lo guardado queda unificado y `claveBanco` sigue siendo pura); los alias que elige el usuario viven en la tabla `bancos_alias`. La UI solo consume esas funciones.

**Tech Stack:** Tauri + React 19 + Base UI (shadcn) + Tailwind, TypeScript, vitest (proyectos "logica" y "ui"), sql.js en pruebas, decimal.js.

**Spec:** `docs/superpowers/specs/2026-10-24-provincial-bancos-incidencias-design.md`

## Global Constraints

- UI y mensajes en español; fechas `dd/mm/aaaa` en pantalla, `YYYY-MM-DD` en BD. Montos como texto decimal; comparar montos con `Decimal`, nunca como texto ni `number`.
- SQL solo con `?`. Migraciones: **agregar** la v9, no editar las anteriores, una sentencia por elemento, `IF NOT EXISTS`.
- Lógica nueva con su prueba primero (`domain/` o `db/`); flujos de UI en `*.ui.test.tsx` con `renderApp(ruta, { db, hoy })`. `pnpm test` y `pnpm build` en verde al cerrar cada tarea.
- Escrituras de varios pasos: todo o nada con reversión manual (no hay transacciones entre llamadas).
- Errores de negocio con `DomainError` (mensaje en español). Botón deshabilitado por una regla → `BotonConMotivo`. Desplegables → `BuscadorSelect`, nunca `<select>`.
- Los filtros nuevos de Importar y del lote **no** van en la URL.
- No metas: detectar el Provincial por otra cosa que el nombre del banco; unificar nombres en tasas u otras tablas; alias en el `.cpagos`.
- Estilo a mano (~160 columnas), sin prettier; finales de línea LF; archivos con `\` escritos con la herramienta de archivos. Commits en español con prefijo, directo en `main`, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisiones del plan (sobre lo que la spec deja abierto)

- **`claveBanco` queda pura** (solo `ALIAS` fijo). Los alias recordados se aplican **al guardar**: `createDeposito`/`updateDeposito` guardan `bancoCanonico(banco, conocidos)` cuando no es `null`, y `findDuplicados`/`findPosiblesRepetidos` canonizan el banco que reciben antes de comparar. Como todo lo guardado ya es canónico, los duplicados se detectan con los nombres nuevos sin pasar alias a cada comparación.
- **Bancos conocidos** = `BANCOS_SUGERIDOS` (se agrega "Plaza", que ya está como destino en `ALIAS`) + los valores de `ALIAS` + los alias recordados + los bancos ya usados en depósitos (cada uno apunta a sí mismo). Así un banco escrito antes a mano no se vuelve a preguntar al importar. Todo eso lo arma `bancosConocidos(db)` como mapa `claveComparacion → nombre`.
- **Unificar lo guardado** no puede hacerse en SQL (la clave quita acentos y espacios): la v9 solo crea la tabla, y `unificarBancos(db)` (idempotente, solo toca filas cuyo banco cambia) corre en `mantenimientoAlIniciar`.
- **Cédula del Provincial**: para el posible repetido se compara solo por los dígitos sin ceros iniciales ("V-12.345.678" = "12345678").
- **Consolidar, "no entra"** = es el mismo pago: al aplicar se guarda la equivalencia (uuid remoto → id local), igual que un vínculo, para que no vuelva a preguntarse en el próximo intercambio. Si hay varios locales iguales, se vincula al primero que no tenga ya una equivalencia de ese archivo.
- **Esc en Estructura** con selección limpia la selección y **no** vuelve atrás (el Esc de `PageHeader` queda inactivo mientras haya elegidos).

## Review Focus

- Esc con gerentes elegidos en Estructura: debe soltar la selección y no navegar a la miga anterior (el `PageHeader` ya escucha Esc). Prueba en la Task 9.
- Cédula escrita distinto ("V-12.345.678", "12345678", "012345678") y monto con o sin separadores ("1.500,00" y "1500") en dos pagos del Provincial: deben contar como posible repetido. Prueba en la Task 2.
- `unificarBancos` corre en cada arranque: la segunda vez no debe tocar ninguna fila ni cambiar `actualizado_en` (si no, cada apertura generaría "correcciones" al consolidar). Prueba en la Task 3.
- Importar con dos archivos abiertos que traen el mismo banco desconocido: al elegirlo en uno se aplica también en el otro, y la fila deja de estar bloqueada en ambos. Prueba en la Task 6.
- En la revisión del lote con "Con incidencias", el borrador que se está editando no debe desaparecer de la lista al corregirlo (sigue visible hasta que se pasa a otro). Prueba en la Task 8.

---

### Task 1: Orden del árbol, directos primero

**Files:**
- Modify: `src/domain/arbol.ts` (`armarArbol`)
- Test: `src/domain/arbol.test.ts`

**Interfaces:**
- Produces: `armarArbol` con la misma firma; entre hermanos (y entre las raíces), primero los nodos sin hijos y después los que tienen, conservando dentro de cada grupo el orden de `items`.

- [ ] **Step 1: Prueba que falla** — `it("armarArbol pone primero a los que no tienen a nadie debajo, sin cambiar el orden dentro de cada grupo")`: items en orden `[Ana(1), Beto(2), Carla(3), Dora(4), Eva(5), Fito(6)]` con jefes `2→1, 4→2, 3→1, 5→null(raíz), 6→1`. Esperado: raíces `[Eva, Ana]` (Eva no tiene hijos); hijos de Ana `[Carla, Fito, Beto]`; hijos de Beto `[Dora]`.
- [ ] **Step 2:** `pnpm test src/domain/arbol.test.ts` → FALLA por el orden.
- [ ] **Step 3:** En `armarArbol`, después de armar los hijos de cada nodo, partir cada lista de hermanos (y la de raíces) en `sin hijos` + `con hijos` (partición estable, sin `sort`).
- [ ] **Step 4:** `pnpm test` → pasa todo (revisar que las pruebas de `PorGerenteTab`, `EstructuraTab` y `CompartirConsolidarDialog` que dependían del orden sigan en verde; si alguna asumía el orden viejo, ajustar el orden esperado, no la lógica).
- [ ] **Step 5:** Commit `feat: en el árbol, los directos primero y después los que tienen equipo`.

### Task 2: Bancos — nombre canónico, Provincial sin clave de duplicado, posible repetido

**Files:**
- Modify: `src/domain/bancos.ts`
- Test: `src/domain/bancos.test.ts`

**Interfaces:**
- Produces:
  - `BANCOS_SUGERIDOS` con "Plaza".
  - `export type BancosConocidos = ReadonlyMap<string, string>` (clave `claveComparacion` → nombre).
  - `export function bancoCanonico(nombre: string, conocidos: BancosConocidos = new Map()): string | null` — por clave contra `BANCOS_SUGERIDOS` y valores de `ALIAS`, luego `ALIAS`, luego `conocidos`; `null` si no lo conoce o está vacío.
  - `export const BANCOS_SIN_REFERENCIA_UNICA = ["Provincial"]` y `export function sinReferenciaUnica(banco: string): boolean` (por `claveBanco`).
  - `claveDuplicado(banco, referencia)` devuelve `""` si `sinReferenciaUnica(banco)`.
  - `export function clavePosibleRepetido(banco: string, referencia: string, fecha: string, montoBs: string): string` — `""` si no es del Provincial o falta algo; si no, `dígitos de la referencia sin ceros iniciales` + `\u001f` + `fecha` + `\u001f` + `new Decimal(montoBs).toFixed()`. Monto inválido → `""`.

- [ ] **Step 1: Pruebas que fallan**
  - `bancoCanonico("BANCO PROVINCIAL")` → `"Provincial"`; `"bbva provincial"` → `"Provincial"`; `"banesco"` → `"Banesco"`; `"Banco Plaza"` → `"Plaza"`; `"BANCO XYZ"` → `null`; `bancoCanonico("BANCO XYZ", new Map([["bancoxyz", "Bancamiga"]]))` → `"Bancamiga"`; `""` → `null`.
  - `claveDuplicado("BBVA Provincial", "12345678")` → `""`; `claveDuplicado("Banesco", "123")` sigue igual que antes (no vacía).
  - `clavePosibleRepetido("Provincial", "V-12.345.678", "2026-10-20", "1500.00")` es igual a `clavePosibleRepetido("BANCO PROVINCIAL", "012345678", "2026-10-20", "1500")` (montos en el formato guardado); distinta si cambia la fecha o el monto; `""` para `"Banesco"`; `""` si la referencia no tiene dígitos.
- [ ] **Step 2:** `pnpm test src/domain/bancos.test.ts` → FALLA (no existen).
- [ ] **Step 3:** Implementar en `src/domain/bancos.ts`.
- [ ] **Step 4:** `pnpm test` → pasa todo. Las pruebas existentes que esperaban bloqueo de duplicado con "Provincial" (buscar `Provincial` en `src/**/*.test.ts*`) se cambian a otro banco o pasan a esperar que no bloquee.
- [ ] **Step 5:** Commit `feat: el Provincial no tiene clave de duplicado; nombre canónico y posible repetido de bancos`.

### Task 3: Alias recordados, guardado canónico y unificación de lo guardado

**Files:**
- Modify: `src/db/migrations.ts` (v9), `src/db/repos/depositos.ts`, `src/platform/backup.ts` (`mantenimientoAlIniciar`)
- Create: `src/db/repos/bancosAlias.ts`, `src/db/operaciones/unificarBancos.ts`
- Test: `src/db/repos/bancosAlias.test.ts`, `src/db/operaciones/unificarBancos.test.ts`, `src/db/repos/depositos.test.ts`, `src/db/migrations.test.ts`

**Interfaces:**
- Consumes: `bancoCanonico`, `BancosConocidos`, `clavePosibleRepetido` (Task 2).
- Produces:
  - v9: `CREATE TABLE IF NOT EXISTS bancos_alias (alias TEXT PRIMARY KEY, banco TEXT NOT NULL)`.
  - `bancosAlias.ts`: `guardarAliasBanco(db, nombre: string, banco: string): Promise<void>` (alias = `claveComparacion(nombre)`, upsert) y `bancosConocidos(db): Promise<BancosConocidos>` (alias recordados + `listBancosUsados` apuntando a sí mismos; los recordados ganan).
  - `createDeposito`/`updateDeposito` guardan `bancoCanonico(v.banco, await bancosConocidos(db)) ?? v.banco`.
  - `findDuplicados` canoniza el banco recibido antes de comparar.
  - `findPosiblesRepetidos(db, d: { banco: string; referencia: string; fecha: string; montoBs: string }, excludeId?: number): Promise<Duplicado[]>` — depósitos de esa fecha (cualquier campaña) con la misma `clavePosibleRepetido`; `[]` si la clave es `""`.
  - `unificarBancos(db): Promise<number>` — para cada `DISTINCT banco` de `depositos` cuyo canónico (con `bancosConocidos`) sea distinto, `UPDATE ... SET banco = ?, actualizado_en = ? WHERE banco = ?`; lo mismo en el `$.draft.banco` de `cola_depositos` (con `json_set`, sin tocar `actualizado_en` de la cola si no tiene). Devuelve cuántos depósitos cambió. Corre en `mantenimientoAlIniciar` (después del respaldo automático, como lo demás).

- [ ] **Step 1: Pruebas que fallan**
  - `migrations.test.ts`: tras `migrate`, `bancos_alias` existe; `migrate(db, 8)` y luego `migrate(db)` también.
  - `bancosAlias.test.ts`: `guardarAliasBanco(db, "BANCO XYZ", "Bancamiga")` → `bancosConocidos(db).get("bancoxyz") === "Bancamiga"`; guardarlo de nuevo con otro banco lo reemplaza; un banco usado "Banco Caroní" aparece como `"bancocaroni" → "Banco Caroní"`.
  - `depositos.test.ts`: `createDeposito` con banco `"BBVA PROVINCIAL"` guarda `"Provincial"`; con `"BANCO XYZ"` y el alias recordado guarda `"Bancamiga"`; con un banco desconocido lo guarda tal cual. Dos depósitos del Provincial con la misma cédula se crean sin `DUPLICADO`. `findPosiblesRepetidos` encuentra el de la misma cédula+fecha+monto en otra campaña, no encuentra si cambia el monto, y excluye `excludeId`. `findDuplicados(db, "BDV", ref)` encuentra el guardado como "Venezuela".
  - `unificarBancos.test.ts`: con depósitos insertados por SQL directo con bancos `"BBVA Provincial"`, `"Banco Mercantil"`, `"Banesco"` y un borrador de cola con `"banco provincial"`: devuelve 2, quedan `"Provincial"`, `"Mercantil"`, `"Banesco"` y el borrador con `"Provincial"`; solo cambia `actualizado_en` de los dos que cambiaron; **una segunda llamada devuelve 0 y no cambia ningún `actualizado_en`**.
- [ ] **Step 2:** `pnpm test src/db` → FALLAN.
- [ ] **Step 3:** Implementar migración, repo, cambios en `depositos.ts`, operación y la llamada en `mantenimientoAlIniciar` (si falla, que no impida el arranque: `reportError` y seguir, como lo demás del mantenimiento).
- [ ] **Step 4:** `pnpm test` y `pnpm build` → verde.
- [ ] **Step 5:** Commit `feat: nombres de banco unificados al guardar y alias de banco recordados`.

### Task 4: Posible repetido en el registro, el lote y la importación

**Files:**
- Modify: `src/features/deposito/useDepositoForm.ts`, `src/features/deposito/DepositoCampos.tsx`, `src/db/operaciones/importarPagos.ts`, `src/features/importar/ArchivoCard.tsx`
- Test: `src/db/operaciones/importarPagos.test.ts`, `src/features/deposito/deposito.ui.test.tsx` (o el archivo de UI del depósito que ya exista), `src/features/lote/revision.ui.test.tsx`

**Interfaces:**
- Consumes: `findPosiblesRepetidos`, `clavePosibleRepetido`, `claveDuplicado` (Tasks 2-3).
- Produces:
  - `useDepositoForm` expone `posiblesRepetidos: Duplicado[]` (con el mismo debounce que `duplicados`, excluyendo el depósito que se edita).
  - `DepositoCampos` muestra `<Aviso tono="warning">` con el texto exacto "Posible repetido: ya hay un pago del Provincial de esta cédula con la misma fecha y monto" y la lista (fecha · gerente · campaña · monto) como el de duplicados. No bloquea guardar ni "Hecho".
  - `FilaPlan` gana `posiblesRepetidos: Duplicado[]` y `repetidaPosibleEnArchivo: number | null` (fila anterior del mismo archivo con la misma `clavePosibleRepetido`). `importable` **no** cambia por ellos; `marcada = importable && estadoTasa !== "distinta" && posiblesRepetidos.length === 0 && repetidaPosibleEnArchivo === null`.
  - El mapa `vistas` de `planificarImportacion` no registra claves `""` (si no, todas las filas del Provincial serían "repetida en el archivo" bloqueante).

- [ ] **Step 1: Pruebas que fallan**
  - `importarPagos.test.ts`: un cuadro con tres filas del "BANCO PROVINCIAL" con la misma cédula: dos con distinta fecha o monto → ambas `importable` y `marcada`, sin `repetidaEnArchivo`; una tercera igual a la primera → `importable`, **no** `marcada`, `repetidaPosibleEnArchivo` = número de la primera. Con un depósito ya registrado igual (cédula+fecha+monto) → la fila tiene `posiblesRepetidos.length === 1`, `importable`, no `marcada`. Importarla marcada crea el depósito (no lanza `DUPLICADO`).
  - UI del depósito: con un depósito del Provincial registrado, escribir otro con la misma cédula, fecha y monto muestra el aviso y "Guardar" sigue habilitado; al guardar quedan los dos.
  - `revision.ui.test.tsx`: un borrador del Provincial igual a uno registrado muestra el aviso y "Hecho" lo guarda.
- [ ] **Step 2:** `pnpm test` → FALLAN.
- [ ] **Step 3:** Implementar. En `ArchivoCard`, la fila con posible repetido lleva el texto "Posible repetido" donde hoy se muestran duplicados/repetidas (la Task 7 lo junta en el ícono de incidencias).
- [ ] **Step 4:** `pnpm test` y `pnpm build` → verde.
- [ ] **Step 5:** Commit `feat: aviso de posible repetido del Provincial al registrar, en el lote y al importar`.

### Task 5: Consolidar — banco canónico y "Posibles repetidos"

**Files:**
- Modify: `src/domain/consolidar.ts`, `src/domain/consolidarResumen.ts`, `src/db/operaciones/consolidar.ts`, `src/features/consolidar/Secciones.tsx`, `src/features/consolidar/ConsolidarPage.tsx`
- Test: `src/domain/consolidar.test.ts`, `src/db/operaciones/consolidarIdaYVuelta.test.ts`, `src/features/consolidar/consolidar.ui.test.tsx`

**Interfaces:**
- Consumes: `clavePosibleRepetido`, `claveBanco` (Task 2); guardado canónico (Task 3).
- Produces:
  - `compararCampos` compara `banco` con `claveBanco` (un cambio solo al nombre canónico no es cambio → cuenta en `sinCambios`).
  - `export type PosibleRepetido = { remoto: DepositoPaquete; locales: DepositoLocal[]; asignacionId: number; tasa: TasaUsada }` y `plan.posiblesRepetidos: PosibleRepetido[]`: un depósito del archivo que iría a `nuevos`, con `clavePosibleRepetido` no vacía, que coincide con depósitos **locales** (no eliminados por el archivo). Dos iguales dentro del archivo sin local igual entran los dos como nuevos.
  - `Decisiones.entranRepetidos: Set<string>` (uuids remotos), vacío en `decisionesIniciales`.
  - `aplicarConsolidacion`: los de `entranRepetidos` se crean como nuevos; los demás se vinculan como el mismo pago (se guarda la equivalencia remoto → local, al primer local sin equivalencia de ese archivo) y no se crean. El resumen antes/después cuenta solo los que entran.
  - Sección "Posibles repetidos" en `Secciones.tsx` (después de "Nuevos"): por fila, el del archivo y el/los locales lado a lado (fecha, gerente, cédula, monto) y una casilla "Es otro pago: que entre" (desmarcada).

- [ ] **Step 1: Pruebas que fallan**
  - `consolidar.test.ts`: un remoto del Provincial igual a un local (otra uuid, sin equivalencia) → va a `posiblesRepetidos`, no a `nuevos`; uno de Banesco igual en todo menos la uuid y la referencia no se ve afectado; una corrección cuyo único cambio es `"BBVA Provincial"` → `"Provincial"` cuenta como sin cambios.
  - `consolidarIdaYVuelta.test.ts`:
    - "dos pagos reales iguales del Provincial": A registra P1 y P2 (misma cédula, fecha y monto); B recibe → entran los dos (B tiene 2); B le devuelve a A → A sigue con 2.
    - "el mismo pago registrado en las dos apps": A y B registran por separado el mismo pago; B recibe el de A con decisiones iniciales → B sigue con 1; A recibe luego el de B → A sigue con 1 y ya no aparece como posible repetido en un segundo intercambio (quedó vinculado).
    - "Es otro pago": B tiene Q igual a P1 y P2 de A; B recibe y marca los dos en `entranRepetidos` → B tiene 3, y un nuevo envío de A no vuelve a preguntar.
  - `consolidar.ui.test.tsx`: la sección aparece con su conteo, por defecto desmarcada; al marcar "Es otro pago: que entre" y aplicar, el depósito queda en la campaña.
- [ ] **Step 2:** `pnpm test` → FALLAN.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test` y `pnpm build` → verde.
- [ ] **Step 5:** Commit `feat: consolidar separa los posibles repetidos del Provincial y compara el banco por su nombre canónico`.

### Task 6: Importar — bancos que no conozco

**Files:**
- Modify: `src/db/operaciones/importarPagos.ts`, `src/features/importar/ImportarPage.tsx`, `src/features/importar/ArchivoCard.tsx`
- Create: `src/features/importar/BancosDesconocidos.tsx`
- Test: `src/db/operaciones/importarPagos.test.ts`, `src/features/importar/importar.ui.test.tsx` (o el de UI de Importar que exista)

**Interfaces:**
- Consumes: `bancoCanonico`, `bancosConocidos`, `guardarAliasBanco` (Tasks 2-3).
- Produces:
  - En `planificarImportacion`, cada fila con banco pasa por `bancoCanonico(banco, conocidos)`: si lo conoce, la fila queda con el nombre canónico (y con ese se buscan duplicados); si no, `bancoDesconocido: true` y la fila no es `importable` (`problemas` no cambia: es un campo nuevo de `FilaPlan`).
  - `BancosDesconocidos({ nombres: string[]; bancos: string[]; onElegir: (nombre: string, banco: string) => Promise<void> })`: título "Bancos del archivo que no conozco"; por nombre, "<NOMBRE> es…" con un `BuscadorSelect` de `bancos` (`sugerenciasBancos(listBancosUsados)`) más la opción "Es un banco nuevo: dejar este nombre" (elige el mismo nombre). Arriba de las tablas en `ImportarPage`, con los nombres distintos de todos los archivos abiertos.
  - Al elegir: `guardarAliasBanco(db, nombre, banco)` y se vuelve a planificar **todos** los archivos abiertos (con `ajustarMarcadas`), así se aplica a todas las filas con ese nombre.

- [ ] **Step 1: Pruebas que fallan**
  - `importarPagos.test.ts`: fila con `"BANCO XYZ"` → `bancoDesconocido`, no `importable`; con el alias recordado a "Bancamiga" → `banco === "Bancamiga"`, `importable`; fila con `"BANCO MERCANTIL"` → `banco === "Mercantil"` sin preguntar; un depósito ya registrado de "Mercantil" con la misma referencia sale como duplicado aunque el Excel diga "BANCO MERCANTIL".
  - UI: con dos archivos que traen "BANCO XYZ", la lista lo muestra una vez; al elegir "Bancamiga" desaparece de la lista y las filas de los dos archivos pasan a "Bancamiga" e importables; tras importar, una nueva importación del mismo nombre ya no pregunta. "Es un banco nuevo" deja "BANCO XYZ" y tampoco vuelve a preguntar.
- [ ] **Step 2:** `pnpm test` → FALLAN.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test` y `pnpm build` → verde.
- [ ] **Step 5:** Commit `feat: importar pregunta por los bancos que no conoce y recuerda la respuesta`.

### Task 7: Importar — filtro de incidencias

**Files:**
- Create: `src/domain/incidencias.ts` (si `FilaPlan` arrastra imports de `db/`, la función de la fila va en `src/features/importar/incidencias.ts` con su prueba al lado), `src/components/IconoIncidencias.tsx`
- Modify: `src/features/importar/ArchivoCard.tsx`
- Test: `src/features/importar/incidencias.test.ts`, UI de Importar

**Interfaces:**
- Consumes: `FilaPlan` con `problemas`, `duplicados`, `repetidaEnArchivo`, `posiblesRepetidos`, `repetidaPosibleEnArchivo` (Task 4), `bancoDesconocido` (Task 6), `estadoTasa`/`PROBLEMAS_TASA`.
- Produces:
  - `motivosFila(f: FilaPlan): string[]` — en este orden y con este texto: cada uno de `f.problemas` tal cual; `"Ya está registrado"` si hay duplicados; `"Repetida en el archivo (fila N)"`; `"Posible repetido"` (registrado o en el archivo, fila N); `"Banco desconocido"`; `"Tasa distinta a la registrada"` si `estadoTasa === "distinta"`. (La tasa faltante ya llega en `problemas`.)
  - `IconoIncidencias({ motivos: string[] })`: ícono de aviso ámbar (`TriangleAlert`) con los motivos en un `Tooltip` de Base UI, uno por línea; nada si `motivos` está vacío.
  - En cada `ArchivoCard`: chips "Todas (N) / Bien (N) / Con incidencias (N)" (como los de "Por gerente"); estado local, no en la URL; se combinan con la búsqueda; "marcar todos" actúa sobre las filas visibles.

- [ ] **Step 1: Pruebas que fallan** — `motivosFila` con una fila limpia → `[]`; con "Falta el banco" → `["Falta el banco"]`; con duplicado + banco desconocido → `["Ya está registrado", "Banco desconocido"]`; con `repetidaPosibleEnArchivo: 3` → contiene `"Posible repetido (fila 3)"`. UI: un archivo con 3 filas bien y 2 con incidencias muestra "Con incidencias (2)"; al elegirlo se ven 2 filas con su ícono; "marcar todos" marca solo las importables visibles.
- [ ] **Step 2:** `pnpm test` → FALLAN.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test` y `pnpm build` → verde.
- [ ] **Step 5:** Commit `feat: filtro de incidencias al importar`.

### Task 8: Revisión del lote — filtro de incidencias

**Files:**
- Modify: `src/domain/incidencias.ts` (o crear `src/domain/incidenciasCola.ts`), `src/features/lote/RevisionLayout.tsx`, `src/features/lote/RevisionDepositosPage.tsx`
- Create: `src/db/queries/incidenciasCola.ts`
- Test: `src/domain/incidenciasCola.test.ts`, `src/db/queries/incidenciasCola.test.ts`, `src/features/lote/revision.ui.test.tsx`

**Interfaces:**
- Consumes: `BorradorDeposito` (`db/repos/cola.ts`), `validateDestino`, `clavePosibleRepetido`, `claveDuplicado`, `duplicadosEnCola`, `fechaDeTasa`, `IconoIncidencias` (Task 7).
- Produces:
  - `export type ContextoIncidencia = { duplicado: boolean; posibleRepetido: boolean; faltaTasa: boolean }`.
  - `motivosBorrador(formato: string | null, b: BorradorDeposito, ctx: ContextoIncidencia): string[]` — `"No se reconoció el comprobante"` si `formato` es null; `"Falta la fecha"`, `"Falta el banco"`, `"Falta la referencia"`, `"Falta el monto"`, `"Falta el gerente"` (destino sin elegir); `"Revisar: <campo>"` por cada campo con `auto.estado[campo] === "ocr"` y `auto.confianza[campo] < 0.9`; `"Duplicado"`, `"Posible repetido"`, `"Falta la tasa"`.
  - `contextoIncidencias(db, items: ItemColaDeposito[]): Promise<Map<number, ContextoIncidencia>>` — una sola lectura de depósitos, tasas y feriados; duplicado = contra registrados (`claveDuplicado`) o en la cola (`duplicadosEnCola`); posible repetido = contra registrados o contra otro pendiente de la cola; falta tasa = no hay tasa en `fechaDeTasa(fecha, feriados)`. Solo pendientes.
  - `Filtro` = `"pendientes" | "hechos" | "todos" | "incidencias"`; `ElementoLista` gana `motivos?: string[]` (el ícono va en la fila); el chip dice "Con incidencias (N)". La lista y ↑/↓ y "siguiente pendiente" recorren lo visible. El borrador actual sigue en la lista aunque deje de tener incidencias, hasta pasar a otro.

- [ ] **Step 1: Pruebas que fallan**
  - `motivosBorrador`: borrador completo con confianza 0,95 y ctx limpio → `[]`; `formato: null` → incluye `"No se reconoció el comprobante"`; referencia con `estado "ocr"` y confianza 0,7 → incluye `"Revisar: referencia"`; la misma con `estado "tocado"` → no.
  - `contextoIncidencias`: un pendiente con banco+referencia de un registrado → `duplicado`; dos pendientes del Provincial iguales → los dos `posibleRepetido`; uno con fecha sábado sin tasa del lunes → `faltaTasa`.
  - UI: con 3 pendientes (1 con incidencias), elegir "Con incidencias (1)" deja uno visible con su ícono; ↓ no sale de lo visible; corregir el campo que faltaba no lo saca de la lista hasta elegir otro, y el conteo pasa a (0).
- [ ] **Step 2:** `pnpm test` → FALLAN.
- [ ] **Step 3:** Implementar (el contexto se recalcula con `useData` y se invalida con lo demás de la cola).
- [ ] **Step 4:** `pnpm test` y `pnpm build` → verde.
- [ ] **Step 5:** Commit `feat: filtro de incidencias en la revisión del lote`.

### Task 9: Estructura — elegir y mover varios a la vez

**Files:**
- Create: `src/db/operaciones/moverAJefe.ts`
- Modify: `src/features/campana/EstructuraTab.tsx`, `src/features/campana/CajitaGerente.tsx`, `src/components/PageHeader.tsx` (solo si hace falta para desactivar su Esc)
- Test: `src/db/operaciones/moverAJefe.test.ts`, `src/features/campana/estructura.ui.test.tsx` (el de UI de Estructura que exista)

**Interfaces:**
- Consumes: `clicSeleccion`, `SIN_SELECCION`, `Seleccion` (`domain/seleccion.ts`); `creaCiclo`, `descendientes`, `aplanarArbol` (`domain/arbol.ts`); `setJefeAsignacion`, `jefesDeCampana`.
- Produces:
  - `moverAJefe(db, ids: number[], jefeId: number | null): Promise<Map<number, number | null>>` — valida que todas sean de la misma campaña activa y que el mapa final no tenga ciclos (si alguno queda debajo de sí mismo, `DomainError("VALIDACION", "Un gerente no puede quedar debajo de sí mismo")` sin cambiar nada); aplica uno a uno y, si uno falla, devuelve los ya cambiados a su jefe anterior y relanza el error original. Devuelve los jefes anteriores (para Deshacer).
  - `restaurarJefes(db, anteriores: Map<number, number | null>): Promise<void>` en el mismo archivo, con la misma garantía (lo usa Deshacer).
  - En `EstructuraTab`: Ctrl+clic alterna, Shift+clic elige el rango en el orden en que se ven las cajitas (`aplanarArbol` sin plegados + "Sin estructura" al final), clic simple abre el gerente; Esc suelta la selección (y no vuelve atrás); arriba "N elegidos · Esc para soltar". Arrastrar una elegida mueve todas; una no elegida, solo esa. Un destino es válido solo si es válido para todas (no es una elegida ni está en la rama de una). Aviso: `"3 gerentes ahora están bajo Ana"` / `"3 gerentes ya no tienen jefe"` con Deshacer (`restaurarJefes`); con uno solo se mantiene el texto de hoy. Campaña cerrada: sin selección ni arrastre.

- [ ] **Step 1: Pruebas que fallan**
  - `moverAJefe.test.ts`: mueve B y C bajo A y devuelve sus jefes anteriores; `restaurarJefes` los deja como estaban; mover A bajo su nieto lanza y no cambia ninguno; si la escritura del segundo falla (driver que falla en la 2.ª `UPDATE`), el primero vuelve a su jefe y el error es el original; campaña cerrada → `CAMPANA_CERRADA`.
  - UI: Ctrl+clic en dos cajitas muestra "2 elegidos · Esc para soltar"; Shift+clic elige el rango; clic simple sigue abriendo al gerente; arrastrar una elegida sobre Ana mueve las dos y muestra "2 gerentes ahora están bajo Ana"; Deshacer las devuelve; el destino que está en la rama de una elegida no se resalta y soltar ahí no mueve nada; **Esc con elegidos limpia la selección y la ruta no cambia**; campaña cerrada: Ctrl+clic no elige.
- [ ] **Step 2:** `pnpm test` → FALLAN.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test` y `pnpm build` → verde.
- [ ] **Step 5:** Commit `feat: elegir y mover varios gerentes a la vez en Estructura`.

### Task 10: Documentación

**Files:**
- Modify: `CLAUDE.md`, `docs/checklist-mvp.md`

- [ ] **Step 1:** CLAUDE.md: en "Reglas del dominio → Duplicados", la excepción del Provincial (`BANCOS_SIN_REFERENCIA_UNICA`, `clavePosibleRepetido`, aviso sin bloqueo, sección de consolidar y que "no entra" vincula); nombres de banco canónicos al guardar (`bancoCanonico`, `bancosConocidos`, `bancos_alias`, `unificarBancos` en el mantenimiento, `BancosDesconocidos` al importar); incidencias (`motivosFila`, `motivosBorrador`, `contextoIncidencias`, `IconoIncidencias`, no en la URL); selección múltiple en Estructura (`moverAJefe`/`restaurarJefes`, Esc); árbol con directos primero. Quitar de "Pendientes conocidos" la frase de la lista fija de alias si ya no aplica tal cual (sigue fija, pero ahora hay alias recordados).
- [ ] **Step 2:** `docs/checklist-mvp.md`: pruebas a mano — importar un Excel real del Provincial con cédulas repetidas, elegir un banco desconocido, mover varios en un organigrama grande, filtrar incidencias del lote.
- [ ] **Step 3:** Commit `docs: Provincial, nombres de banco, incidencias y selección múltiple en CLAUDE.md`.
