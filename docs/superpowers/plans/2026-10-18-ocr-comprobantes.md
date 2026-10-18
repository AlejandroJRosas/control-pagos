# OCR de comprobantes y tasas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al adjuntar una captura de transferencia BDV o la imagen de "Tasa del día", el formulario correspondiente se llena solo con OCR local de Windows.

**Architecture:** Comando Tauri en Rust (`ocr_imagen`) que usa `Windows.Media.Ocr` y devuelve líneas con cajas. En TS: `OcrEngine` (motor intercambiable) → `agruparFilas` → reconocedores por formato registrados en una lista → normalización/confianza → `Extractor`. La UI aplica los resultados con una lógica pura de tres estados por campo (`autollenado.ts`).

**Tech Stack:** Tauri 2, Rust (crate `windows`), React 19, TypeScript, vitest, decimal.js.

**Spec:** `docs/superpowers/specs/2026-10-18-ocr-comprobantes-design.md`

## Global Constraints

- Todo local, sin internet. Ninguna dependencia JS nueva. En Rust solo se agrega el crate `windows`, como dependencia `cfg(windows)`.
- No hay migraciones nuevas y no se guarda nada nuevo en la BD.
- Montos como texto decimal: siempre por `parseMonto` / `parseTasa`. Al formulario van en formato de entrada con `toInputVE`.
- Comparación de etiquetas sin mayúsculas, acentos ni espacios: `claveComparacion`.
- Mensajes en español. Commits en español con prefijo (`feat:`, `fix:`, `docs:`, `test:`) y la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Finales de línea LF en todos los archivos.
- Al escribir archivos con barras invertidas (regex), usar la herramienta de escritura de archivos y no heredocs del shell.
- Confianza: etiqueta = 0,9; heurística = 0,7; constante = 0,95; fecha futura = como máximo 0,6; si no pasa la normalización, el campo no se propone.
- Las imágenes de ejemplo **no** se suben al repositorio. Solo van sus JSON de OCR, con los nombres de personas anonimizados.
- Verificación: `pnpm test`, `pnpm build` y `cd src-tauri; cargo test --lib`.

## Review Focus

1. **El ícono de copiar junto a "Operación"** puede leerse como un carácter extra pegado a la referencia ("0591323314060", "059132331406 D"). Se espera que se proponga la referencia de 12 dígitos, o que quede en ámbar si la corrida de dígitos no mide 12. → Pruebas en la Task 5.
2. **La etiqueta superpuesta "15$"** u otros números con "$" no deben tomarse como monto. Solo cuenta la fila que termina en "Bs". → Prueba en la Task 5.
3. **Resultado del OCR que llega tarde:** si la usuaria quitó o cambió la imagen mientras se leía, el resultado se descarta; si escribió en un campo, ese campo no se pisa. → Lógica pura en la Task 7 y token de imagen en la Task 8.
4. **Imagen que no es de ningún formato** (otra captura, la tasa soltada en el depósito): `formato: null`, ningún campo y un toast informativo. → Pruebas en las Tasks 5 y 6.
5. **Fecha con espacios o fecha inválida** ("16 / 10 / 2026", "31/02/2026"): la primera se acepta; la segunda no se propone. → Pruebas en la Task 4.

---

### Task 1: Comando Rust `ocr_imagen` y herramienta de captura

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/ocr.rs`
- Modify: `src-tauri/src/lib.rs` (agregar `pub mod ocr;`, el comando y registrarlo en `invoke_handler`)
- Create: `src-tauri/examples/ocr.rs`

**Interfaces:**
- Produces (Rust): `pub fn ocr::reconocer(bytes: &[u8]) -> Result<OcrResultado, String>`. Las structs `OcrResultado { lineas: Vec<OcrLinea>, ancho: u32, alto: u32 }`, `OcrLinea { texto: String, palabras: Vec<OcrPalabra>, caja: Caja }`, `OcrPalabra { texto: String, caja: Caja }` y `Caja { x: f32, y: f32, w: f32, h: f32 }` llevan `#[derive(Serialize)]` y `#[serde(rename_all = "camelCase")]`.
- Produces (IPC): comando `ocr_imagen`. Recibe los bytes de la imagen como **cuerpo crudo** del invoke y devuelve `OcrResultado` en JSON.

- [ ] **Step 1: Dependencia.** En `Cargo.toml` agregar:

```toml
[target.'cfg(windows)'.dependencies]
windows = { version = "0.61", features = ["Foundation", "Foundation_Collections", "Globalization", "Graphics_Imaging", "Media_Ocr", "Storage_Streams"] }
```

