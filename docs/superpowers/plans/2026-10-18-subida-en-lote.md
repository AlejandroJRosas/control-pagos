# Subida en lote y revisión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir varias imágenes de comprobantes o tasas, leerlas con el OCR y revisarlas una a una en una cola persistente. Cada una se guarda al darle "Hecho". Además, zoom con la rueda del ratón en todas las imágenes.

**Architecture:** Dos tablas nuevas (`cola_depositos`, `cola_tasas`) guardan imagen + borrador JSON. Repos en `db/repos/cola.ts`, operación "Hecho" con reversión manual en `db/operaciones/revision.ts` y reglas puras de la cola en `domain/cola.ts`. La UI reutiliza el formulario actual, extraído de `DepositoPage` y `TasaFormDialog` a componentes compartidos. Las pantallas nuevas viven en `features/lote/`.

**Tech Stack:** React + TypeScript, tauri-plugin-sql (SQLite), tauri-plugin-fs, vitest + sql.js, shadcn (Base UI), decimal.js.

**Spec:** `docs/superpowers/specs/2026-10-18-subida-en-lote-design.md`

## Global Constraints

- UI y mensajes en español. Errores de negocio con `DomainError` (código + mensaje que se muestra tal cual).
- Montos como texto decimal; no se guardan derivados (USD, saldos).
- SQL con `?` posicionales; columnas snake_case con alias camelCase en el SELECT.
- Migración nueva = **versión 2** agregada a `MIGRATIONS`, sin editar la 1. Una sentencia por elemento, con `IF NOT EXISTS`.
- La cola no cuenta en saldos, Excel ni totales: `loadCampanaData` y los exportadores no leen las tablas de cola.
- "Hecho" guarda con `createDeposito` / `resolverDestino` / `createTasa` (mismas validaciones). No se copian reglas.
- Si el OCR no lee la fecha, el borrador queda con `fecha: ""`.
- UI: `useData` + `invalidate()` después de cada escritura; `reportError(e)` para errores.
- Commits en español con prefijo (`feat:`, `fix:`, `docs:`, `refactor:`), terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Archivos con LF (no CRLF).
- Verificación: `pnpm test` y `pnpm build` en verde al final de cada tarea.

## Review Focus

1. **Doble clic en "Hecho"**: debe crearse un solo depósito; el segundo intento se rechaza (prueba en Tarea 4, y el botón se deshabilita mientras guarda en la Tarea 10).
2. **Cerrar la app a mitad de revisión**: lo corregido en el elemento abierto se conserva (autoguardado con vaciado al desmontar, Tarea 10). El repo rechaza guardar el borrador de un elemento ya hecho (prueba en Tarea 2).
3. **Campaña cerrada con cola pendiente**: "Hecho" falla con `CAMPANA_CERRADA`, el elemento sigue pendiente y no queda gerente ni asignación a medias (prueba en Tarea 4).
4. **Lote con archivos que no son imagen** (PDF, .heic): se rechazan uno por uno con aviso y el resto sigue (`separarImagenes`, prueba en Tarea 5).
5. **Depósito borrado después de "Hecho"**: la fila de la cola sigue como hecha con `depositoId = null`, sin romper la clave foránea (prueba en Tarea 2).

---

### Task 1: Migración 2 con las tablas de cola

**Files:**
- Modify: `src/db/migrations.ts`
- Test: `src/db/migrations.test.ts`

**Interfaces:**
- Produces: tablas `cola_depositos(id, campana_id, imagen_path, nombre_archivo, estado, borrador, formato, deposito_id, orden, creado_en, actualizado_en)` y `cola_tasas(id, imagen_path, nombre_archivo, estado, borrador, formato, tasa_id, orden, creado_en, actualizado_en)`.

