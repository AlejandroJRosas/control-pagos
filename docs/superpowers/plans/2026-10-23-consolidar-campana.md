# Consolidar una campaña entre dos instalaciones — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar los depósitos de una campaña de una instalación a otra con un archivo `.cpagos` (por WhatsApp). El que recibe ve un resumen y confirma: entran los nuevos, se aplican las correcciones y se aplican las eliminaciones que confirme.

**Architecture:**
- **Formato del archivo:** `domain/paquete.ts`. Tipos, validación y armado puro.
- **Datos para el envío:** `db/queries/envioConsolidar.ts`.
- **Zip:** se arma y se lee en Rust (`src-tauri/src/paquete.rs`), con envoltorios en `platform/paquete.ts`.
- **Comparación pura:** `domain/consolidar.ts` empareja y clasifica cada depósito en nuevo, corrección, conflicto, eliminación, vínculo o no incluido.
- **Plan y aplicación:** `db/operaciones/consolidar.ts` carga lo local, arma el plan y lo aplica todo o nada, con reversión manual.
- **Tablas nuevas (v7):** recuerdan las eliminaciones, los emparejamientos y el último intercambio por gerente.
- **UI:** un diálogo para enviar (menú Campaña) y una pantalla `/consolidar?carpeta=…` para recibir. El archivo se abre desde el menú o soltándolo en la ventana.

**Tech Stack:** TypeScript, React, Base UI (shadcn), vitest + sql.js, Tauri 2, Rust (crate `zip` v2), decimal.js.

**Spec:** `docs/superpowers/specs/2026-10-23-consolidar-campana-design.md`

## Global Constraints

- UI y mensajes en español. Fechas `dd/mm/aaaa` en pantalla y `YYYY-MM-DD` en BD. Errores de negocio con `DomainError` (mensaje mostrado tal cual).
- Montos como texto decimal exacto. Para comparar se usa `Decimal`, nunca `number`. No se guardan derivados.
- SQL solo con `?`. Las migraciones se **agregan** (v7), con una sentencia por elemento e `IF NOT EXISTS`.
- Extensión `.cpagos`: es un zip con `paquete.json` + `imagenes/<archivo>`, escrito en `.part` y renombrado al terminar.
- `formato: 1`. Un archivo con `formato` mayor se rechaza con "El archivo es de una versión más nueva de Control de Pagos: actualiza la app para abrirlo".
- Los comprobantes van tal cual, sin recomprimir.
- Respaldo `antes-de-consolidar-*` (`respaldoAntesDe(db, "consolidar")`) antes de aplicar.
- Todo botón deshabilitado por una regla usa `BotonConMotivo`. Campaña cerrada = `MOTIVO_CERRADA`.
- Commits en español con prefijo (`feat:`, `test:`, `docs:`…), directo en `main`. Sin prettier, estilo a mano (~160 col), finales de línea LF.
- Verificación: `pnpm test`, `pnpm build` y `cd src-tauri; cargo test --lib`.

## Review Focus

1. **Abrir dos veces el mismo archivo** (o uno viejo después de uno nuevo): no debe crear, revertir ni duplicar nada. Todo queda en "Sin cambios" o en "Tu versión es más nueva". Prueba: Task 8, `aplicar el mismo paquete dos veces no cambia nada`.
2. **Un error a mitad de la aplicación** (p. ej. falla la tercera escritura): la BD queda exactamente como estaba, sin tasas creadas, depósitos ni equivalencias a medias. Prueba: Task 8, `si falla a mitad revierte todo`.
3. **Deshacer una eliminación** con el aviso de Deshacer: no debe quedar registrada como eliminada, o el siguiente envío la borraría en la otra app. Prueba: Task 1, `restaurarDepositos quita la eliminación`.
4. **Gerente que solo está en la otra app** (el caso de "un subconjunto"): por defecto queda "No incluir", sin pedir decisión, y sus depósitos aparecen en "No se incluyen". Prueba: Task 6, `gerente sin coincidencia queda en No incluir sin bloquear`.
5. **Fecha en fin de semana o feriado solo para quien recibe:** se usa su tasa del siguiente hábil, y si el archivo no la trae y no existe, el depósito va a "No se incluyen" con "Falta la tasa del dd/mm/aaaa". Prueba: Task 7, `feriado local sin tasa no se incluye`.

---

### Task 1: Migración v7 y registro de eliminaciones, equivalencias e intercambios

**Files:**
- Modify: `src/db/migrations.ts` (nueva versión 7 al final de `MIGRATIONS`)
- Create: `src/db/repos/consolidacion.ts`
- Modify: `src/db/repos/depositos.ts` (`deleteDepositos`, `restaurarDepositos`, `createDeposito`, `updateDeposito`)
- Test: `src/db/repos/consolidacion.test.ts`, `src/db/repos/depositos.test.ts`

**Interfaces:**
- Produces, en `src/db/repos/consolidacion.ts`:
  - `type TablaEquivalencia = "campanas" | "gerentes" | "depositos"`
  - `getEquivalencias(db, tabla: TablaEquivalencia): Promise<Map<string, number>>` (uuid remoto → id local)
  - `setEquivalencia(db, tabla, uuidRemoto: string, idLocal: number): Promise<void>` (upsert)
  - `deleteEquivalencia(db, tabla, uuidRemoto): Promise<void>`
  - `type Sentido = "envio" | "recibo"`
  - `getIntercambios(db, campanaId: number): Promise<Map<number, { envio: string | null; recibo: string | null }>>` (por asignacionId)
  - `marcarIntercambio(db, asignacionIds: number[], sentido: Sentido, en: string): Promise<void>`
  - `listEliminaciones(db, campanaUuid: string): Promise<{ uuid: string; asignacionUuid: string; eliminadoEn: string }[]>`
  - `uuidsEliminados(db): Promise<Set<string>>`
