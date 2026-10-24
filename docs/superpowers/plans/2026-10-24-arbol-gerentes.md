# Árbol de gerentes por campaña — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada gerente de una campaña puede tener un jefe (otro gerente de la misma campaña). El árbol se ve en "Por gerente" y en un organigrama, se arma con un buscador o arrastrando, marca ramas enteras al compartir para consolidar, viaja en el `.cpagos` y, al consolidar, se arma en la otra app (agregando a la campaña a los gerentes que falten).

**Architecture:** Una columna `asignaciones.jefe_id`. Todo lo derivado (ramas, niveles, ciclos) se calcula en `src/domain/arbol.ts`, que es puro. Al consolidar, los gerentes que se agregan van como asignaciones **provisionales** con id negativo, para que `clasificar`, el resumen y la UI los traten como cualquier otra asignación. `aplicarConsolidacion` los crea primero y traduce cada id provisional al real.

**Tech Stack:** TypeScript, React 19, Base UI (shadcn), vitest + Testing Library, sql.js en pruebas / tauri-plugin-sql, decimal.js.

**Spec:** `docs/superpowers/specs/2026-10-24-arbol-gerentes-design.md`

## Global Constraints

- UI y mensajes en español. Fechas `dd/mm/aaaa` en pantalla.
- Migración **agregada** (v8), sin editar las existentes. SQL solo con `?`. Columnas snake_case, alias camelCase.
- El árbol no cambia ningún monto: `buildCampanaView`, Excel, PDF y estado de cuenta quedan intactos.
- Nada derivado en la BD (ni profundidad, ni conteos, ni ramas).
- Campaña cerrada = solo lectura: los repos lanzan `DomainError('CAMPANA_CERRADA')` y la UI usa `BotonConMotivo` con `MOTIVO_CERRADA`.
- Desplegables con `BuscadorSelect`, nunca `<select>`. Casillas con `Casilla` (`indeterminado`).
- Escrituras de varios pasos con reversión manual (el plugin SQL no da transacciones entre llamadas).
- Todo caso nuevo de intercambio va en `src/db/operaciones/consolidarIdaYVuelta.test.ts`.
- Archivos con LF. Sin prettier: estilo a mano, unas 160 columnas. Commits en español con prefijo (`feat:`, `fix:`, `docs:`, `test:`), directo en `main`.
- Verificación de cada tarea: `pnpm test` y `pnpm build` en verde.

## Review Focus

1. **Archivo viejo sin `jefe`.** No debe tocar el árbol de nadie. El caso es `jefe === undefined`, distinto de `null`, que significa "sin jefe" (Task 6, test `leerPaquete` y la ida y vuelta en Task 8).
2. **Elecciones que, juntas, forman una vuelta.** Cada fila de "Jefe distinto" puede ser válida sola y formar un ciclo con otra. Esto se bloquea en `motivoPendiente` y `aplicarConsolidacion` lo rechaza (Task 8, test "dos elecciones archivo que juntas forman ciclo").
3. **Sacar de la campaña a un jefe con gente debajo.** Sus hijos pasan a su jefe, sin error de llave foránea (Task 2, test `deleteAsignacion`). Eliminar una campaña con árbol tampoco debe fallar (Task 2).
4. **Consolidar dos veces el mismo archivo con gerentes agregados.** La segunda vez los reconoce por el uuid de la asignación, no agrega duplicados y no pregunta (Task 7, ida y vuelta).
5. **Una búsqueda en "Por gerente" con una rama plegada.** Debe mostrar a los que coinciden aunque estén dentro de la rama plegada: con filtros, lista plana (Task 4, UI test).

---

### Task 1: Lógica pura del árbol (`domain/arbol.ts`)

**Files:**
- Create: `src/domain/arbol.ts`
- Test: `src/domain/arbol.test.ts`

**Interfaces:**
- Produces:
  - `type Jefes = ReadonlyMap<number, number | null>`: id → id del jefe. Un id que no está en el mapa no tiene jefe.
  - `descendientes(jefes: Jefes, id: number): number[]`: todos los niveles, sin incluir `id`.
  - `creaCiclo(jefes: Jefes, id: number, jefeNuevo: number | null): boolean`: true si `jefeNuevo === id` o si `jefeNuevo` está en la rama de `id`.
  - `cicloEn(jefes: Jefes): number[] | null`: los ids de un ciclo (cualquiera), o null.
  - `type NodoArbol<T> = { item: T; hijos: NodoArbol<T>[] }`
  - `armarArbol<T>(items: T[], id: (t: T) => number, jefes: Jefes): NodoArbol<T>[]`: raíces en el orden de `items`, e hijos también en el orden de `items`. Un jefe que no está en `items` cuenta como sin jefe. Si hay un ciclo (no debería), sus nodos van como raíces.
  - `type FilaArbol<T> = { item: T; nivel: number; debajo: number; tieneHijos: boolean }`
  - `aplanarArbol<T>(nodos: NodoArbol<T>[], id: (t: T) => number, plegados?: ReadonlySet<number>): FilaArbol<T>[]`: preorden, sin entrar en los plegados. `debajo` cuenta todos los niveles.
  - `alternarRama(marcados: ReadonlySet<number>, jefes: Jefes, id: number): Set<number>`: si `id` está marcado, desmarca a él y a toda su rama; si no, los marca.
  - `estadoRama(marcados: ReadonlySet<number>, jefes: Jefes, id: number): "todo" | "parte" | "nada"`: sobre `id` y su rama.