- [ ] **Step 1: Ajustar la prueba** "crea el esquema…": la lista esperada pasa a `["asignaciones", "campanas", "cola_depositos", "cola_tasas", "depositos", "gerentes", "tasas"]`.
- [ ] **Step 2: Correr** `pnpm test src/db/migrations.test.ts`. Esperado: FAIL en la lista de tablas.
- [ ] **Step 3: Agregar `{ version: 2, statements: [...] }`** con:
  - `cola_depositos`: `campana_id INTEGER NOT NULL REFERENCES campanas(id) ON DELETE CASCADE`, `imagen_path TEXT NOT NULL`, `nombre_archivo TEXT`, `estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'hecho'))`, `borrador TEXT NOT NULL`, `formato TEXT`, `deposito_id INTEGER REFERENCES depositos(id) ON DELETE SET NULL`, `orden INTEGER NOT NULL`, `creado_en TEXT NOT NULL`, `actualizado_en TEXT NOT NULL`.
  - `cola_tasas`: igual, sin `campana_id` y con `tasa_id INTEGER REFERENCES tasas(id) ON DELETE SET NULL`.
  - `CREATE INDEX IF NOT EXISTS idx_cola_depositos_campana ON cola_depositos(campana_id)`.
- [ ] **Step 4: Correr** `pnpm test src/db/migrations.test.ts`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat: tablas de cola de revisión (migración 2)`.

### Task 2: Repos de la cola

**Files:**
- Create: `src/db/repos/cola.ts`
- Test: `src/db/repos/cola.test.ts`

**Interfaces:**
- Consumes: `assertCampanaActiva` (`repos/campanas`), `nowIso`, `DepositoDraft`, `DestinoDraft`, `TasaDraft` (`domain/validation`), `Autollenado`, `CamposDeposito`, `CamposTasa`.
- Produces:
  ```ts
  export type EstadoCola = "pendiente" | "hecho";
  export type BorradorDeposito = { draft: Omit<DepositoDraft, "tasaId">; destino: DestinoDraft; auto: Autollenado<CamposDeposito> };
  export type BorradorTasa = { draft: TasaDraft; auto: Autollenado<CamposTasa> };
  type Base = { id: number; imagenPath: string; nombreArchivo: string | null; estado: EstadoCola; formato: string | null; orden: number; creadoEn: string; actualizadoEn: string };
  export type ItemColaDeposito = Base & { campanaId: number; borrador: BorradorDeposito; depositoId: number | null };
  export type ItemColaTasa = Base & { borrador: BorradorTasa; tasaId: number | null };
  export const borradorDepositoVacio: (sel?: string) => BorradorDeposito; // fecha "", destino { sel, nombre: "", saldo: "" }, autollenadoNuevo()
  export const borradorTasaVacio: () => BorradorTasa;                       // { fecha: "", valor: "", notas: "" }
  export function encolarDeposito(db, campanaId: number, v: { imagenPath: string; nombreArchivo: string | null; borrador: BorradorDeposito }): Promise<number>;
  export function listColaDepositos(db, campanaId: number): Promise<ItemColaDeposito[]>; // ORDER BY orden, id
  export function getItemColaDeposito(db, id: number): Promise<ItemColaDeposito | null>;
  export function guardarBorradorDeposito(db, id: number, borrador: BorradorDeposito, formato?: string | null): Promise<void>; // formato undefined = no cambiarlo
  export function asignarGerenteCola(db, ids: number[], sel: string): Promise<number>; // solo pendientes; destino = { sel, nombre: "", saldo: "" }; devuelve cuántos cambió
  export function marcarDepositoHecho(db, id: number, depositoId: number): Promise<void>;
  export function descartarDeposito(db, id: number): Promise<string>; // devuelve imagenPath
  export function quitarHechosDepositos(db, campanaId: number): Promise<number>;
  export function contarPendientesDepositos(db, campanaId: number): Promise<number>;
  // Tasas: encolarTasa(db, v), listColaTasas(db), getItemColaTasa, guardarBorradorTasa, marcarTasaHecha(db, id, tasaId),
  //        descartarTasa, quitarHechosTasas(db), contarPendientesTasas(db) — mismas firmas sin campanaId.
  ```
  Errores: elemento inexistente → `DomainError("NO_ENCONTRADO", "El elemento ya no está en la cola")`. Guardar borrador, marcar hecho o descartar un elemento hecho → `DomainError("VALIDACION", "Este elemento ya está hecho")`. `encolarDeposito` llama a `assertCampanaActiva`. `orden` = `MAX(orden) + 1` de esa cola.

- [ ] **Step 1: Escribir las pruebas** (con `createTestDb` + `seedBasico`):
  - `encola, lista en orden y conserva el borrador JSON`: encolar 2; `listColaDepositos` devuelve `orden` 1 y 2, `estado: "pendiente"` y el borrador igual (`toEqual`) al guardado.
  - `guarda el borrador y el formato`: `guardarBorradorDeposito(db, id, b2, "bdv-transferencia")`, luego `getItemColaDeposito` → `borrador` = b2 y `formato` = `"bdv-transferencia"`. Guardar de nuevo sin formato lo mantiene.
  - `asigna gerente solo a pendientes`: 3 elementos, uno marcado hecho → `asignarGerenteCola(db, [a, b, c], "a:7")` devuelve 2; el hecho conserva su destino.
  - `no edita ni descarta un elemento hecho`: tras `marcarDepositoHecho`, `guardarBorradorDeposito` y `descartarDeposito` se rechazan con `code: "VALIDACION"`.
  - `descartar devuelve la imagen y borra la fila`.
  - `quita los hechos y cuenta pendientes`.
  - `no encola en una campaña cerrada`: `setEstadoCampana(db, id, "cerrada")` → `rejects.toMatchObject({ code: "CAMPANA_CERRADA" })`.
  - `si se borra el depósito, la fila sigue hecha sin enlace`: crear el depósito con `createDeposito`, `marcarDepositoHecho`, `deleteDeposito` → `depositoId: null`, `estado: "hecho"`.
  - `borrar la campaña borra su cola` (DELETE directo de la campaña sin asignaciones).
  - Tasas: `encola, guarda, marca y descarta` con el mismo esquema.
- [ ] **Step 2: Correr** `pnpm test src/db/repos/cola.test.ts`. Esperado: FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `cola.ts`.** Las dos colas comparten helpers privados parametrizados por tabla y columna de enlace. El borrador se guarda con `JSON.stringify` y se parsea al leer.
- [ ] **Step 4: Correr** `pnpm test src/db/repos/cola.test.ts`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat: repos de la cola de revisión`.