- Produces, en `depositos.ts`:
  - `createDeposito(db, asignacionId, v, meta?: { uuid: string; creadoEn: string; actualizadoEn: string }): Promise<number>`
  - `updateDeposito(db, id, v, meta?: { actualizadoEn: string; asignacionId?: number }): Promise<void>`
  - Sin `meta` se comportan igual que hoy.

- [ ] **Step 1: Escribir las pruebas que fallan**

En `consolidacion.test.ts` (con `createTestDb` y `seedBasico`):
- `equivalencias: set, get y reemplazo`: `setEquivalencia(db,"gerentes","u1",5)` y luego `"u1",6` → `getEquivalencias` = `Map{"u1"→6}`. Las otras tablas quedan vacías.
- `intercambios por asignación`: `marcarIntercambio(db,[s.asignacionId],"envio","2026-10-20T10:00:00.000Z")` → `getIntercambios(db,s.campanaId).get(s.asignacionId)` = `{ envio: "2026-10-20T10:00:00.000Z", recibo: null }`.

En `depositos.test.ts`:
- `deleteDepositos registra la eliminación con su campaña y asignación`: después de borrar un depósito, `listEliminaciones(db, <uuid de la campaña>)` = `[{ uuid: <uuid del depósito>, asignacionUuid: <uuid de la asignación>, eliminadoEn: expect.any(String) }]`, y `uuidsEliminados` lo contiene.
- `restaurarDepositos quita la eliminación`: borrar y luego restaurar con lo devuelto → `listEliminaciones` = `[]`.
- `createDeposito con meta conserva uuid y fechas`: `meta = { uuid: "11111111-1111-4111-8111-111111111111", creadoEn: "2026-03-02T10:00:00.000Z", actualizadoEn: "2026-03-03T10:00:00.000Z" }` → `getDeposito` devuelve esos tres valores. Sigue lanzando `DUPLICADO` igual que sin meta.
- `updateDeposito con meta pone actualizado_en y puede cambiar de asignación`: con un segundo gerente en la campaña, `updateDeposito(db,id,v,{actualizadoEn:"2026-03-05T00:00:00.000Z", asignacionId: otra})` → `asignacionId === otra` y `actualizadoEn === "2026-03-05T00:00:00.000Z"`. Si `otra` es de una campaña cerrada, lanza `CAMPANA_CERRADA`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `pnpm vitest run src/db/repos/consolidacion.test.ts src/db/repos/depositos.test.ts`
Expected: FAIL (no existe `consolidacion.ts` / `listEliminaciones`).

- [ ] **Step 3: Implementar**

Migración v7, con el comentario: "Consolidar campañas entre instalaciones: depósitos eliminados, emparejamientos con la otra app y último envío/recibo por gerente".
- `CREATE TABLE IF NOT EXISTS eliminaciones (uuid TEXT PRIMARY KEY, tabla TEXT NOT NULL, campana_uuid TEXT NOT NULL, asignacion_uuid TEXT NOT NULL, eliminado_en TEXT NOT NULL)`
- `CREATE INDEX IF NOT EXISTS idx_eliminaciones_campana ON eliminaciones(campana_uuid)`
- `CREATE TABLE IF NOT EXISTS equivalencias (tabla TEXT NOT NULL, uuid_remoto TEXT NOT NULL, id_local INTEGER NOT NULL, PRIMARY KEY (tabla, uuid_remoto))`
- `CREATE TABLE IF NOT EXISTS consolidaciones (asignacion_id INTEGER NOT NULL REFERENCES asignaciones(id) ON DELETE CASCADE, sentido TEXT NOT NULL, en TEXT NOT NULL, PRIMARY KEY (asignacion_id, sentido))`

Cambios en los repos:
- `deleteDepositos` lee el uuid de la campaña y de la asignación con un JOIN antes del `DELETE`. Después del `DELETE`, hace `INSERT OR REPLACE INTO eliminaciones` con `tabla='depositos'` y `nowIso()`.
- `restaurarDepositos` hace `DELETE FROM eliminaciones WHERE uuid IN (…)` después de reinsertar.
- `eliminarCampana.ts` no se toca (no registra).
- `createDeposito` y `updateDeposito` usan `meta` cuando viene. Con `meta.asignacionId`, se valida también `assertEditable` de la nueva asignación.

- [ ] **Step 4: Correr y ver que pasan**

Run: `pnpm vitest run src/db` → PASS (incluye las pruebas de migraciones existentes).

- [ ] **Step 5: Commit** — `feat: tablas de eliminaciones, equivalencias e intercambios para consolidar`

---

### Task 2: Formato del paquete (`domain/paquete.ts`)

**Files:**
- Create: `src/domain/paquete.ts`
- Test: `src/domain/paquete.test.ts`

**Interfaces:**
- Produces:
```ts
export const FORMATO_PAQUETE = 1;
export type AsignacionPaquete = { uuid: string; gerente: { uuid: string; nombre: string }; saldoUsd: string; desde: string | null };
export type DepositoPaquete = {
  uuid: string; asignacionUuid: string; fecha: string; banco: string; referencia: string; cuentaDestino: string; montoBs: string;
  observaciones: string | null; tasaFecha: string; creadoEn: string; actualizadoEn: string; imagen: string | null; // nombre dentro de imagenes/
};
export type EliminacionPaquete = { uuid: string; asignacionUuid: string; eliminadoEn: string };
export type Paquete = {
  formato: 1; appVersion: string; creadoEn: string; origen: string;
  campana: { uuid: string; nombre: string };
  asignaciones: AsignacionPaquete[]; depositos: DepositoPaquete[]; tasas: { fecha: string; valor: string }[]; eliminaciones: EliminacionPaquete[];
};
export type DatosEnvio = {
  campana: { id: number; uuid: string; nombre: string };
  asignaciones: { id: number; uuid: string; gerenteId: number; gerenteUuid: string; gerenteNombre: string; saldoUsd: string; ultimoEnvio: string | null }[];
  depositos: (Omit<DepositoPaquete, "imagen"> & { asignacionId: number; tasaValor: string; imagenPath: string | null })[];
  eliminaciones: EliminacionPaquete[];
};
export type SeleccionEnvio = { asignacionIds: number[]; soloCambios: boolean };
export function armarPaquete(d: DatosEnvio, sel: SeleccionEnvio, meta: { appVersion: string; creadoEn: string; origen: string }):
  { paquete: Paquete; imagenes: string[] /* imagenPath de los incluidos, p. ej. "imagenes/x.jpg" */; porAsignacion: Map<number, number> /* depósitos que viajan */ };
export function leerPaquete(texto: string): Paquete; // lanza DomainError("VALIDACION", …)
export function nombreArchivoPaquete(campana: string, origen: string, hoy: string): string; // consolidar-<campaña>-<origen>-<hoy>.cpagos con archivoBase
```