- [ ] **Step 1: Write the failing tests**

```ts
// Árbol de ejemplo: 1 Ana → 2 Luis → (3 Pedro, 4 María); 1 Ana → 5 Carla; 6 José sin jefe.
const jefes: Jefes = new Map([[2, 1], [3, 2], [4, 2], [5, 1], [6, null]]);
it("descendientes de todos los niveles", () => {
  expect(descendientes(jefes, 1).sort()).toEqual([2, 3, 4, 5]);
  expect(descendientes(jefes, 3)).toEqual([]);
});
it("creaCiclo: a sí mismo o debajo de su rama", () => {
  expect(creaCiclo(jefes, 1, 1)).toBe(true);
  expect(creaCiclo(jefes, 1, 3)).toBe(true);
  expect(creaCiclo(jefes, 3, 5)).toBe(false);
  expect(creaCiclo(jefes, 2, null)).toBe(false);
});
it("cicloEn encuentra A→B→A", () => {
  expect(cicloEn(jefes)).toBeNull();
  expect(cicloEn(new Map([[1, 2], [2, 1], [3, 1]]))?.sort()).toEqual([1, 2]);
});
it("aplanarArbol en preorden con nivel, debajo y plegados", () => {
  const items = [1, 2, 3, 4, 5, 6];
  const filas = aplanarArbol(armarArbol(items, (x) => x, jefes), (x) => x);
  expect(filas.map((f) => [f.item, f.nivel, f.debajo])).toEqual([[1, 0, 4], [2, 1, 2], [3, 2, 0], [4, 2, 0], [5, 1, 0], [6, 0, 0]]);
  expect(aplanarArbol(armarArbol(items, (x) => x, jefes), (x) => x, new Set([2])).map((f) => f.item)).toEqual([1, 2, 5, 6]);
});
it("un jefe que no está en la lista cuenta como raíz", () => {
  expect(armarArbol([3, 4], (x) => x, jefes).map((n) => n.item)).toEqual([3, 4]);
});
it("alternarRama y estadoRama", () => {
  const m = alternarRama(new Set(), jefes, 2);
  expect([...m].sort()).toEqual([2, 3, 4]);
  expect(estadoRama(m, jefes, 1)).toBe("parte");
  expect(estadoRama(m, jefes, 2)).toBe("todo");
  expect([...alternarRama(m, jefes, 2)]).toEqual([]);
});
```

- [ ] **Step 2: Run `pnpm test src/domain/arbol.test.ts`.** Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement the functions above in `src/domain/arbol.ts`.** Recorrer subiendo por `jefes` con un `Set` de visitados para cortar ciclos.
- [ ] **Step 4: Run `pnpm test src/domain/arbol.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: lógica del árbol de gerentes`

---

### Task 2: Columna `jefe_id` y repo de asignaciones

**Files:**
- Modify: `src/db/migrations.ts` (versión 8)
- Modify: `src/db/repos/asignaciones.ts`
- Modify: `src/db/repos/gerentes.ts` (`createGerente` acepta el uuid)
- Modify: `src/db/operaciones/eliminarCampana.ts`
- Modify: `src/db/queries/campanaData.ts`
- Test: `src/db/repos/asignaciones.test.ts`, `src/db/operaciones/eliminarCampana.test.ts`, `src/db/migrations.test.ts` (si existe la prueba de versiones; si no, en `asignaciones.test.ts`)

**Interfaces:**
- Consumes: `creaCiclo` (Task 1).
- Produces:
  - Migración v8: `"ALTER TABLE asignaciones ADD COLUMN jefe_id INTEGER REFERENCES asignaciones(id)"` y `"CREATE INDEX IF NOT EXISTS idx_asignaciones_jefe ON asignaciones(jefe_id)"`. El comentario de la versión explica para qué es.
  - `AsignacionDetalle` gana `jefeId: number | null`.
  - `createAsignacion(db, v: { campanaId; gerenteId; saldoUsd; jefeId?: number | null }, o?: { uuid?: string }): Promise<number>`. El jefe se valida igual que en `setJefeAsignacion`.
  - `setJefeAsignacion(db, id: number, jefeId: number | null): Promise<void>` valida, en este orden:
    - que la campaña esté activa;
    - que el jefe exista y sea de la misma campaña: si no, `DomainError("VALIDACION", "El jefe tiene que ser un gerente de la misma campaña")`;
    - que no se cree un ciclo: si no, `DomainError("VALIDACION", "Un gerente no puede quedar debajo de sí mismo")`.
    Al guardar actualiza `actualizado_en`. Si el jefe no cambia, no escribe.
  - `jefesDeCampana(db, campanaId): Promise<Map<number, number | null>>`.
  - `deleteAsignacion`: antes de borrar, `UPDATE asignaciones SET jefe_id = ?, actualizado_en = ? WHERE jefe_id = ?`, con el jefe del que se borra (o NULL). Si el DELETE falla, se repone.
  - `eliminarCampana`: `UPDATE asignaciones SET jefe_id = NULL WHERE campana_id = ?` antes de borrar las asignaciones.
  - `createGerente(db, v, o?: { uuid?: string })`.
  - `CampanaData.asignaciones: (AsignacionData & { jefeId: number | null })[]` (`loadCampanaData` agrega `a.jefe_id AS jefeId`).

