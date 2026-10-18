# Fase 2 — OCR de comprobantes y tasas

Fecha: 18/10/2026. Continúa el diseño del MVP (`2026-10-18-control-pagos-design.md`, §7 "Punto de extensión para el OCR").

## 1. Intención

Hoy la persona de gerencia recibe por WhatsApp capturas de los comprobantes de los gerentes y copia a mano cinco datos de cada una: monto, referencia, fecha, banco y el nombre de la cuenta destino. También copia a mano la tasa del día desde una imagen que publica la empresa. Queremos que, al soltar la imagen en el formulario, esos campos se llenen solos. Ella revisa y guarda como siempre.

El usuario pidió explícitamente que la solución **escale**: hoy se soporta un solo formato de comprobante y uno de tasa, pero vendrán otros bancos (Banesco, pago móvil, etc.). Agregar un formato tiene que ser agregar un archivo con su prueba, sin tocar el resto. También tiene que poder cambiarse el motor de OCR más adelante (RapidOCR, OCR en línea en la fase 3) sin tocar los reconocedores ni la UI.

## 2. Objetivos, no-objetivos, anti-objetivos

**Objetivos**
- Formulario de depósito: al adjuntar una captura de "Transferencias a terceros" del Banco de Venezuela, llenar `montoBs`, `fecha`, `referencia`, `banco` y `cuentaDestino`.
- Diálogo de tasa: al adjuntar la imagen "TASA DEL DÍA" de INV Mariandres, llenar `fecha` y `valor`.
- Arquitectura en tres piezas independientes: motor de OCR, reconocedores por formato y normalización compartida (§4).
- Reconocedores probados con `pnpm test` a partir de textos de OCR guardados, sin ejecutar el OCR.
- Un procedimiento documentado para agregar un formato nuevo (§8).

**No-objetivos (por ahora)**
- Otros bancos y el pago móvil. Se agregan después como reconocedores nuevos.
- Fotos de vouchers en papel o de pantallas fotografiadas con otra cámara.
- OCR en línea o multiusuario.
- Guardar el texto OCR en la BD.

**Anti-objetivos (sería un fracaso aunque "funcione")**
- Que el OCR **pise** algo que la usuaria ya escribió.
- Que un valor dudoso se presente como seguro. Si no se pudo leer bien, el campo queda vacío o marcado para revisar.
- Que el OCR guarde algo sin que ella confirme. Solo propone valores; guardar sigue siendo manual.
- Que la app deje de funcionar sin el OCR. Si falla el motor, el formulario queda igual que en el MVP.
- Que un formato nuevo obligue a tocar el motor, la UI u otros reconocedores.

## 3. Ejemplos reales