### Task 3: Reglas puras de la cola

**Files:**
- Create: `src/domain/cola.ts`
- Test: `src/domain/cola.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function siguientePendiente(items: { id: number; estado: "pendiente" | "hecho" }[], actualId: number | null): number | null;
  export function duplicadosEnCola(items: { id: number; estado: string; banco: string; referencia: string }[], id: number): number[];
  ```

- [ ] **Step 1: Pruebas**:
  - `siguientePendiente([p1, h2, p3, p4], 3)` → `4`; `(…, 4)` → `1` (vuelve al inicio); `([p1], 1)` → `null`; `(items, null)` → el primer pendiente; `([h1], null)` → `null`.
  - `duplicadosEnCola`: `"Banesco"/"00123"` frente a `" banesco "/"00123"` → id del otro. No cuenta hechos, ni al propio elemento, ni referencias o bancos vacíos.
- [ ] **Step 2: Correr** `pnpm test src/domain/cola.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** `duplicadosEnCola` compara con `claveComparacion` de `domain/texto`.
- [ ] **Step 4: Correr.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: siguiente pendiente y duplicados dentro de la cola`.

### Task 4: Operación "Hecho"

**Files:**
- Create: `src/db/operaciones/revision.ts`
- Test: `src/db/operaciones/revision.test.ts`

**Interfaces:**
- Consumes: Task 2; `resolverDestino` (`operaciones/destino`), `createDeposito`, `createTasa`, `deleteTasa`.
- Produces:
  ```ts
  export function completarDeposito(db: SqlDriver, itemId: number, v: DepositoValido, destino: Destino): Promise<{ depositoId: number; asignacionId: number }>;
  export function completarTasa(db: SqlDriver, itemId: number, v: TasaValida): Promise<number>; // id de la tasa
  ```
  Orden:
  1. Leer el elemento (rechazar si no existe o ya está hecho).
  2. Llamar a `resolverDestino(db, item.campanaId, destino)`.
  3. Llamar a `createDeposito(..., { ...v, imagenPath: item.imagenPath })`.
  4. Llamar a `marcarDepositoHecho`.

  Si falla el paso 3: `deshacer()`. Si falla el paso 4: `DELETE` del depósito y luego `deshacer()`. Tasas: `createTasa` con la imagen del elemento → `marcarTasaHecha`; si marcar falla, `deleteTasa`.