- [ ] **Step 1: Escribir las pruebas que fallan** (`paquete.test.ts`, con un `DatosEnvio` de dos asignaciones A y B, depósitos con `actualizadoEn` 2026-10-01 y 2026-10-10, y una eliminación de A del 2026-10-05):
  - `incluye solo las asignaciones elegidas`: con `asignacionIds:[A]` no hay depósitos, eliminaciones ni asignación de B.
  - `sin soloCambios manda todo y desde=null`.
  - `con soloCambios manda lo posterior al último envío de cada gerente`:
    - A con `ultimoEnvio` 2026-10-05 → solo el depósito del 10 y ninguna eliminación (la del 05 no es posterior).
    - B con `ultimoEnvio: null` va completo.
    - `desde` refleja cada caso.
  - `tasas: una por tasaFecha usada, con su valor`.
  - `imagen es el nombre del archivo y imagenes las rutas`: `imagenPath:"imagenes/ab.jpg"` → `imagen:"ab.jpg"` y `imagenes` contiene `"imagenes/ab.jpg"`.
  - `porAsignacion cuenta los depósitos que viajan`.
  - `leerPaquete acepta lo que arma armarPaquete` (`leerPaquete(JSON.stringify(p))` → igual a `p`).
  - `leerPaquete rechaza`, cada caso con su mensaje:
    - texto no JSON → "El archivo no es un paquete de Control de Pagos válido";
    - `formato:2` → el mensaje de versión más nueva;
    - monto `"1.234,5"`, fecha `"2026-13-01"` o imagen `"../x.jpg"` → "El archivo no es un paquete de Control de Pagos válido".
  - `nombreArchivoPaquete("Marzo 2026","PC-OFICINA","2026-10-23")` → `"consolidar-marzo-2026-pc-oficina-2026-10-23.cpagos"`. Ajustar el valor esperado a lo que dé `archivoBase` de `lib/formatoEnvio.ts`; si ese helper está en `lib/`, moverlo a `domain/texto.ts` y reexportarlo desde `lib/formatoEnvio.ts`.

- [ ] **Step 2: Run** `pnpm vitest run src/domain/paquete.test.ts` → FAIL.

- [ ] **Step 3: Implementar.** Reglas de `leerPaquete`:
  - montos y saldo: `/^\d+(\.\d+)?$/`;
  - fechas: `isValidIsoDate`;
  - uuids: no vacíos;
  - `imagen`: null o un nombre simple (`/^[A-Za-z0-9_-]+\.(png|jpe?g|webp)$/i`).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `feat: formato del paquete para consolidar campañas`

---

### Task 3: Datos para el envío (`db/queries/envioConsolidar.ts`)

**Files:**
- Create: `src/db/queries/envioConsolidar.ts`
- Test: `src/db/queries/envioConsolidar.test.ts`

**Interfaces:**
- Consumes: `DatosEnvio` (Task 2), `getIntercambios` y `listEliminaciones` (Task 1).
- Produces: `cargarEnvio(db, campanaId: number): Promise<DatosEnvio>`. Los depósitos van en orden cronológico (`fecha, creado_en, id`) y `tasaFecha`/`tasaValor` salen de su tasa.

- [ ] **Step 1: Prueba**
  - `cargarEnvio arma asignaciones, depósitos con su tasa y eliminaciones de la campaña`, usando `seedBasico`:
    - dos depósitos, uno de ellos eliminado después;
    - un depósito en otra campaña, que no debe aparecer;
    - `marcarIntercambio` envío para Ana → `ultimoEnvio` presente.
  - Comprobar con `toMatchObject`:
    - `tasaFecha: "2026-03-02"`, `tasaValor: "36.5"`;
    - `gerenteNombre: "Ana"`;
    - una eliminación.

- [ ] **Step 2: Run** `pnpm vitest run src/db/queries/envioConsolidar.test.ts` → FAIL.

- [ ] **Step 3: Implementar** con dos `SELECT` (asignaciones + gerentes, depósitos + tasas), más `getIntercambios` y `listEliminaciones`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `feat: datos de la campaña para armar el paquete de consolidación`

---

### Task 4: Zip del paquete en Rust

**Files:**
- Create: `src-tauri/src/paquete.rs`
- Modify: `src-tauri/src/lib.rs` (comandos y `generate_handler!`), `src-tauri/src/envios.rs` (`nombre_valido` acepta `cpagos`)

**Interfaces** (Rust, invocados desde JS en Task 5):
- `paquete::crear(dest: &Path, datos: &str, imagenes_dir: &Path, imagenes: &[String]) -> Result<(), String>`
  - Escribe `<dest>.part` con `paquete.json` + `imagenes/<nombre>` y lo renombra.
  - `imagenes` son nombres simples; uno que no existe se omite.