- [ ] **Step 1: Write the failing tests** en `asignaciones.test.ts`:

```ts
it("setJefeAsignacion guarda el jefe y rechaza ciclos, otra campaña y la campaña cerrada", async () => {
  // campaña con Ana(a), Luis(l), Pedro(p); otra campaña con Ana(x)
  await setJefeAsignacion(db, l, a);
  await setJefeAsignacion(db, p, l);
  expect(await jefesDeCampana(db, campanaId)).toEqual(new Map([[a, null], [l, a], [p, l]]));
  await expect(setJefeAsignacion(db, a, p)).rejects.toThrow("Un gerente no puede quedar debajo de sí mismo");
  await expect(setJefeAsignacion(db, a, a)).rejects.toThrow("Un gerente no puede quedar debajo de sí mismo");
  await expect(setJefeAsignacion(db, l, x)).rejects.toThrow("El jefe tiene que ser un gerente de la misma campaña");
  await setEstadoCampana(db, campanaId, "cerrada"); // usar la función real del repo de campañas
  await expect(setJefeAsignacion(db, l, null)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});
it("al quitar un jefe de la campaña, su gente pasa al jefe de él", async () => {
  // a ← l ← (p, m); l sin depósitos
  await deleteAsignacion(db, l);
  expect((await jefesDeCampana(db, campanaId)).get(p)).toBe(a);
  expect((await jefesDeCampana(db, campanaId)).get(m)).toBe(a);
});
it("createAsignacion acepta uuid y jefe", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: luisId, saldoUsd: "10", jefeId: a }, { uuid: "u-1" });
  expect((await getAsignacion(db, id))?.jefeId).toBe(a);
  expect((await db.select<{ uuid: string }>("SELECT uuid FROM asignaciones WHERE id = ?", [id]))[0].uuid).toBe("u-1");
});
```

En `eliminarCampana.test.ts`: `it("elimina una campaña con árbol sin fallar por el jefe")`, con dos asignaciones donde una es jefe de la otra. Comprueba que después no queda ninguna asignación.

- [ ] **Step 2: Run `pnpm test src/db`.** Expected: FAIL.
- [ ] **Step 3: Implement** la migración y los cambios de la lista de Interfaces.
- [ ] **Step 4: Run `pnpm test` y `pnpm build`.** Expected: PASS. Ojo: hay que agregar `jefeId` donde algún test construya `CampanaData` a mano.
- [ ] **Step 5: Commit** `feat: jefe de cada gerente en la campaña (migración 8)`

---

### Task 3: Elegir el jefe — formulario y jefe de la campaña anterior

**Files:**
- Create: `src/db/queries/jefesAnteriores.ts`
- Modify: `src/db/operaciones/agregarGerentes.ts`
- Modify: `src/features/campana/AsignacionFormDialog.tsx`, `src/features/campana/CampanaPage.tsx`, `src/features/campana/PorGerenteTab.tsx` (el botón)
- Test: `src/db/operaciones/agregarGerentes.test.ts`, `src/features/campana/arbolGerentes.ui.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `setJefeAsignacion`, `createAsignacion`, `jefesDeCampana` (Task 2); `descendientes` (Task 1).
- Produces:
  - `jefesAnteriores(db, campanaId: number, gerenteIds: number[]): Promise<Map<number, number>>`: para cada gerente, el **gerente** (`gerente_id`) que era su jefe en la campaña más reciente donde estuvo, sin contar `campanaId`. "Más reciente" usa el orden de `listCampanas`: `fecha_inicio DESC, id DESC`. No incluye a quien no tenía jefe allí.
  - `agregarGerentes(...)`: después de crear todas las asignaciones, pone a cada nueva el jefe propuesto si ese gerente tiene asignación en la campaña (de antes o de esta tanda). Si algo falla, se revierte todo, como hoy.
  - `AsignacionEditable` pasa a `{ id; gerenteNombre; saldoUsd; jefeId: number | null }`, y `AsignacionFormDialog` recibe `companeros: { id: number; gerenteNombre: string }[]` y `jefes: Jefes`.

- [ ] **Step 1: Write the failing test** en `agregarGerentes.test.ts`:

```ts
it("propone el jefe de la campaña anterior si ese jefe está en la campaña", async () => {
  // Febrero: Ana jefa de Luis y de Pedro. Marzo (nueva): ya está Ana; se agregan Luis y Pedro, y Pedro tenía de jefe a Rosa, que no está.
  const [luisM, pedroM] = await agregarGerentes(db, marzo, [{ gerenteId: luis, saldoUsd: "1" }, { gerenteId: pedro, saldoUsd: "1" }]);
  const jefes = await jefesDeCampana(db, marzo);
  expect(jefes.get(luisM)).toBe(anaMarzo);
  expect(jefes.get(pedroM)).toBeNull(); // su jefe anterior (Rosa) no está en marzo
});
it("el jefe puede llegar en la misma tanda", async () => { /* Ana y Luis se agregan juntos: Luis queda bajo Ana */ });
```

- [ ] **Step 2: Run `pnpm test src/db/operaciones/agregarGerentes.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement** `jefesAnteriores` (una consulta con `ROW_NUMBER() OVER (PARTITION BY a.gerente_id ORDER BY c.fecha_inicio DESC, c.id DESC)`; sql.js y SQLite del plugin la soportan) y el paso en `agregarGerentes`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: El formulario.**
  - `AsignacionFormDialog` pasa a llamarse "Editar a {nombre} en la campaña" y gana un campo "Jefe" (`BuscadorSelect`, id `a-jefe`). Las opciones son "Sin jefe" (valor `""`) y los compañeros, sin él mismo ni nadie de su rama (`descendientes`).
  - Guarda el saldo (si cambió) y después el jefe (si cambió). `sucio` cuenta los dos.
  - En `PorGerenteTab`, el botón "Editar saldo" pasa a decir "Editar".
  - `CampanaPage` arma `companeros` y `jefes` desde `data.asignaciones`.
  - UI test `it("el formulario del gerente elige su jefe y no ofrece a su propia rama")`:
    - abre "Editar" de Luis y elige Ana;
    - en la BD queda `jefe_id`;
    - al abrir a Ana, en el buscador de jefe no aparece Luis.