- [ ] **Step 1: Pruebas**:
  - `guarda el depósito con la imagen de la cola y marca hecho`: el depósito tiene `imagenPath` del elemento y el elemento tiene `estado: "hecho"` y `depositoId`.
  - `con gerente nuevo crea gerente y asignación`.
  - `un segundo Hecho sobre el mismo elemento se rechaza y no duplica` (`VALIDACION`; `COUNT(*) depositos` = 1).
  - `campaña cerrada: rechaza, el elemento sigue pendiente y no deja gerente nuevo` (`CAMPANA_CERRADA`; gerentes sin cambio).
  - `tasa de otra fecha: rechaza y el elemento sigue pendiente`.
  - `si marcar falla, revierte depósito, asignación y gerente`: un driver envoltorio que delega en `db` y lanza en `execute` cuando el SQL empieza con `UPDATE cola_depositos SET estado`. Después: 0 depósitos y gerentes sin cambio.
  - Tasas: `crea la tasa y marca hecho`; `fecha con tasa existente: DUPLICADO y sigue pendiente`; `sábado: VALIDACION`.
- [ ] **Step 2: Correr** `pnpm test src/db/operaciones/revision.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: guardar desde la cola con reversión`.

### Task 5: Borrar imágenes y separar archivos aceptados

**Files:**
- Modify: `src/platform/images.ts`, `src-tauri/capabilities/default.json` (agregar `"fs:allow-remove"`)
- Test: `src/platform/images.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function deleteImage(relPath: string): Promise<void>; // remove() en AppData; si no existe, no falla
  export function separarImagenes<T extends { type: string }>(files: T[]): { aceptadas: T[]; rechazadas: T[] };
  ```

- [ ] **Step 1: Prueba** `separa por tipo`: `[png, pdf, jpeg, heic]` → aceptadas `[png, jpeg]`, rechazadas `[pdf, heic]`. Prueba de `deleteImage` con `vi.mock("@tauri-apps/plugin-fs")`: llama a `remove("imagenes/a.png", { baseDir: AppData })` y no lanza si `remove` rechaza con un error de "not found" / "No such file".
- [ ] **Step 2: Correr** `pnpm test src/platform/images.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar**, usando `ACCEPTED_IMAGE_TYPES`.
- [ ] **Step 4: Correr.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: borrar imágenes descartadas y filtrar lotes`.

### Task 6: Zoom con la rueda del ratón

**Files:**
- Create: `src/lib/zoom.ts`, `src/lib/zoom.test.ts`, `src/components/ZoomableImage.tsx`
- Modify: `src/components/ImageDrop.tsx`, `src/components/ImageViewer.tsx`, `docs/checklist-mvp.md`

**Interfaces:**
- Produces:
  ```ts
  // lib/zoom.ts — escala relativa a la imagen ajustada al contenedor (1 = ajustada)
  export type Vista = { escala: number; x: number; y: number }; // x, y = desplazamiento en px
  export const VISTA_AJUSTADA: Vista;                            // { escala: 1, x: 0, y: 0 }
  export function zoomEnPunto(v: Vista, factor: number, px: number, py: number, maxEscala: number): Vista; // px, py relativos al contenedor
  export function limitarPan(v: Vista, cont: { w: number; h: number }): Vista;
  export function escalaMaxima(natural: { w: number; h: number }, ajustada: { w: number; h: number }): number; // max(1, 4 * natural.w / ajustada.w)
  // components/ZoomableImage.tsx
  export function ZoomableImage(p: { imagen: { url: string } | { path: string }; alt?: string; className?: string; controles?: boolean }): JSX.Element;
  ```