- `paquete::abrir(zip: &Path, destino: &Path) -> Result<String, String>`
  - Extrae `paquete.json` a `destino/paquete.json` e `imagenes/*` a `destino/imagenes/`, y devuelve el texto del JSON.
  - Rechaza rutas con `/`, `\`, `..` o `:` dentro de `imagenes/` ("El archivo contiene una ruta no permitida: …").
  - Sin `paquete.json` → "El archivo no es un paquete de Control de Pagos válido".
  - Un zip inválido da ese mismo error.
- `paquete::nombre_simple(n: &str) -> bool`: `[A-Za-z0-9_-]+\.[a-z0-9]+`, sin separadores.
- `paquete::tamano(imagenes_dir: &Path, imagenes: &[String]) -> u64`: suma de los que existen.
- Comandos:
  - `crear_paquete(app, datos: String, imagenes: Vec<String>, nombre: String, ruta: Option<String>) -> Result<String, String>`:
    - las `imagenes` llegan como `"imagenes/x.jpg"`: se quita el prefijo y cada nombre se valida con `nombre_simple`;
    - sin `ruta`, escribe en `app_data/envios/<nombre>` (`envios::nombre_valido`) y devuelve la ruta escrita.
  - `abrir_paquete(app, ruta: Option<String>, recibido: Option<String>) -> Result<String, String>`:
    - el origen es `ruta` (absoluta) o `app_data/recibidos/<recibido>` (nombre simple `.cpagos`);
    - extrae a `app_data/recibidos/p<nanos>/` y devuelve la carpeta relativa a AppData (`"recibidos/p<nanos>"`);
    - antes poda lo de `recibidos/` con más de 7 días (archivos y carpetas).
  - `tamano_imagenes(app, imagenes: Vec<String>) -> Result<u64, String>`.
  - `nombre_equipo() -> String`: `COMPUTERNAME`, o `""`.

- [ ] **Step 1: Pruebas en `paquete.rs`** (`#[cfg(test)]`, `tempfile`):
  - `crear_y_abrir_ida_y_vuelta`: crea con dos imágenes, una de ellas inexistente → `abrir` devuelve el mismo JSON, `destino/imagenes/a.jpg` existe con el mismo contenido y la inexistente no está.
  - `no_deja_part`: tras `crear` no queda `<dest>.part`.
  - `rechaza_rutas_peligrosas`: un zip con `imagenes/../x.jpg` → `Err` que contiene "ruta no permitida".
  - `rechaza_zip_sin_paquete`.
  - En `envios.rs`, ampliar `acepta_solo_nombres_simples_de_pdf_o_excel` con `assert!(nombre_valido("consolidar-marzo-pc-2026-10-23.cpagos"))`.

- [ ] **Step 2: Run** `cd src-tauri; cargo test --lib` → FAIL (no compila: falta el módulo).

- [ ] **Step 3: Implementar** reutilizando el patrón de `backup::create_zip`/`extract_to` (Deflated, `.part`) y registrar los cuatro comandos. La poda de `recibidos/` reutiliza la lógica de edad de `envios::podar` extendida a carpetas, o una función propia en `paquete.rs`.

- [ ] **Step 4: Run** `cargo test --lib` → PASS.

- [ ] **Step 5: Commit** — `feat: zip del paquete de consolidación en Rust`

---

### Task 5: Plataforma del paquete (`platform/paquete.ts`)

**Files:**
- Create: `src/platform/paquete.ts`
- Modify: `src/testing/setupUi.ts` (si hace falta, agregar `exists` al mock de `plugin-fs`, que devuelve `true`)

**Interfaces:**
- Consumes: los comandos de Task 4 y `saveImage`/`mimeForPath` de `platform/images.ts`.
- Produces:
  - `copiarPaquete(paquete: Paquete, imagenes: string[], nombre: string): Promise<void>`: `crear_paquete` sin ruta + `copiar_envio`.
  - `guardarPaqueteComo(paquete, imagenes, nombre): Promise<boolean>`: diálogo `save` con filtro `{ name: "Paquete de Control de Pagos", extensions: ["cpagos"] }`; `false` si se cancela.
  - `abrirPaqueteDeDialogo(): Promise<string | null>`: `open` con el mismo filtro → `abrir_paquete({ ruta })` → carpeta.
  - `abrirPaqueteDeArchivo(f: File): Promise<string>`: escribe en `recibidos/r<Date.now()>.cpagos` (AppData) → `abrir_paquete({ recibido })` → carpeta.
  - `leerPaqueteDeCarpeta(carpeta: string): Promise<Paquete>`: `readFile(\`${carpeta}/paquete.json\`)` → `leerPaquete`.
  - `importarImagenRecibida(carpeta: string, nombre: string): Promise<string | null>`: `null` si no existe; si existe, `saveImage(new Blob([bytes], { type: mimeForPath(nombre) }))`.
  - `tamanoImagenes(imagenes: string[]): Promise<number>`.
  - `nombreEquipo(): Promise<string>`: `""` → `"otro equipo"`.
  - `esPaquete(f: { name: string }): boolean`: termina en `.cpagos`, sin importar mayúsculas.

- [ ] **Step 1:** Sin prueba propia: son envoltorios finos que cubren las pruebas de UI de las Tasks 9 y 10. `esPaquete` se prueba en `src/platform/paquete.test.ts` con `"A.CPAGOS"` → true y `"a.zip"` → false.
- [ ] **Step 2: Run** `pnpm vitest run src/platform/paquete.test.ts` → FAIL, luego implementar → PASS.
- [ ] **Step 3: Commit** — `feat: abrir, guardar y copiar paquetes de consolidación`

---

### Task 6: Emparejar campaña y gerentes (`domain/consolidar.ts`, parte 1)

**Files:**
- Create: `src/domain/consolidar.ts`
- Test: `src/domain/consolidar.test.ts`