Hay cuatro imágenes de ejemplo que entregó el usuario (en `C:\Users\Alejandro\Downloads\`, **no** se suben al repositorio):

| Archivo | Formato | Particularidades |
|---|---|---|
| `WhatsApp Image 2026-10-18 at 2.05.25 PM.jpeg` | BDV transferencia, modo oscuro | Captura completa del teléfono; etiqueta superpuesta "Mariangel Caña 15$" |
| `WhatsApp Image 2026-10-18 at 2.05.27 PM.jpeg` | BDV transferencia, modo claro | Captura de una captura dentro de WhatsApp, algo borrosa; barra "Responde a Daniela" abajo |
| `WhatsApp Image 2026-10-18 at 2.04.35 PM.jpeg` | BDV transferencia, modo oscuro | Recortada; título "Transferencias a terceros **BDV**" |
| `tasas.jpeg` | Tasa del día INV Mariandres | Fondo verde, recuadro blanco, "VIERNES / 16 / 10 / 2026 / bs. 880,12" |

**Comprobante BDV**, de arriba abajo: logo, "Transferencias a terceros" (a veces seguido de " BDV"), un check, una caja con el monto ("13.186,80 Bs") y luego filas etiqueta/valor alineadas a izquierda/derecha:

```
Fecha:      15/10/2026
Operación:  059132331406   [ícono copiar]
Nombre:     M A Colecciones 2006 Ca
Origen:     0102****1250
Destino:    0102****8546
Concepto:   MariaAndres
```

Correspondencia con el formulario (la decidió el usuario):

| Campo | De dónde sale | Ejemplo |
|---|---|---|
| `montoBs` | caja del monto, número antes de "Bs" | `13.186,80` |
| `fecha` | "Fecha:" (dd/mm/aaaa → `YYYY-MM-DD`) | `2026-10-15` |
| `referencia` | "Operación:", tal cual, **con ceros a la izquierda** | `059132331406` |
| `banco` | constante del formato | `Banco de Venezuela` (mismo texto que en `BANCOS_SUGERIDOS`) |
| `cuentaDestino` | "Nombre:", **tal cual sale, aunque venga cortado** | `M A Colecciones 2006 Ca` |

"Origen", "Destino" y "Concepto" no se usan.

**Tasa del día**: el valor sale después de "bs." y la fecha en tres números separados por barras, a veces con espacios ("16 / 10 / 2026"). El día de la semana no se usa.

## 4. Arquitectura

```
imagen (Blob) ──► Motor OCR ──► OcrResultado { lineas[] con texto y caja }
                                   │
                                   ▼
                     agruparFilas() (compartido)
                                   │
                                   ▼
       registro de reconocedores del tipo pedido (deposito | tasa)
          cada uno: detecta(filas) → bool ; extrae(filas) → campos crudos
                                   │
                                   ▼
             normalización compartida (parseMonto, parseTasa, fechas)
                                   │
                                   ▼
                      ExtractionResult { campo: {value, confidence} }
```

### 4.1 Motor de OCR (`src/extraction/ocr/`)

Interfaz en TS, sin referencias a Windows:

```ts
type Caja = { x: number; y: number; w: number; h: number }; // píxeles de la imagen
type OcrPalabra = { texto: string; caja: Caja };
type OcrLinea = { texto: string; palabras: OcrPalabra[]; caja: Caja };
type OcrResultado = { lineas: OcrLinea[]; ancho: number; alto: number };

interface OcrEngine {
  reconocer(imagen: Blob): Promise<OcrResultado>;
}
```

Implementación actual, `windowsOcr.ts`: invoca un comando Tauri nuevo (`ocr_imagen`) que recibe los bytes de la imagen y devuelve `OcrResultado` en JSON.

En Rust (`src-tauri/src/ocr.rs`, registrado en `lib.rs`):
- Usar `Windows.Media.Ocr` mediante el crate `windows` (features mínimas: `Media_Ocr`, `Graphics_Imaging`, `Storage_Streams`, `Foundation`, `Foundation_Collections`), todo bajo `#[cfg(windows)]`. En otras plataformas el comando devuelve un error.
- Decodificar los bytes con `BitmapDecoder` desde un `InMemoryRandomAccessStream`, sin escribir archivos temporales, y obtener un `SoftwareBitmap`.
- Idioma: probar primero español (`es`, luego `es-ES`/`es-VE` si hace falta). Si no hay, usar `TryCreateFromUserProfileLanguages`. Si no hay ningún motor disponible, devolver un error en español que diga que hay que instalar el paquete de idioma español con reconocimiento de texto en Configuración de Windows.
- Si la imagen supera `OcrEngine::MaxImageDimension`, reducirla antes de reconocer.
- Windows OCR **no devuelve confianza por palabra**. Por eso la confianza se calcula en la capa de reconocedores (§4.4).

Cambiar de motor en el futuro significa escribir otra implementación de `OcrEngine` y elegirla en un único lugar (`src/extraction/index.ts` o equivalente).

### 4.2 Filas visuales (compartido)

En estas pantallas la etiqueta está a la izquierda y el valor a la derecha, y el motor puede devolverlos como líneas separadas. `agruparFilas(resultado)` une en una sola fila las líneas que se solapan verticalmente (por su caja), ordena las filas de arriba abajo y el contenido de cada fila de izquierda a derecha. El resultado es una lista de filas con su texto unido por espacios y sus cajas. Es lógica pura y lleva pruebas propias.

### 4.3 Reconocedores (`src/extraction/formatos/`)

Un archivo por formato:

```ts
interface Reconocedor<F extends string> {
  id: string;                         // "bdv-transferencia-terceros", "tasa-mariandres"
  tipo: "deposito" | "tasa";
  detecta(filas: Fila[]): boolean;    // ¿esta imagen es de este formato?
  extrae(filas: Fila[]): Partial<Record<F, CampoCrudo>>;
}
type CampoCrudo = { texto: string; certeza: "etiqueta" | "heuristica" };
```

- El registro (`formatos/index.ts`) es una lista por tipo. Se usa el **primer** reconocedor cuyo `detecta` dé verdadero. Agregar un formato = agregar un archivo y una línea al registro.
- Toda comparación de texto (etiquetas, títulos) pasa por `claveComparacion` (sin mayúsculas, acentos ni espacios), porque el OCR puede devolver "Operacion" u "OPERACIÓN".
- Los reconocedores ubican los datos **por etiqueta, nunca por posición fija**. Las barras del teléfono, la barra de WhatsApp, los recortes y las etiquetas superpuestas no deben afectar el resultado.

**`bdv-transferencia-terceros`**
- Detecta: hay una fila con "Transferencias a terceros" y al menos dos de las etiquetas "Operación", "Origen", "Destino", "Nombre".
- Monto: la fila cuyo texto termina en "Bs" (o "Bs."). Se toma el número que la precede. No sirve cualquier número con "$", porque la etiqueta superpuesta "15$" no es el monto.
- Fecha, Operación, Nombre: el texto de la misma fila después de la etiqueta y los dos puntos.
- Referencia: solo dígitos. Se descartan los caracteres sueltos que el OCR pueda leer del ícono de copiar.
- Banco: la constante `"Banco de Venezuela"`.

**`tasa-mariandres`**
- Detecta: hay una fila con "TASA DEL DÍA" y otra con "bs." seguida de un número.
- Valor: el número después de "bs.".
- Fecha: tres grupos de dígitos d/m/aaaa en una fila, tolerando espacios alrededor de las barras.

### 4.4 Normalización y confianza

Los textos crudos pasan por las mismas funciones que la entrada manual:
- `montoBs` con `parseMonto`. Al formulario va el valor en formato de entrada venezolano (`toInputVE`), igual que al editar un depósito.
- `valor` de la tasa con `parseTasa`, y al formulario con `toInputVE`.
- `fecha`: dd/mm/aaaa a `YYYY-MM-DD`, validada con `isValidIsoDate`.
- `referencia`: solo dígitos, no vacía.

Confianza por campo (0..1). El formulario ya pinta ≥0,9 en verde, ≥0,6 en ámbar y menos en rojo:
- Encontrado por etiqueta y pasa la normalización: **0,9**.
- Encontrado por heurística (por ejemplo, el monto sin "Bs" claro) y pasa la normalización: **0,7**.
- No pasa la normalización: **no se propone** (el campo queda vacío).
- Constantes del formato (`banco`): **0,95**.
- Fecha en el futuro: baja a **0,6**, para que se revise.

### 4.5 Extractor (lo que usa la UI)

Se generaliza el `Extractor` existente, sin cambiar el contrato para la UI de depósitos:

```ts
type CamposDeposito = "fecha" | "banco" | "referencia" | "cuentaDestino" | "montoBs";
type CamposTasa = "fecha" | "valor";
type ExtractionResult<F extends string> = {
  formato: string | null;                // id del reconocedor, o null si ninguno coincidió
  fields: Partial<Record<F, { value: string; confidence: number }>>;
};
interface Extractor {
  extraerDeposito(imagen: Blob): Promise<ExtractionResult<CamposDeposito>>;
  extraerTasa(imagen: Blob): Promise<ExtractionResult<CamposTasa>>;
}
```

`nullExtractor` sigue existiendo para pruebas y como respaldo. El extractor activo pasa a ser el que combina `windowsOcr` y el registro.

## 5. Comportamiento en la UI

**Regla general:** el OCR solo llena los campos que la usuaria **no ha tocado** desde que se abrió el formulario. Un valor por defecto (la fecha de hoy) cuenta como no tocado. Hace falta llevar un registro de "tocados" por campo, porque hoy `applyExtraction` solo llena campos vacíos y por eso nunca podría llenar la fecha, que arranca con la de hoy.

Cada campo tiene uno de tres estados: **sin tocar**, **llenado por OCR** o **tocado** (lo editó la usuaria o venía de la BD). Casos concretos:
- **Registro existente** (editar un depósito o una tasa) al que se adjunta una imagen nueva: los valores cargados de la BD cuentan como tocados, así que el OCR solo llena campos vacíos. Si lo que lee la imagen es distinto de lo guardado, no se cambia nada; a lo sumo el campo se marca en ámbar.
- **"Guardar y nuevo"**: el formulario nuevo arranca con todos los campos sin tocar, incluida la fecha que se arrastra del depósito anterior. Así, en una tanda de capturas de WhatsApp cada comprobante pone su propia fecha (y la tasa se vuelve a buscar con el efecto existente).
- **Reemplazar o quitar la imagen** antes de guardar: los campos que estaban "llenados por OCR" (y que la usuaria no editó después) se vacían, o vuelven a su valor por defecto en el caso de la fecha, y luego se aplica la extracción de la nueva imagen, si la hay. Así no quedan en verde datos de otro comprobante.
- Si la usuaria edita un campo llenado por OCR, pasa a tocado y pierde la marca de color, como ya pasa hoy.

**Formulario de depósito** (`DepositoPage.tsx`):
- Al adjuntar una imagen nueva, se lanza la extracción. Mientras tanto se muestra un indicador discreto ("Leyendo comprobante…") junto a la imagen, y la usuaria puede seguir escribiendo.
- Al terminar, los cambios se aplican con una actualización funcional del estado, sobre el `draft` **actual** y no sobre el que había antes del `await`. Esto cierra el pendiente conocido de `applyExtraction`. Si en ese momento la imagen ya no es la misma (se quitó o se reemplazó), el resultado se descarta.
- Al cambiar la fecha, el efecto existente busca la tasa de esa fecha. No hay que hacer nada extra, pero hay que comprobar que funciona cuando la fecha la llena el OCR.
- El aviso de duplicados (banco + referencia) también salta solo con los campos llenados por el OCR.
- Si ningún formato coincide, se muestra un toast informativo ("No se reconoció el formato del comprobante; completa los datos a mano"), no un error. Si el motor falla (por ejemplo, falta el idioma), se usa `reportError` con el mensaje en español, y el formulario sigue utilizable.
- Al editar un depósito existente con imagen guardada, no se ejecuta OCR. Solo se ejecuta con imágenes nuevas, como hoy.

**Diálogo de tasa** (`TasaFormDialog.tsx`):
- Mismo flujo con `extraerTasa`. Los campos se marcan con el mismo código de colores que en el depósito: hay que llevar `confClass` a un lugar compartido.
- La `fecha` se llena solo si el diálogo es para una tasa nueva **sin** `fechaFija` y la usuaria no la ha tocado. Si hay `fechaFija` (o se edita una tasa existente) y la fecha de la imagen es distinta, se muestra un aviso ("La imagen es del dd/mm/aaaa") y no se cambia la fecha.
- Si ya existe una tasa para la fecha leída, el flujo de guardado actual se encarga (una tasa por fecha). No se agrega lógica nueva.

## 6. Pruebas

- **Fixtures de texto OCR** en `src/extraction/formatos/__fixtures__/`, uno por imagen de ejemplo: el JSON `OcrResultado` tal como lo devolvió el motor real. En el repositorio no se guardan las imágenes. Los nombres de personas que aparezcan en el texto (la etiqueta "Mariangel Caña", el "Concepto", "Responde a Daniela") se reemplazan por nombres ficticios. La razón social de la cuenta destino y los números se dejan como están.
- Pruebas por reconocedor (vitest): detecta su formato, no detecta los otros fixtures y extrae exactamente los valores esperados de §3.
- Pruebas de `agruparFilas` y de la normalización/confianza con casos sintéticos: líneas partidas, acentos perdidos, monto ilegible (no se propone), fecha inválida.
- Pruebas del extractor con `OcrEngine` simulado: elige el reconocedor correcto, devuelve `formato: null` si nada coincide y es robusto si el motor lanza error.
- Rust: el comando no se prueba en `cargo test --lib`, porque necesita imágenes y el OCR de Windows. Se verifica con la herramienta de §7 sobre las cuatro imágenes de ejemplo y a mano en la app (agregar los casos a `docs/checklist-mvp.md`).
- La UI sigue sin pruebas automáticas: `pnpm build` y el checklist.

## 7. Herramienta para capturar fixtures

Un ejecutable de desarrollo en Rust (por ejemplo `cargo run --example ocr -- <imagen>`, en `src-tauri/examples/`) que reutiliza la misma función de `ocr.rs` e imprime el `OcrResultado` en JSON. Con ella se generaron los fixtures de §6 y se generarán los de cada formato nuevo. Así la prueba usa exactamente el texto que verá la app.

## 8. Cómo se agrega un formato nuevo (procedimiento a documentar en CLAUDE.md)

1. Conseguir 2 o 3 capturas reales del formato, mejor si hay variantes (modo claro/oscuro, recortada).
2. Generar su JSON con la herramienta de §7, anonimizar los nombres de personas y guardarlo en `__fixtures__/`.
3. Crear `formatos/<id>.ts` con `detecta` y `extrae`, más su prueba, y comprobar que los fixtures existentes no lo activan.
4. Agregarlo al registro.

## 9. Restricciones

- Todo local y sin internet. No se agregan descargas de modelos ni dependencias pesadas en JS.
- Las reglas del dominio no cambian: montos como texto decimal, nada derivado en la BD, la tasa del depósito es la de su fecha, los duplicados son un aviso.
- Mensajes en español. Commits en español con prefijo.
- El instalador `.msi` debe seguir funcionando en Windows 10/11 sin pasos extra cuando el idioma español está instalado.
- Las migraciones de BD no cambian, porque no se guarda nada nuevo.

**Limitación conocida (aceptada por el usuario):** el aviso de duplicados no cambia. Un depósito importado desde Excel con la referencia sin ceros iniciales (`59132331406`), o con el banco escrito distinto ("BDV", "Venezuela"), no se detecta como duplicado del mismo comprobante leído por OCR (`059132331406`, "Banco de Venezuela"). Hay que agregarlo a "Pendientes conocidos" en CLAUDE.md.

## 10. Decisiones tomadas

**Del usuario**
- Alcance inicial: transferencias a terceros BDV y la imagen de tasa de INV Mariandres. Los demás formatos, después.
- `cuentaDestino` = "Nombre" del comprobante, tal cual sale (aunque venga cortado).
- Motor: OCR integrado de Windows por ahora, con una arquitectura que permita cambiarlo y agregar formatos.
- Los duplicados contra importaciones de Excel (ceros iniciales, alias de banco) quedan como limitación conocida (§9).

**Del diseñador (revisables)**
- La confianza se calcula en los reconocedores, porque Windows OCR no la entrega. Los umbrales están en §4.4.
- `banco` es una constante por formato ("Banco de Venezuela").
- El OCR llena los campos no tocados, incluida la fecha por defecto, en lugar de llenar solo los vacíos.
- Las imágenes de ejemplo no van al repositorio; van los textos OCR, con los nombres de personas anonimizados.
- Toast informativo cuando ningún formato coincide.
- En el diálogo de tasa con fecha fija: aviso en vez de cambiar la fecha.
- Tres estados por campo (sin tocar / llenado por OCR / tocado). En registros existentes solo se llenan los vacíos; "Guardar y nuevo" reinicia todo a sin tocar; reemplazar la imagen limpia lo que había puesto el OCR (§5).

## 11. Queda a criterio de quien implemente

- Cómo pasar los bytes al comando Tauri (cuerpo crudo del `invoke` o arreglo de bytes) y la forma exacta del JSON de Rust.
- Preprocesar o no (invertir colores en modo oscuro, ampliar imágenes pequeñas, reintentar una segunda vez si nada coincide), según cómo rinda Windows OCR con los ejemplos.
- El umbral de solapamiento vertical en `agruparFilas`.
- La ubicación exacta de `confClass` compartido y del indicador "Leyendo comprobante…".