- [ ] **Step 1: Pruebas de `zoom.ts`**:
  - Hacer zoom ×2 en el punto (100, 50) desde la vista ajustada deja ese punto fijo: `{ escala: 2, x: -100, y: -50 }`.
  - La escala no baja de 1; al llegar a 1 vuelve a `VISTA_AJUSTADA`.
  - No pasa de `maxEscala`.
  - `limitarPan` no deja ver fuera de la imagen: con escala 2 en un contenedor 200×100, `x` queda en [-200, 0] e `y` en [-100, 0].
  - `escalaMaxima({w:1000}, {w:500})` = 8; `({w:100}, {w:500})` = 1.
- [ ] **Step 2: Correr** `pnpm test src/lib/zoom.test.ts`. Esperado: FAIL.
- [ ] **Step 3: Implementar `zoom.ts`.**
- [ ] **Step 4: Correr.** Esperado: PASS.
- [ ] **Step 5: Implementar `ZoomableImage`**:
  - Un contenedor `overflow-hidden` con la imagen `object-contain` a tamaño completo y `transform: translate(x,y) scale(escala)` con `transform-origin: 0 0`.
  - La rueda se registra con `addEventListener("wheel", h, { passive: false })` en un ref, porque el `onWheel` de React es pasivo y no permite `preventDefault`. Factor `1.15 ** (-deltaY / 100)`.
  - Arrastre con pointer events y `setPointerCapture`, solo con escala > 1. Doble clic vuelve a `VISTA_AJUSTADA`.
  - Indicador del porcentaje respecto al tamaño real (`escala * ajustada.w / natural.w`) cuando escala > 1.
  - Con `{ path }`, carga la imagen con `loadImageUrl` igual que `StoredImage`.
  - `controles`: −, %, +, "Ajustar" y "Tamaño real" (zoom centrado).
  - Al cambiar la imagen, vuelve a la vista ajustada.
- [ ] **Step 6: Usarlo** en la vista previa de `ImageDrop` (`{ url: previewUrl }` o `{ path }`; soltar, pegar y Cambiar/Quitar siguen igual) y en `ImageViewer`, que reemplaza su lógica propia por `ZoomableImage controles` dentro de una caja `h-[70vh] w-[min(80vw,64rem)]`.
- [ ] **Step 7: Checklist**: reemplazar la línea "Ver un comprobante…" por "Rueda del ratón sobre cualquier imagen (formulario, diálogo de tasa, visor, revisión): acerca hacia el cursor sin desplazar la página; arrastrar mueve; doble clic ajusta; el visor conserva − / + / Ajustar / Tamaño real".
- [ ] **Step 8: Correr** `pnpm test` y `pnpm build`. Esperado: ambos en verde.
- [ ] **Step 9: Commit** `feat: zoom con la rueda del ratón en las imágenes`.

### Task 7: Extraer el formulario de depósito

**Files:**
- Create: `src/features/deposito/DepositoCampos.tsx`, `src/features/deposito/useDepositoForm.ts`
- Modify: `src/features/deposito/DepositoPage.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type DepositoFormState = { draft: DepositoDraft; auto: Autollenado<CamposDeposito>; destino: DestinoDraft };
  export function useDepositoForm(o: { inicial: DepositoFormState; data: CampanaData; asignacion: AsignacionDetalle | null; depositoId?: number }): {
    form: DepositoFormState;
    setForm: (f: (s: DepositoFormState) => DepositoFormState) => void;
    set: <K extends keyof DepositoDraft>(k: K, v: DepositoDraft[K]) => void;  // marca tocado como hoy
    setDestino: (d: DestinoDraft) => void;
    tasa: Tasa | null | undefined; setTasa: (t: Tasa) => void;
    errors: Partial<Record<keyof DepositoDraft, string>>;
    destinoErrors: Partial<Record<keyof DestinoDraft, string>>;
    duplicados: Duplicado[];
    validar: () => { deposito: DepositoValido; destino: Destino | null } | null; // null = muestra errores
  };
  export function DepositoCampos(p: {
    f: ReturnType<typeof useDepositoForm>; data: CampanaData; asignacion: AsignacionDetalle | null;
    gerentes: Gerente[]; bancos: string[]; disabled: boolean; avisosExtra?: ReactNode;
  }): JSX.Element; // de DestinoGerente al aviso de pago de más, más el TasaFormDialog de "Registrar tasa"
  ```