**Interfaces:**
- Produces:
```ts
export type EstadoEmparejamiento = "recordado" | "nombre" | "ninguno" | "varios" | "elegido";
export function emparejarCampana(remota: { uuid: string; nombre: string }, locales: { id: number; nombre: string }[], recordada: number | undefined):
  { campanaId: number | null; estado: EstadoEmparejamiento };
export type AsignacionLocal = { id: number; uuid: string; gerenteId: number; gerenteNombre: string; saldoUsd: string; ultimoEnvio: string | null; ultimoRecibo: string | null };
export type GerenteEmparejado = { asignacionId: number | null | undefined; estado: EstadoEmparejamiento }; // undefined = falta decidir
export function emparejarGerentes(remotas: AsignacionPaquete[], locales: AsignacionLocal[], recordados: Map<string, number> /* gerente uuid remoto → gerenteId */):
  Record<string /* asignacionUuid remoto */, GerenteEmparejado>;
```

Reglas:
1. Primero lo **recordado**: la equivalencia del gerente apunta a un `gerenteId` que tiene asignación en esta campaña.
2. Si no, por **nombre** con `claveComparacion`:
   - una sola coincidencia → `"nombre"`;
   - ninguna → `asignacionId: null`, `"ninguno"`, que es **No incluir sin bloquear**;
   - varias → `undefined`, `"varios"`.
3. Dos remotas no pueden quedar en la misma asignación local: la segunda queda `undefined`/`"varios"`.

- [ ] **Step 1: Pruebas:**
  - `campaña recordada gana al nombre`;
  - `campaña por nombre sin acentos ni mayúsculas` ("MARZO " ↔ "Marzo");
  - `campaña con dos coincidencias pide elegir` (`campanaId: null`, `"varios"`);
  - `gerente recordado`;
  - `gerente por nombre` ("Jose Perez" ↔ "José Pérez");
  - **`gerente sin coincidencia queda en No incluir sin bloquear`**;
  - `dos gerentes locales con el mismo nombre piden decidir`;
  - `dos remotos no caen en la misma asignación`.
- [ ] **Step 2: Run** `pnpm vitest run src/domain/consolidar.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: emparejar campaña y gerentes al consolidar`

---

### Task 7: Clasificar el paquete (`domain/consolidar.ts`, parte 2)

**Files:**
- Modify: `src/domain/consolidar.ts`
- Test: `src/domain/consolidar.test.ts`

**Interfaces:**
- Produces:
```ts
export type DepositoLocal = { id: number; uuid: string; asignacionId: number; campanaId: number; campanaNombre: string; fecha: string; banco: string;
  referencia: string; cuentaDestino: string; montoBs: string; observaciones: string | null; imagenPath: string | null; actualizadoEn: string };
export type LocalConsolidar = {
  campana: { id: number; uuid: string; nombre: string; estado: EstadoCampana };
  asignaciones: AsignacionLocal[];
  depositos: DepositoLocal[];                 // de TODAS las campañas
  tasas: Map<string, { id: number; valor: string; usos: number }>; // por fecha
  feriados: ReadonlySet<string>;
  eliminados: ReadonlySet<string>;           // uuids eliminados aquí
  equivalenciasDepositos: Map<string, number>; // uuid remoto → id local
};
export type Campo = "fecha" | "banco" | "referencia" | "cuentaDestino" | "montoBs" | "observaciones" | "gerente";
export type Cambio = { campo: Campo; antes: string | null; despues: string | null };
export type TasaUsada = { fecha: string; accion: "existente" | "crear" | "distinta" };
export type Nuevo = { remoto: DepositoPaquete; asignacionId: number; tasa: TasaUsada };
export type Correccion = { remoto: DepositoPaquete; local: DepositoLocal; asignacionId: number; tasa: TasaUsada; cambios: Cambio[] };
export type Conflicto = Correccion & { tipo: "editadoEnAmbas" | "duplicado" };
export type Eliminacion = { remotoUuid: string; local: DepositoLocal };
export type Vinculo = { remoto: DepositoPaquete; local: DepositoLocal };
export type NoIncluido = { remoto: DepositoPaquete; gerenteNombre: string; motivo: string };
export type PlanConsolidacion = {
  campana: LocalConsolidar["campana"];
  nuevos: Nuevo[]; correcciones: Correccion[]; conflictos: Conflicto[]; eliminaciones: Eliminacion[]; vinculos: Vinculo[];
  sinCambios: number; masNuevasAqui: Correccion[]; noIncluidos: NoIncluido[];
  tasasNuevas: { fecha: string; valor: string }[];
  tasasDistintas: { fecha: string; local: string; archivo: string; usos: number }[];
  saldos: { asignacionId: number; gerenteNombre: string; local: string; archivo: string }[];
};
export type Eleccion = "mia" | "archivo";
export type Decisiones = { tasas: Record<string, Eleccion | undefined>; saldos: Record<number, Eleccion>; conflictos: Record<string, Eleccion>; eliminar: Set<string> };
export function clasificar(p: Paquete, local: LocalConsolidar, gerentes: Record<string, GerenteEmparejado>): PlanConsolidacion;
export function decisionesIniciales(plan: PlanConsolidacion): Decisiones; // saldos "mia"; conflictos: editadoEnAmbas "archivo", duplicado "mia"; eliminar = todas; tasas sin decidir
export function motivoPendiente(plan: PlanConsolidacion, gerentes: Record<string, GerenteEmparejado>, d: Decisiones): string | null;
```

Reglas de `clasificar`, por depósito remoto y en este orden:

1. **Gerente:** `gerentes[d.asignacionUuid]?.asignacionId` es null o undefined → `NoIncluido`. El motivo es `"<nombre> no está en tu campaña"`, o `"Elegiste no incluir a <nombre>"` si `estado === "elegido"`.
2. **Local por uuid** (o por `equivalenciasDepositos`):
   - si está en otra campaña → `NoIncluido` con `"Está en tu campaña <nombre>"`;
   - si no hay local y el uuid está en `eliminados` → `"Lo eliminaste en tu app"`.
3. **Sin local**, buscar un duplicado con `claveDuplicado`:
   - en otra campaña → `"Ya existe en tu campaña <nombre>"`;
   - en esta campaña, con los campos iguales → `Vinculo`;
   - en esta campaña, con campos distintos → `Conflicto` `"duplicado"`.
   - Si es repetido de otro remoto ya clasificado → `"Repetido en el archivo"`.