- [ ] **Step 2: Prueba que falla.** En `ocr.rs`, `#[cfg(test)]`:

```rust
#[test]
fn bytes_que_no_son_imagen_dan_error_en_espanol() {
    let e = reconocer(b"no es una imagen").unwrap_err();
    assert!(e.contains("imagen"), "{e}");
}
```

Run: `cd src-tauri; cargo test --lib ocr`. Expected: FAIL (no compila: `reconocer` no existe).

- [ ] **Step 3: Implementar `reconocer`** bajo `#[cfg(windows)]`. En otras plataformas devuelve `Err("El OCR solo está disponible en Windows".into())`.
  - Escribir los bytes en un `InMemoryRandomAccessStream` (con `DataWriter`), crear un `BitmapDecoder` y obtener un `SoftwareBitmap` en `Bgra8`. Si falla la decodificación: `Err("No se pudo leer la imagen: …")`.
  - Si el ancho o el alto superan `OcrEngine::MaxImageDimension()`, decodificar con un `BitmapTransform` escalado proporcionalmente (`GetSoftwareBitmapTransformedAsync`).
  - Motor: probar en orden `es`, `es-ES` y `es-VE` con `OcrEngine::TryCreateFromLanguage(&Language::CreateLanguage(..))`. Si ninguno funciona, usar `TryCreateFromUserProfileLanguages()`. Si tampoco hay motor: `Err("No hay reconocimiento de texto instalado en Windows. Instala el idioma español con 'Reconocimiento óptico de caracteres' en Configuración > Hora e idioma > Idioma.".into())`.
  - Mapear `OcrResult.Lines()` → `OcrLinea`: el texto de cada palabra con `BoundingRect` como caja, y la caja de la línea como unión de las de sus palabras. `ancho` y `alto` son los del bitmap reconocido.
  - Las llamadas WinRT son bloqueantes (`.get()`). Si en el hilo aparece el error de apartment no inicializado, llamar `RoInitialize(RO_INIT_MULTITHREADED)` al comienzo e ignorar el resultado "ya inicializado".

- [ ] **Step 4: Comando en `lib.rs`.**

```rust
#[tauri::command]
async fn ocr_imagen(request: tauri::ipc::Request<'_>) -> Result<ocr::OcrResultado, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Se esperaba la imagen en bytes".into());
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || ocr::reconocer(&bytes))
        .await
        .map_err(|e| e.to_string())?
}
```

Registrarlo en `tauri::generate_handler![...]`.

- [ ] **Step 5: Herramienta `src-tauri/examples/ocr.rs`.** `fn main()` lee la ruta de `std::env::args().nth(1)` (si falta, mensaje de uso y código de salida 2), llama a `control_pagos_lib::ocr::reconocer` e imprime `serde_json::to_string_pretty(&resultado)` en stdout. Los errores van a stderr con código de salida 1.

- [ ] **Step 6: Verificar.**

Run: `cd src-tauri; cargo test --lib`. Expected: PASS, incluidas las pruebas de respaldo existentes.

Run: `cd src-tauri; cargo run --example ocr -- "C:\Users\Alejandro\Downloads\tasas.jpeg"`. Expected: JSON con alguna línea cuyo texto contenga `880,12` y otra con `TASA`.

- [ ] **Step 7: Commit** `feat: comando OCR de Windows y herramienta de captura de texto`.

---

### Task 2: Fixtures de OCR de los ejemplos

**Files:**
- Create: `src/extraction/formatos/__fixtures__/bdv-oscuro.json`, `bdv-claro.json`, `bdv-recortada.json`, `tasa-mariandres.json`

**Interfaces:**
- Consumes: la herramienta de la Task 1.
- Produces: cuatro JSON con la forma de `OcrResultado` (camelCase), que usan las Tasks 5 y 6.

- [ ] **Step 1: Generar.** Desde `src-tauri`, con salida redirigida a cada archivo (en PowerShell, `| Out-File -Encoding utf8NoBOM` o equivalente, sin BOM y con LF):