- [ ] **Step 1: Mover** a esos archivos la búsqueda de tasa, los duplicados, el cálculo de dólares y saldos, `set`, la validación y el JSX de los campos. `DepositoPage` queda con la imagen, el OCR (`onImagen`), guardar, eliminar y los botones. Sin cambios de comportamiento.
- [ ] **Step 2: Correr** `pnpm build` y `pnpm test`. Esperado: en verde.
- [ ] **Step 3: Verificar a mano** (`pnpm tauri dev`) los puntos del checklist de registro de depósito y OCR: guardar, "Guardar y nuevo", editar, tasa del viernes, duplicado, OCR que no pisa.
- [ ] **Step 4: Commit** `refactor: formulario de depósito reutilizable`.

### Task 8: Extraer el formulario de tasa

**Files:**
- Create: `src/features/tasas/TasaCampos.tsx`
- Modify: `src/features/tasas/TasaFormDialog.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function TasaCampos(p: {
    form: { draft: TasaDraft; auto: Autollenado<CamposTasa> };
    set: (k: keyof TasaDraft, v: string) => void;
    errors: Partial<Record<keyof TasaDraft, string>>;
    fechaBloqueada: boolean; fechaImagen: string | null; avisosExtra?: ReactNode;
  }): JSX.Element; // fecha, Bs por USD (con hint), aviso de fin de semana, "La imagen es del …", notas
  ```
- [ ] **Step 1: Mover** los campos del diálogo a `TasaCampos`. El diálogo conserva la imagen, el OCR, el submit y el aviso de "afecta N depósitos" (vía `avisosExtra`).
- [ ] **Step 2: Correr** `pnpm build`. Esperado: en verde. Verificar a mano registrar y editar una tasa con imagen.
- [ ] **Step 3: Commit** `refactor: campos de tasa reutilizables`.

### Task 9: Pantallas "Subir lote"

**Files:**
- Create: `src/features/lote/useLote.ts`, `src/features/lote/ZonaLote.tsx`, `src/features/lote/SubirLoteDepositosPage.tsx`, `src/features/lote/SubirLoteTasasPage.tsx`, `src/features/lote/leerEnBorrador.ts`, `src/features/lote/leerEnBorrador.test.ts`
- Modify: `src/App.tsx` (rutas `campanas/:campanaId/lote` y `tasas/lote`)

**Interfaces:**
- Consumes: Task 2 (`encolar*`, `guardarBorrador*`, `borrador*Vacio`), Task 5 (`separarImagenes`), `saveImage`, `extractor`, `aplicarExtraccion`.
- Produces:
  ```ts
  export type EstadoLectura = "en-cola" | "leyendo" | "leido" | "no-reconocido" | "error";
  export function useLote(o: { encolar: (file: File) => Promise<number>; leer: (file: File, id: number) => Promise<string | null> }): {
    filas: { key: string; nombre: string; estado: EstadoLectura; formato: string | null }[];
    agregar: (files: File[]) => void;
  };
  export function ZonaLote(p: { onArchivos: (files: File[]) => void; disabled?: boolean }): JSX.Element; // soltar, pegar (todas las imágenes del portapapeles), "Elegir archivos…" múltiple; avisa por cada archivo rechazado
  // leerEnBorrador.ts (puro)
  export function borradorDepositoConOcr(b: BorradorDeposito, fields: Partial<Record<CamposDeposito, CampoPropuesto>>): BorradorDeposito;
  export function borradorTasaConOcr(b: BorradorTasa, fields: Partial<Record<CamposTasa, CampoPropuesto>>): BorradorTasa;
  ```