4. **Sin local ni duplicado** → `Nuevo`.
5. **Con local en esta campaña**:
   - `actualizadoEn` igual → `sinCambios++`;
   - el remoto es más viejo → `masNuevasAqui`;
   - el remoto es más nuevo y el local fue editado desde el último intercambio → `Conflicto` `"editadoEnAmbas"`. Último intercambio = el mayor entre `ultimoEnvio` y `ultimoRecibo` de su asignación local; si es null, cuenta como editado.
   - el remoto es más nuevo y el local no fue editado → `Correccion`.
   - Si con la corrección quedaría duplicado de otro local → `NoIncluido` con `"Quedaría duplicado de <banco> <referencia>"`.
6. **Tasa** de cada nuevo, corrección o conflicto: `rige = fechaDeTasa(remoto.fecha, local.feriados)`.
   - Hay tasa local en `rige`: si el valor es igual (`Decimal.eq`) al de la tasa del archivo con fecha `remoto.tasaFecha` → `"existente"`; si no → `"distinta"`, con una entrada por fecha en `tasasDistintas`.
   - No hay tasa local y el archivo trae la de `rige` → `"crear"`, con una entrada en `tasasNuevas`.
   - Si no → `NoIncluido` con `"Falta la tasa del <dd/mm/aaaa>"`.
7. **Campos comparados:** los de `Campo`, con `montoBs` por `Decimal.eq`; `"gerente"` = cambio de asignación.

Eliminaciones remotas: se resuelve el uuid (o su equivalencia) a un depósito local de esta campaña. Si no hay → se ignora.

Saldos: asignaciones emparejadas con `saldoUsd` distinto (`Decimal`).

`motivoPendiente`, en orden:
1. campaña cerrada → `MOTIVO_CERRADA`;
2. gerente `undefined` → `"Indica quién es <nombre> en tu campaña"`;
3. tasa distinta sin decidir → `"Elige la tasa del <dd/mm/aaaa>"`;
4. nada que aplicar (sin nuevos, correcciones, conflictos, eliminaciones marcadas, vínculos, tasas nuevas ni saldos con `"archivo"`) → `"No hay nada nuevo para consolidar"`.

Si no hay ninguno, `null`. `MOTIVO_CERRADA` se importa del componente o se mueve a `domain/`, como convenga sin dependencia de React.

- [ ] **Step 1: Pruebas**, una por regla, con un `LocalConsolidar` construido a mano:
  - `nuevo con tasa existente`;
  - `nuevo crea la tasa que falta`;
  - **`feriado local sin tasa no se incluye`**: el remoto del 2026-03-02 con `tasaFecha` 2026-03-02; para quien recibe el 02 es feriado y el archivo no trae la del 03 → motivo `"Falta la tasa del 03/03/2026"`;
  - `tasa distinta se lista una vez por fecha`;
  - `corrección cuando el remoto es más nuevo y el local no se tocó`;
  - `conflicto editadoEnAmbas`;
  - `mi versión más nueva no se toca`;
  - `mismo actualizadoEn = sin cambios`;
  - `duplicado igual se vincula`;
  - `duplicado distinto es conflicto`;
  - `duplicado en otra campaña no se incluye`;
  - `uuid en otra campaña no se incluye`;
  - `eliminado aquí no se recrea`;
  - `eliminación remota se resuelve por equivalencia`;
  - `saldo distinto`;
  - `motivoPendiente en orden`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: clasificar el paquete al consolidar`

---

### Task 8: Planificar y aplicar (`db/operaciones/consolidar.ts`)

**Files:**
- Create: `src/db/operaciones/consolidar.ts`
- Test: `src/db/operaciones/consolidar.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 6 y 7. Usa `createDeposito`/`updateDeposito` con `meta`, `deleteDepositos`, `createTasa`, `updateTasa`, `updateSaldoAsignacion`, `setEquivalencia` y `marcarIntercambio`.
- Produces:
  - `cargarLocal(db, campanaId: number): Promise<LocalConsolidar>`
  - `emparejamientoInicial(db, p: Paquete, campanaSugerida: number | null): Promise<{ campanaId: number | null; estadoCampana: EstadoEmparejamiento; gerentes: Record<string, GerenteEmparejado> }>`
    - La campaña sugerida (la de la ruta) se usa solo si no hay una recordada ni coincidencia por nombre única; si no, gana la recordada o la del nombre.
  - `type Resultado = { nuevos: number; corregidos: number; eliminados: number; vinculados: number; tasasCreadas: number; tasasCambiadas: number; saldosCambiados: number }`
  - `aplicarConsolidacion(db, p: Paquete, plan: PlanConsolidacion, gerentes: Record<string, GerenteEmparejado>, d: Decisiones, deps: { importarImagen: (nombre: string) => Promise<string | null>; ahora: string }): Promise<Resultado>`

Orden de aplicación:
1. `assertCampanaActiva`.
2. Tasas nuevas.
3. Tasas distintas con `"archivo"` (`updateTasa` con el valor del archivo).
4. Saldos con `"archivo"`.
5. Eliminaciones marcadas (`deleteDepositos`, que ya las registra).
6. Correcciones y conflictos con `"archivo"` (`updateDeposito` con `meta: { actualizadoEn: remoto.actualizadoEn, asignacionId }` e imagen importada si `remoto.imagen`; sin `remoto.imagen` → `imagenPath: null`).
7. Nuevos (`createDeposito` con `meta` del remoto).
8. Equivalencias:
   - campaña, si el uuid difiere;
   - cada gerente emparejado: gerente uuid remoto → `gerenteId`;
   - cada vínculo y cada conflicto `"duplicado"`: uuid remoto → id local.
9. `marcarIntercambio(asignaciones emparejadas, "recibo", ahora)`.

La `tasaId` de cada depósito se busca con `getTasaParaFecha` después de crear las tasas.