- [ ] **Step 6: Run `pnpm test` y `pnpm build`.** Expected: PASS. Los UI tests que buscaban "Editar saldo" o "Saldo de" se actualizan.
- [ ] **Step 7: Commit** `feat: elegir el jefe del gerente y proponer el de la campaña anterior`

---

### Task 4: "Por gerente" en árbol

**Files:**
- Create: `src/lib/ramasPlegadas.ts` (+ `ramasPlegadas.test.ts`)
- Modify: `src/features/campana/PorGerenteTab.tsx`, `src/features/campana/CampanaPage.tsx`
- Test: `src/features/campana/arbolGerentes.ui.test.tsx`

**Interfaces:**
- Consumes: `armarArbol`, `aplanarArbol`, `Jefes` (Task 1); `CampanaData.asignaciones[].jefeId` (Task 2).
- Produces:
  - `useRamasPlegadas(clave: string): { plegados: Set<number>; alternar(id: number): void; plegar(ids: number[], plegar: boolean): void }`. Mismo patrón que `useDiasPlegados`. Se guarda en localStorage con el prefijo `control-pagos:ramas-plegadas:` y la clave `campana-<id>`. Lo exportado `normalizarRamas(guardado: unknown): number[]` se queda con enteros positivos sin repetir.
  - `PorGerenteTab` recibe `jefes: Jefes`.