- [ ] **Step 1: Pruebas de `leerEnBorrador`**: con `fields` = `{ montoBs: { value: "1.250,00", confidence: 0.9 } }` sobre `borradorDepositoVacio("a:3")`, el resultado tiene `draft.montoBs` = `"1.250,00"`, `auto.estado.montoBs` = `"ocr"`, `draft.fecha` = `""` y `destino.sel` = `"a:3"`. Con `fields = {}` el borrador queda igual.
- [ ] **Step 2: Correr** `pnpm test src/features/lote`. Esperado: FAIL. **Step 3: Implementar** con `aplicarExtraccion` y defaults vacíos. **Step 4: Correr.** Esperado: PASS.
- [ ] **Step 5: Implementar `useLote`.** `agregar` encola cada archivo (`saveImage` + `encolar*`) de inmediato, en orden, y luego los lee **uno por uno**; nunca dos a la vez. Una ref `vivo` detiene las lecturas pendientes al desmontar. Un fallo de `leer` marca esa fila como `"error"` y sigue con la siguiente.
- [ ] **Step 6: Páginas.** Depósitos: cabecera con "volver a la campaña", selector opcional "Gerente para todo el lote" (`NativeSelect` con las asignaciones de la campaña; vacío = "— Sin asignar (lo eliges al revisar) —"), `ZonaLote`, tabla de filas (leyendo… / ✔ formato / ⚠ no reconocido / ✖ error) y un `Link` "Ir a revisar". Con la campaña cerrada: `Aviso` y zona deshabilitada. Tasas: igual, sin gerente, de vuelta a `/tasas`.
- [ ] **Step 7: Correr** `pnpm build` y `pnpm test`. Esperado: en verde.
- [ ] **Step 8: Commit** `feat: subir comprobantes y tasas en lote`.

### Task 10: Revisión de depósitos

**Files:**
- Create: `src/features/lote/RevisionLayout.tsx`, `src/features/lote/useAutoguardado.ts`, `src/features/lote/RevisionDepositosPage.tsx`
- Modify: `src/App.tsx` (ruta `campanas/:campanaId/revision`)

**Interfaces:**
- Consumes: Tasks 2, 3, 4, 5, 6, 7.
- Produces:
  ```ts
  export function RevisionLayout(p: {
    back: { to: string; label: string }; titulo: string; hechos: number; total: number;
    lista: ReactNode; imagenPath: string | null; children: ReactNode; acciones?: ReactNode;
  }): JSX.Element; // 3 columnas: lista | ZoomableImage | formulario
  export function useAutoguardado<T>(valor: T, guardar: (v: T) => Promise<void>, ms?: number): { cancelar: () => void }; // 500 ms por defecto; al desmontar guarda lo pendiente salvo que se haya cancelado
  ```
- [ ] **Step 1: Página.**
  - Carga `loadCampanaData`, `listColaDepositos`, `listGerentes` y `listBancosUsados` con `useData`.
  - Estado: `actualId` (inicial `siguientePendiente(items, null)`), `filtro` (`"pendientes"` por defecto, también `"hechos"` y `"todos"`) y `marcados: Set<number>`.
  - Lista: casillas; cada fila muestra estado (✔ hecho / ▶ actual / ○ pendiente), banco, monto y gerente o "sin gerente". Debajo, `NativeSelect` de gerentes de la campaña + "Asignar gerente a marcados" → `asignarGerenteCola`.
  - Encabezado: "N de M hechos" y botón "Quitar hechos".
- [ ] **Step 2: Formulario del elemento actual.**
  - Subcomponente con `key={`${item.id}-${reinicio}`}`. `reinicio` sube después de asignar gerente si el actual estaba marcado.
  - `useDepositoForm` arranca del borrador (`tasaId: null`; la busca el hook) y renderiza `DepositoCampos` con `disabled` si está hecho, guardando o con la campaña cerrada.
  - `avisosExtra`: duplicados en la cola (`duplicadosEnCola` con la lista y el draft vivo del actual) con su nombre de archivo.
  - `useAutoguardado` guarda `{ draft sin tasaId, destino, auto }` con `guardarBorradorDeposito`.