**Reversión:** se acumulan funciones de deshacer en una pila y, ante un error, se ejecutan al revés y se relanza:
- depósito creado → `DELETE` directo, sin registrar eliminación;
- depósito actualizado → `UPDATE` directo con la fila previa;
- eliminados → `restaurarDepositos`;
- tasa creada → `deleteTasa`;
- tasa cambiada → `updateTasa` con el valor previo;
- saldo → el previo;
- equivalencia nueva → `deleteEquivalencia`, o reponer la anterior;
- intercambio → reponer el previo.

- [ ] **Step 1: Pruebas** con sql.js. Para armar los paquetes: `cargarEnvio` + `armarPaquete` de una BD "origen" y aplicar en otra BD "destino", ambas con `seedBasico` y nombres iguales (dos instalaciones reales).
  - `primer intercambio`:
    - entran los depósitos con el mismo uuid;
    - el gerente queda recordado;
    - `Resultado.nuevos = 2`;
    - `buildCampanaView` del destino suma lo mismo que el origen.
  - **`aplicar el mismo paquete dos veces no cambia nada`**:
    - el segundo `clasificar` da `sinCambios = 2` y nada más;
    - `motivoPendiente` = `"No hay nada nuevo para consolidar"`.
  - `corrección de ida y vuelta`: el origen corrige el monto y reenvía con `soloCambios` → el destino queda con el monto nuevo.
  - `eliminación confirmada`: el origen elimina y reenvía → el destino lo borra y lo registra en `eliminaciones`.
  - `eliminación desmarcada no se aplica`.
  - `tasa distinta con "archivo" cambia la tasa local`.
  - `gerente solo en el origen no crea nada`: no hay gerentes ni asignaciones nuevas en el destino.
  - **`si falla a mitad revierte todo`**:
    - `importarImagen` lanza en el segundo depósito nuevo;
    - antes: una tasa nueva, un saldo `"archivo"` y una eliminación marcada;
    - después del `rejects`: depósitos, tasas, saldos, `eliminaciones`, `equivalencias` y `consolidaciones` iguales al estado previo (comparar `SELECT *` de cada tabla).
  - `campaña cerrada` → `rejects` con `CAMPANA_CERRADA`.
- [ ] **Step 2: Run** `pnpm vitest run src/db/operaciones/consolidar.test.ts` → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: aplicar la consolidación de una campaña con reversión`

---

### Task 9: Enviar — diálogo "Compartir para consolidar"

**Files:**
- Create: `src/features/campana/CompartirConsolidarDialog.tsx`
- Modify: `src/features/campana/CampanaPage.tsx` (menú "Campaña": ítem **Compartir para consolidar**, deshabilitado sin gerentes)
- Test: `src/features/campana/consolidar.ui.test.tsx`

**Interfaces:**
- Consumes: `cargarEnvio` (Task 3), `armarPaquete` y `nombreArchivoPaquete` (Task 2), `copiarPaquete`, `guardarPaqueteComo`, `tamanoImagenes` y `nombreEquipo` (Task 5), `marcarIntercambio` (Task 1), `loadDuplicadosCampana`, `listEtiquetas`, `useVersion`.
- Produces: `<CompartirConsolidarDialog campanaId open onOpenChange />`.

Contenido del diálogo:
- Título "Compartir para consolidar". Descripción: "Genera un archivo con los depósitos de los gerentes elegidos para pasarlos a la app de otra persona."
- Lista de gerentes con `Casilla` y "marcar todos" (indeterminado). Al lado de cada uno, "N depósitos" (de `porAsignacion`).
- `BuscadorSelect` "Marcar por etiqueta": deja marcados solo los gerentes con esa etiqueta.
- Casilla "Solo lo que cambió desde mi último envío":
  - marcada si algún gerente tiene `ultimoEnvio`; si ninguno, deshabilitada con el motivo "Todavía no enviaste esta campaña";
  - debajo, "Último envío: dd/mm/aaaa hh:mm", el más reciente entre los marcados.
- "Tamaño aproximado: X MB": `tamanoImagenes` + largo del JSON, con 1 decimal y coma (`formatNumberVE`). Se recalcula al cambiar la selección.
- Botones:
  - **Copiar para WhatsApp** (principal): toast "Copiado: pégalo en el chat de WhatsApp con Ctrl+V".
  - **Guardar como…**: toast "Paquete guardado".
  - Los dos están deshabilitados con su motivo si hay duplicados ("Resuelve los depósitos duplicados para compartir") o si no hay gerentes marcados ("Marca al menos un gerente").
  - Mientras trabajan, el principal dice "Generando…".
- Tras éxito: `marcarIntercambio(marcados, "envio", nowIso())` y se cierra.

- [ ] **Step 1: Prueba UI** (`renderApp`, `hoy: "2026-10-23"`, `tauri.invoke` responde `crear_paquete` → `"x"`, `nombre_equipo` → `"PC-ANA"`, `tamano_imagenes` → `0`):
  - `comparte la campaña y lo copia para WhatsApp`:
    - abrir el menú Campaña → Compartir para consolidar → Copiar para WhatsApp;
    - `crear_paquete` se llamó con `nombre: "consolidar-marzo-pc-ana-2026-10-23.cpagos"` y un `datos` que contiene 1 depósito;
    - después se llamó `copiar_envio` con ese nombre.
  - `la segunda vez marca "Solo lo que cambió" y no repite lo ya enviado`: tras el primer envío, reabrir → casilla marcada y "0 depósitos".
  - `con duplicados no deja compartir`: botón deshabilitado.
- [ ] **Step 2: Run** `pnpm vitest run src/features/campana/consolidar.ui.test.tsx` → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat: compartir una campaña para consolidar`

---

### Task 10: Recibir — pantalla Consolidar, menú y soltar el archivo