| Fixture | Imagen en `C:\Users\Alejandro\Downloads\` |
|---|---|
| `bdv-oscuro.json` | `WhatsApp Image 2026-10-18 at 2.05.25 PM.jpeg` |
| `bdv-claro.json` | `WhatsApp Image 2026-10-18 at 2.05.27 PM.jpeg` |
| `bdv-recortada.json` | `WhatsApp Image 2026-10-18 at 2.04.35 PM.jpeg` |
| `tasa-mariandres.json` | `tasas.jpeg` |

- [ ] **Step 2: Anonimizar** en `texto` de líneas y palabras: "Mariangel" → "Ana", "Caña" → "Pérez", "Daniela" → "Luisa", "pagokhendy" → "pagoluis". No tocar "M A Colecciones 2006 Ca", "MariaAndres", "INV MARIANDRES", ni números.

- [ ] **Step 3: Revisar** que en cada JSON de BDV aparezcan el monto, "Operación"/"Operacion", la referencia y "Nombre", y anotar cómo los leyó el OCR (si la etiqueta y el valor salen en la misma línea o separados, si el ícono de copiar agregó caracteres). Si en el modo oscuro faltan datos clave, intentar preprocesar en `ocr.rs`: invertir colores y reintentar cuando la imagen es mayormente oscura. Registrar esa decisión en el mensaje del commit. Los valores esperados están en la Task 5.

- [ ] **Step 4: Commit** `test: textos OCR de los comprobantes de ejemplo`.

---

### Task 3: Tipos del OCR, filas visuales y `claveComparacion` en el dominio

**Files:**
- Create: `src/domain/texto.ts`, `src/domain/texto.test.ts`
- Modify: `src/db/repos/depositos.ts` (quitar la definición y reexportar desde `@/domain/texto`, para no cambiar los imports existentes)
- Create: `src/extraction/ocr/types.ts`
- Create: `src/extraction/filas.ts`, `src/extraction/filas.test.ts`

**Interfaces:**
- Produces:
  - `claveComparacion(s: string): string` en `src/domain/texto.ts`, con la misma implementación de hoy.
  - En `ocr/types.ts`: `Caja`, `OcrPalabra`, `OcrLinea`, `OcrResultado` (los de §4.1 del spec) y `interface OcrEngine { reconocer(imagen: Blob): Promise<OcrResultado> }`.
  - En `filas.ts`:
    - `type Fila = { texto: string; lineas: OcrLinea[]; caja: Caja }`
    - `agruparFilas(r: OcrResultado): Fila[]`
    - `contiene(filas: Fila[], texto: string): boolean`
    - `valorDeEtiqueta(filas: Fila[], etiqueta: string): string | null`

- [ ] **Step 1: Pruebas que fallan** (`filas.test.ts`, con un helper local `linea(texto, x, y, w = 100, h = 20)` que arma una `OcrLinea` de una sola palabra por token):
  - `"une etiqueta y valor que están a la misma altura"`: líneas `"Fecha:"` (x=10, y=100) y `"15/10/2026"` (x=300, y=102) → una fila con texto `"Fecha: 15/10/2026"`.
  - `"ordena filas de arriba abajo y cada fila de izquierda a derecha"`: entrada desordenada → textos en orden.
  - `"no une líneas que se solapan menos de la mitad de la altura menor"`: y=100 y y=115 con h=20 → dos filas.
  - `"valorDeEtiqueta ignora acentos, mayúsculas y los dos puntos"`: fila `"OPERACION: 059132331406"` → `valorDeEtiqueta(f, "Operación")` = `"059132331406"`. También funciona con `"Operación : 059132331406"` y con `"Operación:059132331406"` como una sola palabra.
  - `"valorDeEtiqueta devuelve null si no hay fila o si no hay valor"`.
  - `"contiene busca sin acentos ni espacios"`: `contiene(f, "Transferencias a terceros")` es verdadero para la fila `"Transferencias a terceros BDV"`.
  - `texto.test.ts`: `claveComparacion(" Árbol  Grande ")` = `"arbolgrande"`.

Run: `pnpm test src/extraction/filas src/domain/texto`. Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: Implementar.**
  - `agruparFilas`: ordenar las líneas por centro vertical. Una línea se une a la fila actual si su solapamiento vertical con la caja de la fila es ≥ 50 % de la altura menor; si no, abre otra fila. El texto de la fila son sus líneas ordenadas por `x`, unidas con un espacio, y la caja es la unión.
  - `valorDeEtiqueta`: para cada fila, partir el texto en palabras. Separar primero un `:` pegado a la siguiente palabra (`"Operación:0591…"` → `"Operación:"`, `"0591…"`). Sea `n` = cantidad de palabras de la etiqueta. Si `claveComparacion` de las primeras `n` palabras, sin `:` finales, es igual a `claveComparacion(etiqueta)`, devolver el resto sin un `:` inicial y recortado. Si el resto queda vacío, seguir buscando y al final devolver `null`.

- [ ] **Step 3: Verificar.** `pnpm test`: PASS (todas, incluidas las de duplicados que usan `claveComparacion`). `pnpm build`: OK.

- [ ] **Step 4: Commit** `feat: filas visuales del OCR y comparación de texto en el dominio`.

---

### Task 4: Tipos de extracción y normalización con confianza

**Files:**
- Create: `src/extraction/tipos.ts`
- Create: `src/extraction/normalizar.ts`, `src/extraction/normalizar.test.ts`

**Interfaces:**
- Produces (`tipos.ts`):

```ts
export type CamposDeposito = "fecha" | "banco" | "referencia" | "cuentaDestino" | "montoBs";
export type CamposTasa = "fecha" | "valor";
export type CampoCrudo = { texto: string; certeza: "etiqueta" | "heuristica" | "constante" };
export type CampoPropuesto = { value: string; confidence: number };
export type ExtractionResult<F extends string> = { formato: string | null; fields: Partial<Record<F, CampoPropuesto>> };
export interface Reconocedor<F extends string> {
  id: string;
  detecta(filas: Fila[]): boolean;
  extrae(filas: Fila[]): Partial<Record<F, CampoCrudo>>;
}
```

- Produces (`normalizar.ts`):
  - `fechaDesdeDmy(texto: string): string | null`
  - `normalizarDeposito(crudos: Partial<Record<CamposDeposito, CampoCrudo>>, hoy: string): Partial<Record<CamposDeposito, CampoPropuesto>>`
  - `normalizarTasa(crudos: Partial<Record<CamposTasa, CampoCrudo>>, hoy: string): Partial<Record<CamposTasa, CampoPropuesto>>`

- [ ] **Step 1: Pruebas que fallan** (`normalizar.test.ts`):
  - `fechaDesdeDmy`: `"15/10/2026"` → `"2026-10-15"`; `"16 / 10 / 2026"` → `"2026-10-16"`; `"5/3/2026"` → `"2026-03-05"`; `"31/02/2026"` → `null`; `"hola"` → `null`; `"Fecha 15/10/2026 x"` → `"2026-10-15"` (busca el patrón dentro del texto).
  - `normalizarDeposito({ montoBs: {texto:"13.186,80 Bs", certeza:"etiqueta"}, fecha: {texto:"15/10/2026", certeza:"etiqueta"}, referencia: {texto:"059132331406", certeza:"etiqueta"}, banco: {texto:"Banco de Venezuela", certeza:"constante"}, cuentaDestino: {texto:" M A Colecciones 2006 Ca ", certeza:"etiqueta"} }, "2026-10-18")` → `{ montoBs: {value:"13.186,80", confidence:0.9}, fecha: {value:"2026-10-15", confidence:0.9}, referencia: {value:"059132331406", confidence:0.9}, banco: {value:"Banco de Venezuela", confidence:0.95}, cuentaDestino: {value:"M A Colecciones 2006 Ca", confidence:0.9} }`.
  - Heurística: `montoBs` con certeza `"heuristica"` → confianza 0,7.
  - Fecha futura (`"20/10/2026"` con hoy `"2026-10-18"`) → confianza 0,6.
  - No se propone: monto `"13.18x,80"`, monto `"0,00"`, referencia `"05913A"`, cuentaDestino `"  "`, fecha `"31/02/2026"`. Cada uno queda ausente del resultado y los demás campos siguen presentes.
  - `normalizarTasa({ valor: {texto:"880,12", certeza:"etiqueta"}, fecha: {texto:"16 / 10 / 2026", certeza:"etiqueta"} }, "2026-10-18")` → `{ valor: {value:"880,12", confidence:0.9}, fecha: {value:"2026-10-16", confidence:0.9} }`; `valor` `"880.12"` → `"880,12"` (porque usa `parseTasa`).

Run: `pnpm test src/extraction/normalizar`. Expected: FAIL.

- [ ] **Step 2: Implementar.** Montos: `parseMonto`, `> 0` y `toInputVE`. Tasa: `parseTasa`, `> 0` y `toInputVE`. Fecha: regex `(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})`, armar ISO y validar con `isValidIsoDate`; si es mayor que `hoy`, `min(conf, 0.6)`. Referencia: `^\d+$` después de recortar. Texto libre: recortado y no vacío. Base de confianza por certeza: etiqueta 0,9, heurística 0,7, constante 0,95.

- [ ] **Step 3: Verificar.** `pnpm test`: PASS.

- [ ] **Step 4: Commit** `feat: normalización y confianza de campos leídos por OCR`.

---

### Task 5: Reconocedores BDV y tasa, y su registro

**Files:**
- Create: `src/extraction/formatos/bdvTransferenciaTerceros.ts`
- Create: `src/extraction/formatos/tasaMariandres.ts`
- Create: `src/extraction/formatos/index.ts`
- Create: `src/extraction/formatos/formatos.test.ts`

**Interfaces:**
- Consumes: `Fila`, `contiene` y `valorDeEtiqueta` (Task 3); `Reconocedor`, `CampoCrudo` y los tipos de campos (Task 4); los fixtures (Task 2).
- Produces:
  - `bdvTransferenciaTerceros: Reconocedor<CamposDeposito>` (id `"bdv-transferencia-terceros"`)
  - `tasaMariandres: Reconocedor<CamposTasa>` (id `"tasa-mariandres"`)
  - `reconocedoresDeposito: Reconocedor<CamposDeposito>[]`, `reconocedoresTasa: Reconocedor<CamposTasa>[]`

- [ ] **Step 1: Pruebas que fallan.** Cargar cada fixture con `import x from "./__fixtures__/bdv-oscuro.json"`, pasarlo por `agruparFilas` y luego por `normalizarDeposito` / `normalizarTasa` con hoy `"2026-10-18"`. Comparar los `value`:

| Fixture | Esperado |
|---|---|
| bdv-oscuro | montoBs `13.186,80`, fecha `2026-10-15`, referencia `059132331406`, banco `Banco de Venezuela`, cuentaDestino `M A Colecciones 2006 Ca` |
| bdv-claro | montoBs `17.200,00`, fecha `2026-10-15`, referencia `059132356290`, mismo banco y cuenta |
| bdv-recortada | montoBs `22.880,00`, fecha `2026-10-15`, referencia `059132357798`, mismo banco y cuenta |
| tasa-mariandres | valor `880,12`, fecha `2026-10-16` |

  Además:
  - `"cada reconocedor detecta solo sus fixtures"`: BDV detecta los tres BDV y no la tasa; la tasa detecta solo la suya.
  - `"no detecta una captura cualquiera"`: filas `["Hola", "Pago listo 15$"]` → ambos `false`.
  - `"el monto sale de la fila con Bs, no de un número con $"`: filas sintéticas de BDV con una fila extra `"Ana Pérez 15$"` → montoBs `"13.186,80"`.
  - `"referencia con el ícono de copiar leído como carácter"`: fila `"Operación: 059132331406 D"` → referencia `"059132331406"` con certeza `"etiqueta"`; fila `"Operación: 0591323314060"` (13 dígitos) → texto `"0591323314060"` con certeza `"heuristica"`.
  - Si alguno de los fixtures reales no da el valor esperado, la solución va en el reconocedor (o en el preprocesado de la Task 2), no en la prueba.

Run: `pnpm test src/extraction/formatos`. Expected: FAIL.

- [ ] **Step 2: Implementar.**
  - **BDV**
    - `detecta`: `contiene(filas, "Transferencias a terceros")` y al menos 2 de las etiquetas "Operación", "Origen", "Destino" y "Nombre" con `valorDeEtiqueta` no nulo.
    - `extrae`:
      - montoBs: la primera fila cuyo texto coincide con `/([\d.,]+)\s*Bs\.?\s*$/i`, con certeza etiqueta. Si no hay, la primera fila de solo un número con coma decimal, con certeza heurística.
      - fecha, cuentaDestino: `valorDeEtiqueta` de "Fecha" y "Nombre", con certeza etiqueta.
      - referencia: la primera corrida de ≥ 6 dígitos en el valor de "Operación". Si mide 12 dígitos, certeza etiqueta; si no, heurística.
      - banco: `"Banco de Venezuela"`, con certeza constante.
  - **Tasa**
    - `detecta`: `contiene(filas, "Tasa del día")` y una fila que coincide con `/bs\.?\s*[\d.,]+/i`.
    - `extrae`: valor = el número después de "bs." con certeza etiqueta; fecha = la primera fila en la que `fechaDesdeDmy` no da null, con certeza etiqueta, pasando el texto crudo de esa fila.
  - **Registro** (`index.ts`): `reconocedoresDeposito = [bdvTransferenciaTerceros]`, `reconocedoresTasa = [tasaMariandres]`.

- [ ] **Step 3: Verificar.** `pnpm test`: PASS. `pnpm build`: OK (si `tsc` se queja de los JSON, habilitar `resolveJsonModule` en `tsconfig.json`).

- [ ] **Step 4: Commit** `feat: reconocedores de transferencia BDV y tasa del día`.

---

### Task 6: Extractor y motor de Windows en TS

**Files:**
- Modify: `src/extraction/extractor.ts`, `src/extraction/extractor.test.ts`
- Create: `src/extraction/ocr/windowsOcr.ts`, `src/extraction/ocr/windowsOcr.test.ts`
- Modify: `src/features/deposito/DepositoPage.tsx` (solo lo necesario para compilar: `extractor.extraerDeposito(v.file)` y los nombres de tipos nuevos; la lógica de autollenado llega en la Task 8)

**Interfaces:**
- Consumes: `OcrEngine` (Task 3); los registros (Task 5); `normalizarDeposito` / `normalizarTasa` (Task 4).
- Produces:
  - `interface Extractor { extraerDeposito(imagen: Blob): Promise<ExtractionResult<CamposDeposito>>; extraerTasa(imagen: Blob): Promise<ExtractionResult<CamposTasa>> }`
  - `nullExtractor: Extractor`, que devuelve `{ formato: null, fields: {} }`
  - `crearExtractor(engine: OcrEngine, hoy?: () => string): Extractor`, con `todayIso` por defecto
  - `extractor: Extractor = crearExtractor(windowsOcr)`
  - `windowsOcr: OcrEngine`
  - Se eliminan `ExtractableField`, `ExtractedField` y el `ExtractionResult` viejo. Se reexportan los tipos de `tipos.ts` desde `extractor.ts` por comodidad.

- [ ] **Step 1: Pruebas que fallan.**
  - `extractor.test.ts`, con un engine falso que devuelve un fixture:
    - `extraerDeposito` con `bdv-oscuro` → `formato: "bdv-transferencia-terceros"` y `fields.referencia.value === "059132331406"`.
    - `extraerTasa` con `bdv-oscuro` → `{ formato: null, fields: {} }`.
    - `extraerDeposito` con `tasa-mariandres` → `{ formato: null, fields: {} }`.
    - Si el engine lanza `new Error("x")`, la promesa se rechaza con ese error.
    - `nullExtractor.extraerDeposito(blob)` → `{ formato: null, fields: {} }`.
  - `windowsOcr.test.ts`, simulando `@tauri-apps/api/core` como en las pruebas de `src/platform/`: `windowsOcr.reconocer(new Blob([new Uint8Array([1,2,3])]))` llama `invoke("ocr_imagen", Uint8Array [1,2,3])` y devuelve lo que resuelve `invoke`.

Run: `pnpm test src/extraction`. Expected: FAIL.

- [ ] **Step 2: Implementar.** `crearExtractor`: `agruparFilas(await engine.reconocer(img))`; el primer reconocedor del registro cuyo `detecta` sea verdadero; normalizar con `hoy()`. Si ninguno coincide, `{ formato: null, fields: {} }`. `windowsOcr`: `invoke<OcrResultado>("ocr_imagen", new Uint8Array(await imagen.arrayBuffer()))`.

- [ ] **Step 3: Verificar.** `pnpm test`: PASS. `pnpm build`: OK.

- [ ] **Step 4: Commit** `feat: extractor con OCR de Windows y registro de formatos`.

---

### Task 7: Lógica de autollenado de tres estados

**Files:**
- Create: `src/extraction/autollenado.ts`, `src/extraction/autollenado.test.ts`

**Interfaces:**
- Consumes: `CampoPropuesto` (Task 4).
- Produces:

```ts
export type EstadoCampo = "ocr" | "tocado"; // ausente = sin tocar
export type Autollenado<F extends string> = {
  estado: Partial<Record<F, EstadoCampo>>;
  confianza: Partial<Record<F, number>>;
};
export function autollenadoNuevo<F extends string>(): Autollenado<F>;
export function autollenadoExistente<F extends string>(valores: Record<F, string>): Autollenado<F>; // "tocado" donde el valor no está vacío
export function marcarTocado<F extends string>(a: Autollenado<F>, campo: F): Autollenado<F>; // estado "tocado" y sin confianza
export function aplicarExtraccion<F extends string>(
  valores: Record<F, string>,
  a: Autollenado<F>,
  propuestos: Partial<Record<F, CampoPropuesto>>,
  defaults: Record<F, string>,
): { valores: Record<F, string>; auto: Autollenado<F> };
```

`aplicarExtraccion` hace dos pasos. Primero, cada campo en estado `"ocr"` vuelve a `defaults[f]`, sin estado ni confianza. Después, cada campo propuesto cuyo estado no sea `"tocado"` toma `value`, queda en estado `"ocr"` con su `confidence`. Para limpiar al quitar la imagen se llama con `propuestos = {}`. Todas las funciones son puras y devuelven objetos nuevos.

- [ ] **Step 1: Pruebas que fallan** (con `F = "fecha" | "monto"`):
  - `"llena la fecha por defecto porque cuenta como sin tocar"`: valores `{fecha:"2026-10-18", monto:""}` y propuesta fecha `"2026-10-15"` → fecha `"2026-10-15"`, estado `"ocr"`, confianza 0,9.
  - `"no pisa un campo tocado"`: tras `marcarTocado(a, "monto")` con valor `"5"`, la propuesta de monto se ignora.
  - `"en un registro existente solo llena los vacíos"`: `autollenadoExistente({fecha:"2026-10-01", monto:""})` → solo se llena el monto.
  - `"reemplazar la imagen limpia lo que puso el OCR y no trae la nueva"`: primero se aplica una propuesta con fecha y monto; después una con solo fecha → monto vuelve a `defaults.monto` (`""`) sin confianza, y la fecha toma el nuevo valor.
  - `"quitar la imagen restaura los defaults de los campos OCR"`: con `propuestos = {}`, la fecha vuelve a `defaults.fecha`.
  - `"marcarTocado quita la confianza"`.

Run: `pnpm test src/extraction/autollenado`. Expected: FAIL.

- [ ] **Step 2: Implementar.**

- [ ] **Step 3: Verificar.** `pnpm test`: PASS.

- [ ] **Step 4: Commit** `feat: lógica de autollenado (sin tocar / OCR / tocado)`.

---

### Task 8: Integración en el formulario de depósito

**Files:**
- Create: `src/lib/confianza.ts`
- Modify: `src/features/deposito/DepositoPage.tsx`

**Interfaces:**
- Consumes: `extractor.extraerDeposito` (Task 6); `autollenadoNuevo`, `autollenadoExistente`, `marcarTocado` y `aplicarExtraccion` (Task 7).
- Produces: `confClass(c: number | undefined): string` en `src/lib/confianza.ts`, movida tal cual desde `DepositoPage.tsx:82`, para que la use la Task 9.

- [ ] **Step 1: Estado unido.** Reemplazar los `useState` de `draft` y `confianza` por uno solo, `form: { draft: DepositoDraft; auto: Autollenado<CamposDeposito> }`. Exponer `const draft = form.draft` y una función `setDraft(next: DepositoDraft | ((d: DepositoDraft) => DepositoDraft))` que actualice solo `form.draft`, para que los efectos existentes (tasa, duplicados) no cambien. Estado inicial de `auto`: `autollenadoExistente(campos del depósito)` si se edita un depósito, o `autollenadoNuevo()` si es nuevo. `set(k, v)` también aplica `marcarTocado` cuando `k` es un `CamposDeposito`. Las clases de color usan `form.auto.confianza[k]` con `confClass` importada de `@/lib/confianza`.

- [ ] **Step 2: `onImagen`.**
  - Guardar la imagen vigente en un `useRef` (`imagenVigente.current = v?.kind === "new" ? v.file : null`).
  - Si `v` es null o `"stored"`: `setForm(f => aplicarExtraccion(f.draft, f.auto, {}, defaults))` (mapeando `valores` a `draft`) y salir. Los `defaults` salen de `vacio(fechaInicial)`, donde `fechaInicial` es una ref con la fecha con que arrancó el formulario: hoy, o la que arrastró "Guardar y nuevo".
  - Si es nueva: `setLeyendo(true)`, `await extractor.extraerDeposito(v.file)`. Si `imagenVigente.current !== v.file`, descartar el resultado. Si no, aplicar con `setForm(f => …aplicarExtraccion(f.draft, f.auto, r.fields, defaults))`, que actúa sobre el estado **actual**. Si `r.formato === null`: `toast.info("No se reconoció el formato del comprobante; completa los datos a mano")`. En `catch`: `reportError(e, "Lectura del comprobante")`. En `finally`, si la imagen sigue vigente: `setLeyendo(false)`.
  - `aplicarExtraccion` trabaja sobre los cinco campos de `CamposDeposito`. Al aplicarlo, se toman esos campos del draft y se vuelven a combinar con el resto (`tasaId`, `observaciones`).
  - Al cambiar la imagen, el `set` existente no se usa, así que el OCR no marca campos como tocados.

- [ ] **Step 3: Indicador.** Mientras `leyendo`, mostrar `"Leyendo comprobante…"` (texto pequeño, `text-muted-foreground`) en la columna del formulario, arriba de los campos.

- [ ] **Step 4: "Guardar y nuevo".** Además de lo que ya hace, `auto` vuelve a `autollenadoNuevo()`, `fechaInicial` pasa a ser la fecha arrastrada e `imagenVigente.current = null`. Se quitan `setConfianza({})` y la función `applyExtraction` vieja.

- [ ] **Step 5: Verificar.** `pnpm test`: PASS. `pnpm build`: OK. A mano con `pnpm tauri dev`:
  - Soltar `bdv-oscuro` en un depósito nuevo llena los 5 campos en verde y la tasa del 15/10/2026 se busca sola.
  - Escribir el monto antes de soltar la imagen: el monto no se pisa.
  - Reemplazar con `tasas.jpeg`: se vacían los campos y sale el toast informativo.
  - "Guardar y nuevo" y luego otra captura: la fecha se toma de la nueva captura.
  - Editar un depósito existente y cambiar su imagen: solo se llenan campos vacíos.

- [ ] **Step 6: Commit** `feat: autollenado del depósito desde el comprobante`.

---

### Task 9: Integración en el diálogo de tasa

**Files:**
- Modify: `src/features/tasas/TasaFormDialog.tsx`

**Interfaces:**
- Consumes: `extractor.extraerTasa` (Task 6); las funciones de autollenado (Task 7); `confClass` (Task 8); `formatFecha`.

- [ ] **Step 1: Estado.** Igual que en la Task 8: `form: { draft: TasaDraft; auto: Autollenado<CamposTasa> }`, reiniciado en el `useEffect` de apertura.
  - Con `tasa` existente o con `fechaFija`, la fecha arranca en `"tocado"`; con `tasa` existente, el valor arranca en `"tocado"` si no está vacío (`autollenadoExistente`).
  - Los `onChange` de fecha y valor marcan el campo como tocado.
  - Los inputs de fecha y valor usan `confClass`.

- [ ] **Step 2: `onImagen`** en lugar de `setImagen` en `ImageDrop`, con el mismo patrón de imagen vigente y descarte que la Task 8.
  - Usar `extraerTasa` y `defaults = { fecha: fecha inicial del diálogo, valor: "" }`.
  - Guardar `fechaImagen = r.fields.fecha?.value ?? null` en estado. Si la fecha está en `"tocado"` y `fechaImagen` es distinta de `draft.fecha`, mostrar `<Aviso tono="warning">La imagen es del {formatFecha(fechaImagen)}.</Aviso>`. Al quitar la imagen, `fechaImagen` vuelve a null.
  - Si `r.formato === null`: `toast.info("No se reconoció el formato de la imagen de tasa; completa los datos a mano")`. Errores: `reportError(e, "Lectura de la tasa")`.
  - Mientras se lee, mostrar `"Leyendo imagen…"` bajo el `ImageDrop`.

- [ ] **Step 3: Verificar.** `pnpm build`: OK. A mano:
  - Desde Tasas, "Registrar tasa" y soltar `tasas.jpeg`: fecha 16/10/2026 y valor 880,12 en verde.
  - Desde el formulario de depósito con fecha 15/10/2026 (fecha fija), soltar `tasas.jpeg`: el valor se llena, la fecha no cambia y aparece "La imagen es del 16/10/2026".

- [ ] **Step 4: Commit** `feat: autollenado de la tasa desde la imagen`.

---

### Task 10: Documentación

**Files:**
- Modify: `CLAUDE.md`, `docs/checklist-mvp.md`

- [ ] **Step 1: CLAUDE.md.**
  - En **Fases**, la fase 2 queda en curso: OCR con Windows en `src/extraction/`.
  - En **Arquitectura**, agregar una línea para `src/extraction/`: motor (`ocr/`), `filas.ts`, `formatos/` (registro en `formatos/index.ts`), `normalizar.ts` y `autollenado.ts`. Agregar también `src-tauri/src/ocr.rs` y el comando `ocr_imagen`.
  - En **Comandos**: `cd src-tauri; cargo run --example ocr -- <imagen>` imprime el JSON de OCR de una imagen.
  - Nueva sección **Agregar un formato de comprobante** con los 4 pasos del §8 del spec, con rutas reales.
  - En **Trampas conocidas**: Windows OCR no da confianza (se calcula en `normalizar.ts`), y hace falta el idioma español con OCR instalado en Windows.
  - En **Pendientes conocidos**:
    - Duplicados contra importaciones de Excel: ceros iniciales en la referencia y alias del banco ("BDV").
    - Quitar "`applyExtraction` usa el `draft` previo al `await`", que ya está resuelto.

- [ ] **Step 2: Checklist.** Agregar la sección "OCR de comprobantes y tasas" con los casos manuales de los Steps 5 de la Task 8 y 3 de la Task 9, más un caso para el error claro cuando falta el idioma (se puede verificar leyendo el mensaje en `ocr.rs` si no es posible desinstalar el idioma).

- [ ] **Step 3: Verificar** que `pnpm test`, `pnpm build` y `cd src-tauri; cargo test --lib` pasan, y que `pnpm tauri build` genera el `.msi`.

- [ ] **Step 4: Commit** `docs: OCR de comprobantes en CLAUDE.md y checklist`.