- [ ] **Step 3: Botones.**
  - **Hecho**: deshabilitado mientras guarda. `validar()` → `cancelar()` el autoguardado → `completarDeposito(db, item.id, deposito, destino!)` (en la revisión no hay asignación fija, así que `validar` siempre devuelve destino) → toast "Depósito registrado" → `invalidate()` → `actualId = siguientePendiente(...)`. Si falla: `reportError` y se queda en el elemento.
  - **Saltar**: pasa al siguiente pendiente.
  - **Descartar**: `ConfirmDialog` → `descartarDeposito` → `deleteImage` → siguiente pendiente. Solo para pendientes.
  - Elemento hecho: solo lectura, con el enlace "Ver depósito" (`/depositos/:id`).
  - Sin pendientes: `Vacio` "No quedan comprobantes por revisar" con enlace a la campaña.
  - Atajo Ctrl+Enter = Hecho.
- [ ] **Step 4: Correr** `pnpm build` y `pnpm test`. Esperado: en verde.
- [ ] **Step 5: Commit** `feat: revisión uno a uno de depósitos en lote`.

### Task 11: Revisión de tasas

**Files:**
- Create: `src/features/lote/RevisionTasasPage.tsx`
- Modify: `src/App.tsx` (ruta `tasas/revision`)

**Interfaces:**
- Consumes: `RevisionLayout`, `useAutoguardado`, `TasaCampos`, `completarTasa`, repos de cola de tasas.
- [ ] **Step 1: Página** con el mismo esquema que la Task 10, sin gerente ni asignación masiva. Lista: fecha y valor (o "sin leer"). El formulario usa `TasaCampos` con `fechaBloqueada={false}` y `fechaImagen` = `borrador.draft.fecha` mientras su estado de autollenado sea `"ocr"`. **Hecho** → `validateTasa` → `completarTasa` → toast "Tasa registrada".
- [ ] **Step 2: Correr** `pnpm build`. Esperado: en verde.
- [ ] **Step 3: Commit** `feat: revisión uno a uno de tasas en lote`.

### Task 12: Accesos, checklist y CLAUDE.md

**Files:**
- Modify: `src/features/campana/CampanaPage.tsx`, `src/features/tasas/TasasPage.tsx`, `docs/checklist-mvp.md`, `CLAUDE.md`

- [ ] **Step 1: Campaña.**
  - Agregar el `Link` "Subir lote" (icono `Images`, variante outline) junto a "Registrar depósito"; con la campaña cerrada, un `Button disabled`.
  - Agregar "Revisar (N)" (`Link` a `/campanas/:id/revision`) cuando `contarPendientesDepositos` > 0, cargado con su propio `useData`.
- [ ] **Step 2: Tasas.** Lo mismo con `contarPendientesTasas` y las rutas `/tasas/lote` y `/tasas/revision`.
- [ ] **Step 3: Checklist.** Nueva sección "Subida en lote y revisión":
  - Subir 5 capturas mezcladas (una no imagen → aviso).
  - Gerente para el lote.
  - Salir a mitad → las no leídas quedan para llenar a mano.
  - Revisar: Hecho → siguiente, los saldos cambian solo al darle Hecho.
  - Cerrar la app con un elemento a medio corregir → al volver, la corrección sigue.
  - Asignar gerente a marcados.
  - Duplicado dentro de la cola.
  - Descartar borra la imagen.
  - Campaña cerrada → solo lectura.
  - Tasas: lote, revisión, fecha repetida → error y sigue pendiente.
- [ ] **Step 4: CLAUDE.md.**
  - Arquitectura: `src/features/lote/` (subir y revisar; cola en `db/repos/cola.ts`; "Hecho" en `db/operaciones/revision.ts`), `ZoomableImage` + `lib/zoom.ts`.
  - Reglas: "La cola no cuenta en saldos: solo `Hecho` crea el depósito o la tasa".
  - Trampas: "El `onWheel` de React es pasivo: para `preventDefault` usar `addEventListener` con `{ passive: false }`".
- [ ] **Step 5: Correr** `pnpm test` y `pnpm build`. Esperado: en verde.
- [ ] **Step 6: Commit** `feat: accesos a subida en lote y revisión; docs`.