- [ ] **Step 1: Write the failing tests.**
  - En `ramasPlegadas.test.ts`: `normalizarRamas([3, "x", 3, -1, 2.5])` da `[3]`.
  - UI test `it("Por gerente muestra el árbol con sangría, pliega ramas y con búsqueda u otro orden es lista plana")`:
    - con Ana ← Luis ← Pedro, la fila de Ana dice "· 2 debajo";
    - el orden de filas es Ana, Luis, Pedro (no alfabético por apellido);
    - el botón con aria-label "Plegar a Ana" oculta a Luis y a Pedro;
    - escribir "Pedro" en "Buscar gerente" muestra a Pedro aunque Ana esté plegada;
    - ordenar por "Restante" quita la sangría (la fila de Pedro no lleva `data-nivel="2"`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - El modo árbol se usa solo con el orden por defecto (`gerenteNombre`, dir 1) y sin `f.qg` ni `f.estado`. Entonces las filas salen de `aplanarArbol(armarArbol(ordenadas, a => a.asignacionId, jefes), …, plegados)`, y si no, como hoy.
  - En modo árbol, la celda Gerente lleva:
    - `data-nivel={nivel}` y un `padding-left` de `nivel * 1.25rem`;
    - un botón de chevron (`ChevronRight`/`ChevronDown`, `aria-label` "Plegar a X" / "Desplegar a X", con `stopPropagation`) si tiene hijos;
    - "· N debajo" en `text-muted-foreground`.
  - El pie suma las filas visibles **del filtro**, no las plegadas: las plegadas siguen contando en el total. *(Decisión mía: el total no cambia por plegar, igual que los días.)*
- [ ] **Step 4: Run `pnpm test` y `pnpm build`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: Por gerente muestra el árbol de la campaña`

---

### Task 5: Pestaña "Estructura" (organigrama con arrastre)

**Files:**
- Create: `src/features/campana/EstructuraTab.tsx`
- Modify: `src/features/campana/CampanaPage.tsx` (`PESTANAS = ["depositos", "gerentes", "estructura"]`, `TabsTrigger` "Estructura")
- Test: `src/features/campana/arbolGerentes.ui.test.tsx`

**Interfaces:**
- Consumes: `armarArbol`, `creaCiclo`, `descendientes` (Task 1); `setJefeAsignacion` (Task 2); `useRamasPlegadas` (Task 4, con la clave `estructura-<id>`).
- Produces: `EstructuraTab({ campanaId, gerentes: GerenteResumen[], jefes: Jefes, cerrada: boolean })`.

- [ ] **Step 1: Write the failing UI test** `it("Estructura dibuja la pirámide, arrastra para cambiar el jefe y deshace")`:
  - con Ana ← Luis, y José y Rosa sueltos, en `?tab=estructura`;
  - la región "Sin estructura" contiene a José y a Rosa;
  - la cajita de Luis está dentro del grupo de Ana (`within(cajitaAna-grupo)`);
  - con `fireEvent.dragStart(cajitaJose, { dataTransfer })` y `fireEvent.drop(cajitaAna, { dataTransfer })`, José queda con `jefe_id` = Ana;
  - un clic en "Deshacer" del aviso devuelve a José a sin jefe;
  - soltar a Ana sobre Luis no cambia nada.
  - Hay un segundo test con la campaña cerrada: las cajitas no son `draggable`.
  - Para el `dataTransfer` falso, seguir el patrón de `src/features/consolidar/consolidar.ui.test.tsx`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement `EstructuraTab`.**
  - **Pirámide:** con flex anidado (cada nodo es la cajita encima de una fila de hijos), sin librería. Va dentro de un contenedor con `overflow-x-auto` propio. Es la única excepción a "las tarjetas no llevan overflow" porque no lleva encabezado sticky.
  - **Cajita:** un `button` con `aria-label={nombre}` y `draggable={!cerrada}`. Muestra el nombre y el restante: `formatUsd`, en `text-destructive` si es negativo y "al día" si es cero.
  - **Clic:** navega a `/asignaciones/:id`.
  - **Plegar:** con un chevron, si tiene hijos.
  - **Raíces:** las que tienen hijos van arriba. Las que no tienen jefe ni hijos van en la `role="region" aria-label="Sin estructura"`, que también es zona de soltar (quita el jefe).
  - **Arrastrar:** `dataTransfer.setData("application/x-asignacion", id)`.
    - En `dragover`, `preventDefault` solo si el destino es válido: no es él mismo ni alguien de su rama (`creaCiclo`). Así el destino inválido no se resalta.
    - En `drop`, llama a `setJefeAsignacion`, después a `invalidate()`, y muestra el toast "Luis ahora está bajo Ana" con la acción "Deshacer", que vuelve al jefe anterior.
  - **Cerrada:** sin arrastre y con `BotonConMotivo`/aviso `MOTIVO_CERRADA` arriba.
  - **Lectura:** tiene que leerse con 40 gerentes en 4 niveles. Probarlo a mano con la checklist (Task 9).
- [ ] **Step 4: Run `pnpm test` y `pnpm build`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: pestaña Estructura con el organigrama de la campaña`

---

### Task 6: El jefe en el paquete y la rama al compartir

**Files:**
- Modify: `src/domain/paquete.ts`, `src/db/queries/envioConsolidar.ts`, `src/features/campana/CompartirConsolidarDialog.tsx`
- Test: `src/domain/paquete.test.ts`, `src/features/campana/consolidar.ui.test.tsx`

**Interfaces:**
- Consumes: `armarArbol`, `aplanarArbol`, `alternarRama`, `estadoRama` (Task 1); `jefe_id` (Task 2).
- Produces:
  - `type JefePaquete = { asignacionUuid: string; gerente: { uuid: string; nombre: string } }`.
  - `AsignacionPaquete` gana `jefe?: JefePaquete | null`. Con `undefined` (archivo viejo) no se toca nada; con `null`, el que envía no le pone jefe.
  - `DatosEnvio.asignaciones[]` gana `jefeId: number | null`. `armarPaquete` busca el jefe en **todas** las `d.asignaciones` (vaya o no en la selección) y escribe siempre `jefe` (objeto o `null`).
  - `leerPaquete`: si falta `jefe` queda `undefined`, `null` queda `null`, y un objeto se valida con `uuid()`/`texto()`; cualquier otra cosa, `invalido()`. `FORMATO_PAQUETE` sigue en 1.

- [ ] **Step 1: Write the failing tests** en `paquete.test.ts`:

```ts
it("el jefe viaja aunque no vaya en la selección", () => {
  // datos: Ana (id 1), Luis (id 2, jefeId 1); se elige solo Luis
  const { paquete } = armarPaquete(datos, { asignacionIds: [2], soloCambios: false }, meta);
  expect(paquete.asignaciones[0].jefe).toEqual({ asignacionUuid: "a-ana", gerente: { uuid: "g-ana", nombre: "Ana" } });
});
it("leerPaquete distingue archivo viejo (sin jefe) de sin jefe", () => {
  expect(leerPaquete(json({ jefe: undefined })).asignaciones[0].jefe).toBeUndefined();
  expect(leerPaquete(json({ jefe: null })).asignaciones[0].jefe).toBeNull();
  expect(() => leerPaquete(json({ jefe: 3 }))).toThrow("El archivo no es un paquete de Control de Pagos válido");
});
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** el paquete y `cargarEnvio` (`a.jefe_id AS jefeId`).
- [ ] **Step 4: El diálogo.**
  - La lista se muestra en orden de árbol (`aplanarArbol`, sin plegar), con sangría por nivel (`padding-left` de `nivel * 1.25rem`) y "· N debajo".
  - Clic en la casilla de quien tiene gente debajo: `alternarRama`. La casilla queda `indeterminado` con `estadoRama === "parte"` y `checked` con `"todo"`.
  - Clic en quien no tiene gente debajo: alterna solo a él, como hoy. *(Decisión mía: para dejar fuera solo al jefe, se desmarca la rama y se marcan sus hijos uno por uno.)*
  - "Todos" y "Marcar por etiqueta" siguen igual.
- [ ] **Step 5: UI test** `it("al marcar un jefe se marca toda su rama y se puede desmarcar a uno suelto")`:
  - con Ana ← Luis ← Pedro y José, se desmarca "Todos";
  - se marca Ana: quedan marcados Ana, Luis y Pedro, pero no José;
  - se desmarca Pedro: Ana queda `indeterminado` y el paquete copiado lleva a Ana y a Luis.
- [ ] **Step 6: Run `pnpm test` y `pnpm build`.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: el jefe viaja en el paquete y se comparte la rama entera`

---

### Task 7: Consolidar — "Agregar a mi campaña"

**Files:**
- Modify: `src/domain/consolidar.ts`, `src/domain/consolidarResumen.ts`, `src/db/operaciones/consolidar.ts`, `src/features/consolidar/ConsolidarPage.tsx`
- Test: `src/domain/consolidar.test.ts`, `src/domain/consolidarResumen.test.ts`, `src/db/operaciones/consolidar.test.ts`, `src/db/operaciones/consolidarIdaYVuelta.test.ts`, `src/features/consolidar/consolidar.ui.test.tsx`

**Interfaces:**
- Consumes: `createAsignacion(…, { uuid })`, `createGerente(…, { uuid })` (Task 2).
- Produces (en `domain/consolidar.ts`):
  - `type GerenteLocal = { id: number; uuid: string; nombre: string }`.
  - `GerenteEmparejado` gana `agregar?: { gerenteId: number | null }`. Con `agregar`, `asignacionId` es el provisional `idProvisional(p, uuid)`. `gerenteId: null` = crear un gerente nuevo.
  - `idProvisional(p: Paquete, asignacionUuid: string): number` = `-(índice en p.asignaciones + 1)`.
  - `emparejarGerentes(remotas, locales, recordados, gerentesLocales: GerenteLocal[])`, en este orden:
    1. **Uuid de asignación** igual a una local: `estado "recordado"`.
    2. **Lo de hoy:** por gerente recordado, después por nombre.
    3. **Si quedaría "ninguno":** `agregar`, con el gerente local por uuid igual, por `recordados`, o por un único gerente fuera de la campaña con el mismo `claveComparacion(nombre)`. Si no hay, `null`. El estado queda en `"ninguno"`.
  - `gerentesRepetidos` también ve a dos `agregar` con el mismo `gerenteId` no nulo.
  - `LocalConsolidar` gana `gerentes: GerenteLocal[]` (todos los locales).
  - `PlanConsolidacion` gana `agregadas: { remotaUuid: string; asignacionId: number; gerenteId: number | null; gerenteNombre: string; saldoUsd: string }[]`. El nombre es el local si se usa un gerente existente y, si no, el del archivo.
  - `clasificar`: suma las agregadas a `asignacionesLocales` (sin recibo, con el `saldoUsd` del archivo y sin diferencia de saldo). Sus depósitos salen como `nuevos` con el id provisional.
  - `motivoPendiente`: `hayAlgo` incluye `plan.agregadas.length > 0`.
  - `resumenConsolidacion`:
    - las agregadas están en `antes` con asignado `"0"` y sin depósitos, y en `despues` con su `saldoUsd`;
    - `CambioGerente` gana `agregado: boolean`.
  - `aplicarConsolidacion`, antes de todo lo demás:
    - crea el gerente que falte (con el uuid y el nombre del archivo) y la asignación (con el uuid de la asignación del archivo y su `saldoUsd`);
    - arma `real(id)`, que traduce un provisional al id real, y lo aplica en `emparejadas`, `nuevos`, `correcciones` y `conflictos` (`asignacionId`);
    - la reversión borra la asignación y el gerente creados;
    - guarda la equivalencia de `gerentes` si usó un gerente local con otro uuid;
    - las agregadas también reciben `marcarIntercambio(…, "recibo")`;
    - `Resultado` gana `gerentesAgregados: number`.
  - `cargarLocal` llena `gerentes`. `emparejarGerentesDe` y `emparejamientoInicial` le pasan los gerentes locales que no están en la campaña.

- [ ] **Step 1: Write the failing tests.**
  - En `consolidar.test.ts`:
    - `it("un gerente que no está en la campaña se propone agregar (nuevo, o el local del mismo nombre)")`;
    - `it("emparejar por el uuid de la asignación lo da por recordado")`;
    - `it("dos del archivo no pueden agregarse al mismo gerente local")`;
    - `it("los depósitos de un agregado salen como nuevos con el id provisional")`.
  - En `consolidarIdaYVuelta.test.ts`:

```ts
it("B agrega a la campaña al gerente que no tenía, y el segundo archivo lo reconoce sin preguntar", async () => {
  // A tiene Ana y Luis (con 1 depósito); B solo Ana. A → B.
  const r = await recibir(b, await enviar(a));
  expect(r.resultado?.gerentesAgregados).toBe(1);
  // en B: Luis existe como gerente, con asignación en Marzo con el mismo uuid que en A, saldo de A y su depósito
  // A edita el depósito de Luis y reenvía: B lo trata como corrección, sin agregar otro Luis ni pedir emparejamiento
  const e = await emparejamientoInicial(b.db, await enviar(a), null);
  expect(Object.values(e.gerentes).every((g) => g.estado === "recordado" || g.estado === "nombre")).toBe(true);
});
it("si aplicar falla, no queda el gerente ni la asignación agregados", async () => { /* importarImagen que lanza */ });
```

  - UI test en `consolidar.ui.test.tsx`: `it("ofrece Agregar a mi campaña y lo muestra en el resumen")`. El buscador del gerente del archivo muestra "Agregar a mi campaña" ya elegido, y el resumen dice "Gerentes agregados a la campaña: Luis".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** lo de la lista de Interfaces.
- [ ] **Step 4: La pantalla.**
  - **`opcionesGerente(uuid)`:**
    - suma `{ value: "agregar", label: "Agregar a mi campaña" }` si el gerente del archivo no es conocido (ni por uuid ni por `recordados`);
    - suma `{ value: "agregar:<id>", label: "Agregar a <nombre local>" }` por el gerente conocido o por cada gerente local del mismo nombre fuera de la campaña.
  - **`valorGerente` y `elegirGerente`:** pasan esos valores de un lado a otro, con `asignacionId: idProvisional(paquete, uuid)`.
  - **`nombreDe`:** busca también en `plan.agregadas`.
  - **`ResumenCambios`:**
    - un renglón "Gerentes agregados a la campaña: <nombres>" si hay agregadas;
    - "(nuevo en tu campaña)" junto a cada fila con `agregado`.
- [ ] **Step 5: Run `pnpm test` y `pnpm build`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: consolidar agrega a la campaña los gerentes que faltan`

---

### Task 8: Consolidar — el árbol del archivo y "Jefe distinto"

**Files:**
- Modify: `src/domain/consolidar.ts`, `src/db/operaciones/consolidar.ts`, `src/features/consolidar/ConsolidarPage.tsx`, `src/features/consolidar/Secciones.tsx`
- Test: `src/domain/consolidar.test.ts`, `src/db/operaciones/consolidarIdaYVuelta.test.ts`, `src/features/consolidar/consolidar.ui.test.tsx`

**Interfaces:**
- Consumes: `cicloEn`, `creaCiclo`, `descendientes` (Task 1); `jefe` del paquete (Task 6); agregadas e `idProvisional` (Task 7).
- Produces:
  - `AsignacionLocal` gana `jefeId: number | null` y `gerenteUuid: string`. `LocalConsolidar` gana `equivalenciasGerentes: Map<string, number>`.
  - `type JefeCambio = { asignacionId: number; gerenteNombre: string; local: number | null; archivo: number | null; automatico: boolean; bloqueo: string | null; debajo: number }`.
  - `PlanConsolidacion` gana `jefes: JefeCambio[]`. `Decisiones` gana `jefes: Record<number, Eleccion>` (`decisionesIniciales`: `"mia"` en los no automáticos).
  - **Resolver el jefe del archivo** (`jefe` de una asignación emparejada o agregada) a un id local de la campaña, en este orden:
    - si `jefe.asignacionUuid` está en el archivo, el `asignacionId` numérico de su emparejamiento;
    - si no, la asignación local con ese uuid;
    - si no, el gerente local con `uuid === jefe.gerente.uuid`, o el de `equivalenciasGerentes`, y su asignación en esta campaña;
    - si no se encuentra, la fila no se genera.
    Con `jefe === undefined` no se genera nada.
  - **Filas:**
    - local `null` y archivo con jefe: `automatico: true`;
    - local ≠ archivo (incluido archivo `null`): `automatico: false`;
    - iguales: nada.
  - **Ciclos:**
    - se aplican los automáticos sobre los jefes locales y, mientras `cicloEn` dé ids, cada automático de ese ciclo pasa a `automatico: false` con `bloqueo: "Quedaría debajo de sí mismo"`;
    - después, cada no automático lleva `bloqueo` si `creaCiclo(jefesConAutomaticos, id, archivo)`.
  - `PlanConsolidacion` gana también `jefesLocales: Map<number, number | null>`: los jefes locales de la campaña, más las agregadas con `null`. Lo llena `clasificar`, para que `motivoPendiente` no cambie de firma.
  - `jefesFinales(plan, d): Map<number, number | null>`: `plan.jefesLocales`, más los automáticos, más los no automáticos con `d.jefes[id] === "archivo"` y sin `bloqueo`.
  - `motivoPendiente`: si `cicloEn(jefesFinales(plan, d))`, devuelve `` `${nombres.join(" y ")} quedarían uno debajo del otro: cambia la elección de su jefe` ``, con los nombres de los gerentes del ciclo. `hayAlgo` incluye los automáticos y los `"archivo"` elegidos.
  - `type GrupoJefe = { desde: string; hacia: string; filas: JefeCambio[] }`. `agruparJefes(plan, nombreDe: (id: number) => string): GrupoJefe[]` agrupa los no automáticos por el par de nombres (`"sin jefe"` si es `null`), en el orden de aparición.
  - `aplicarConsolidacion`, después de crear las agregadas y antes de los depósitos:
    - valida `cicloEn(jefesFinales)`, y si hay ciclo lanza el mismo mensaje;
    - escribe cada cambio con `UPDATE asignaciones SET jefe_id = ?, actualizado_en = ? WHERE id = ?` (directo, sin `setJefeAsignacion`, porque los pasos intermedios pueden tener un ciclo), con ids `real()`;
    - la reversión repone `jefe_id` y `actualizado_en`;
    - `Resultado` gana `jefesCambiados: number`.

- [ ] **Step 1: Write the failing tests** en `consolidar.test.ts`:

```ts
it("sin jefe aquí toma el del archivo en automático; distinto va a Jefe distinto con 'mía' por defecto", ...);
it("archivo viejo (jefe undefined) no genera filas; archivo con jefe null y local con jefe sí", ...);
it("jefe fuera del archivo se resuelve por el gerente (uuid o equivalencia); si no se encuentra, no hay fila", ...);
it("un automático que cierra un ciclo pasa a Jefe distinto bloqueado", () => {
  // local: B bajo A; archivo: A bajo B  → la fila de A queda automatico:false, bloqueo "Quedaría debajo de sí mismo"
});
it("dos elecciones archivo que juntas forman ciclo bloquean con motivo", () => {
  // local: A bajo X, B bajo Y; archivo: A bajo B, B bajo A. Cada una sola es válida; las dos → motivoPendiente
  expect(motivoPendiente(plan, gerentes, { ...d, jefes: { [a]: "archivo", [b]: "archivo" } })).toMatch(/quedarían uno debajo del otro/);
});
it("agruparJefes agrupa por (mío → archivo)", () => {
  expect(agruparJefes(plan, nombreDe).map((g) => [g.desde, g.hacia, g.filas.length])).toEqual([["Karla", "Juan", 2], ["Juan", "sin jefe", 1]]);
});
```

  En `consolidarIdaYVuelta.test.ts`:
  - `it("la rama de Luis enviada desde A queda armada en B con gerentes agregados")`: A tiene Ana ← Luis ← (Pedro, María); se envían Luis, Pedro y María. En B, Pedro y María quedan bajo Luis y Luis bajo Ana, porque Ana ya estaba en B y se resuelve por el gerente.
  - `it("jefe distinto en ambos lados: con 'mía' no cambia y con 'archivo' cambia")`.
  - `it("archivo viejo sin jefe no toca el árbol")`: se le borra `jefe` al JSON antes de `leerPaquete`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** lo de la lista de Interfaces (`cargarLocal` agrega `a.jefe_id AS jefeId`, `g.uuid AS gerenteUuid` y `equivalenciasGerentes`).
- [ ] **Step 4: La pantalla.**
  - **`Secciones.tsx`:** una nueva `JefesDistintos({ grupos, d, onElegir(ids: number[], e: Eleccion) })` dentro de una `Seccion` con el título "Jefe distinto" y la descripción "Tu app y el archivo ponen a estos gerentes bajo jefes distintos: elige cuál queda".
    - **Cada grupo:** muestra el encabezado "Karla → Juan · 2 gerentes", los botones "Todos: el mío" y "Todos: el del archivo", y "Elecciones mezcladas" si no coinciden.
    - **Lista del grupo:** se pliega (`<details>`, abierta si el grupo tiene ≤ 3) y cada fila usa `Elegir` (`mia="Mi jefe: Karla"`, `archivo="El del archivo: Juan"`) con "· N debajo" si tiene gente debajo.
    - **Fila con `bloqueo`:** la opción archivo va deshabilitada con `BotonConMotivo` y su motivo.
  - **`ConsolidarPage`:**
    - `Elecciones` gana `jefes`;
    - en el resumen, un renglón "Jefes: Pedro → Luis, María → Luis" (con los automáticos y los "archivo" elegidos);
    - en `discretos`, "Toman el jefe del archivo: N" si hay automáticos.
  - **UI test** `it("Jefe distinto agrupado por jefe: 'Todos: el del archivo' cambia el grupo")`.
- [ ] **Step 5: Run `pnpm test` y `pnpm build`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: consolidar arma el árbol del archivo y muestra Jefe distinto`

---

### Task 9: Documentación

**Files:**
- Modify: `CLAUDE.md`, `docs/checklist-mvp.md`

- [ ] **Step 1: `CLAUDE.md`.**
  - En "Arquitectura", una viñeta "Árbol de gerentes por campaña": `asignaciones.jefe_id` (v8), `domain/arbol.ts`, `setJefeAsignacion`, quitar a un jefe sube a su gente, `jefesAnteriores` en `agregarGerentes`, "Por gerente" en árbol (`useRamasPlegadas`), `EstructuraTab` (arrastre), rama en `CompartirConsolidarDialog`.
  - En los comportamientos de consolidar:
    - `jefe` en el paquete (undefined = archivo viejo);
    - "Agregar a mi campaña" (ids provisionales negativos, uuid de la asignación del archivo);
    - resolución del jefe por el gerente;
    - "Jefe distinto" agrupado, con ciclos bloqueados.
- [ ] **Step 2: `docs/checklist-mvp.md`.**
  - Organigrama con unos 40 gerentes en 4 niveles: se lee, hay scroll horizontal y el arrastre funciona en la app real.
  - Arrastrar a una rama propia no resalta.
  - Una ida y vuelta real con dos instancias (la aislada del CLAUDE.md).
- [ ] **Step 3: Commit** `docs: árbol de gerentes en CLAUDE.md y checklist`