**Files:**
- Create: `src/features/consolidar/ConsolidarPage.tsx`
- Modify: `src/App.tsx` (ruta `consolidar`), `CampanaPage.tsx` (ítem **Consolidar desde archivo…**, deshabilitado con `MOTIVO_CERRADA` si está cerrada), `src/components/SoltarImagenes.tsx`
- Test: `src/features/consolidar/consolidar.ui.test.tsx`

**Interfaces:**
- Consumes: `leerPaqueteDeCarpeta`, `abrirPaqueteDeDialogo`, `abrirPaqueteDeArchivo`, `importarImagenRecibida` y `esPaquete` (Task 5), más todo lo de la Task 8.
- Ruta: `/consolidar?carpeta=<recibidos/…>&campana=<id opcional>`. Desde el menú o al soltar se navega ahí con `campana` = la de la ruta o la actual.

**Pantalla** (`PageHeader` con título "Consolidar", migas a la campaña cuando esté elegida, `back` a la campaña):
- Encabezado: "Paquete de *origen* · creado el dd/mm/aaaa hh:mm · campaña *nombre*".
- **Emparejamientos**:
  - Campaña: `BuscadorSelect` de las campañas, visible siempre que no sea `"recordado"`.
  - Cada gerente remoto no `"recordado"`: fila "<nombre> es…" con `BuscadorSelect` de las asignaciones locales más "No incluir". Elegir pone `estado: "elegido"`.
  - Cambiar un emparejamiento vuelve a clasificar.
- Secciones, ocultas si están vacías y cada una con su cantidad en el título:
  - **Nuevos**, agrupados por gerente: fecha, banco, referencia, monto Bs, USD (con la tasa local o la del archivo si se crea, vía `toUsd`) y `ComprobanteIcono` (la imagen se lee de la carpeta).
  - **Correcciones**: cada `Cambio` como "campo: antes → después".
  - **Eliminaciones**: con `Casilla` por fila y "marcar todos".
  - **Diferencias**:
    - tasas distintas: botones "Mi tasa X" / "La del archivo Y", más "La usan N depósitos tuyos";
    - saldos;
    - conflictos lado a lado con "Quedarse con la mía" / "Usar la del archivo".
  - **No se incluyen**: lista con motivo.
  - "Sin cambios: N" y "Tu versión es más nueva: N", como texto discreto.
- Pie: resumen de cambios por gerente (USD antes → después, con `buildCampanaView` antes y la simulación sumando nuevos y correcciones) y el botón **Consolidar** con `BotonConMotivo` (`motivoPendiente`). Mientras trabaja dice "Consolidando…".
- Al confirmar:
  1. `respaldoAntesDe(db, "consolidar")`;
  2. `aplicarConsolidacion` con `importarImagen = (n) => importarImagenRecibida(carpeta, n)` y `ahora: nowIso()`;
  3. `invalidate()`;
  4. toast "Consolidado: 12 nuevos, 2 corregidos, 1 eliminado" (solo las partes distintas de 0);
  5. navegar a `/campanas/<id>`.
- Errores con `reportError`. Si `leerPaqueteDeCarpeta` falla (carpeta podada o archivo inválido): `Aviso` con el mensaje y un botón "Abrir otro archivo".

Menú y soltar:
- **Menú:** "Consolidar desde archivo…" → `abrirPaqueteDeDialogo()` → si hay carpeta, `navigate(\`/consolidar?carpeta=…&campana=<id>\`)`.
- **Soltar:** en `SoltarImagenes.onDrop`, antes de `separarImagenes`, si algún archivo cumple `esPaquete`:
  - se toma el primero, `abrirPaqueteDeArchivo` → navegar como arriba;
  - el resto se ignora con un toast si había más de uno.
  - El aviso a pantalla completa no se muestra para `.cpagos`, porque el tipo no se sabe al arrastrar.

- [ ] **Step 1: Pruebas UI.** `tauri.invoke`: `abrir_paquete` → `"recibidos/p1"`. El mock de `readFile` devuelve el JSON del paquete para `recibidos/p1/paquete.json` (armado con `armarPaquete` desde otra BD de sql.js, como en la Task 8):
  - `recibe un paquete y consolida`:
    - `renderApp("/consolidar?carpeta=recibidos/p1&campana=<id>")` → se ve "Nuevos (1)";
    - clic en Consolidar → la BD tiene el depósito;
    - se llamó `create_backup` (respaldo previo);
    - la ruta queda en la campaña.
  - `pide elegir la tasa distinta antes de consolidar`: botón deshabilitado hasta elegir "La del archivo".
  - `gerente que no está en la campaña aparece en No se incluyen`.
  - `soltar un .cpagos abre la pantalla Consolidar`: `fireEvent.drop(window, { dataTransfer: { files: [new File(["x"], "a.cpagos")], types: ["Files"] } })` → ruta `/consolidar`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/consolidar` → FAIL. **Step 3: Implementar.** **Step 4: Run** → PASS.
- [ ] **Step 5: Verificación completa:** `pnpm test`, `pnpm build` y `cd src-tauri; cargo test --lib`, todos en verde.
- [ ] **Step 6: Commit** — `feat: consolidar una campaña desde el archivo de otra instalación`

---

### Task 11: Documentación

**Files:**
- Modify: `CLAUDE.md` (sección Arquitectura: un punto "Consolidar campañas entre instalaciones" con los archivos de este plan, el formato `.cpagos` y las tablas v7; en Reglas del dominio: "un depósito recibido conserva uuid, `creado_en` y `actualizado_en` del origen; `deleteDepositos` registra en `eliminaciones` y `restaurarDepositos` lo quita").
- Modify: `docs/checklist-mvp.md` (casos manuales: enviar por WhatsApp y pegar en el chat; soltar el `.cpagos` en la otra app; ida y vuelta entre dos instancias, usando la instancia aislada de `CLAUDE.md`).

- [ ] **Step 1:** Escribir ambos cambios.
- [ ] **Step 2: Commit** — `docs: consolidar campañas en CLAUDE.md y checklist`
