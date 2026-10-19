# Exportación de campañas (PDF + Excel con formato) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar "Exportar PDF" a la campaña (resumen por gerente + una página por gerente, estilo B) y rediseñar el Excel de la campaña con el mismo estilo.

**Architecture:** Un módulo común `src/export/estilo.ts` con colores y decisiones de presentación puras (color de barra, texto de restante). `campanaWorkbook.ts` se reescribe por dentro con disposición fija de filas. `campanaPdf.ts` es una función pura que devuelve la definición de documento de pdfmake; `savePdf.ts` la convierte en bytes (pdfmake cargado con import dinámico) y la guarda con el diálogo de Tauri.

**Tech Stack:** TypeScript, ExcelJS 4 (ya instalado), pdfmake 0.3.x (nuevo) + `@types/pdfmake`, decimal.js, vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-exportacion-campanas-design.md`

## Global Constraints

- Todas las cifras salen de `buildCampanaView` (`CampanaView`); no se recalcula USD, saldos ni %. Sumas de Monto Bs con `Decimal`, nunca `number` hasta el momento de escribir la celda.
- Texto del PDF con los formateadores de `domain/`: `formatUsd`, `formatNumberVE`, `formatTasa`, `formatPct`, `formatFecha`, `formatPeriodo`.
- En Excel, montos y fechas siguen siendo números/fechas con `numFmt` (no texto).
- Colores (hex sin `#` en Excel como `FF` + hex; con `#` en pdfmake): azul marino `1f3a5f`, banda `f5f8fc`, fondo total `eef2f7`, gris de barra `e8e8e8`, línea fina `e5e7eb`, texto gris `6b6b6b`; barra azul `2563eb`, verde `059669`, ámbar `d97706`, rojo `dc2626`; texto verde `047857`, texto ámbar `b45309`, texto rojo `b91c1c`.
- PDF: tamaño `LETTER`, vertical, fuente Roboto (la de pdfmake), sin observaciones.
- Fecha de corte = `todayIso(generadoEn)`.
- UI y textos en español. Commits en español con prefijo, directo en `main`, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Archivos con LF (no usar Python para escribirlos).

## Review Focus

1. Gerente que cobró de más (restante negativo): en PDF debe decir "Pagado de más $ X" en rojo y la barra roja al 100 % de ancho (no más); en Excel el restante en rojo. → pruebas en Task 1 y Task 4.
2. Gerente sin depósitos: el PDF muestra la fila "Sin depósitos registrados" y su hoja de Excel solo el total en cero. → Task 3 y Task 4.
3. Campaña sin gerentes: PDF de una sola página con "Sin gerentes asignados"; Excel sin error. → Task 2 y Task 4.
4. Asignado 0 (ratio 0) y avance > 100 %: el ancho de barra se limita a [0, 1]. → Task 1.
5. Nombres con acentos/ñ y caracteres raros en el PDF y en las hojas (`safeSheetName` se mantiene). → Task 4 (texto con "Peña").

---

### Task 1: Estilo común

**Files:**
- Create: `src/export/estilo.ts`
- Test: `src/export/estilo.test.ts`

**Interfaces:**
- Consumes: `Resumen`, `estadoGerente` de `@/domain/campanaView`; `formatUsd`.
- Produces:
  - `export const COLOR = { azul, banda, total, grisBarra, linea, gris, barraAzul, verde, ambar, rojo, textoVerde, textoAmbar, textoRojo } as const` — hex en minúsculas **sin** `#`.
  - `export const hex = (c: string) => "#" + c` y `export const argb = (c: string) => "FF" + c.toUpperCase()`.
  - `export function colorBarra(r: Resumen): string` — `rojo` si `estadoGerente(r) === "excedido"`, `verde` si `"completo"`, `ambar` si `r.pct < 50`, si no `barraAzul`.
  - `export function anchoBarra(r: Resumen): number` — `r.ratio` limitado a [0, 1].
  - `export function textoRestante(r: Resumen): { etiqueta: "Faltan" | "Pagado de más"; monto: string; excedido: boolean }` — `monto` = `formatUsd` del valor absoluto del restante.

- [ ] **Step 1: Write the failing test** `estilo.test.ts`, con un helper `res(asignado, pagado, cantidad)` que use `calcResumen(asignado, pagado === "0" ? [] : [pagado], …)`:
  - `colorBarra`: `res("100","100",1)` → `COLOR.verde`; `res("100","120",1)` → `COLOR.rojo`; `res("100","49",1)` → `COLOR.ambar`; `res("100","0",0)` → `COLOR.ambar`; `res("100","50",1)` → `COLOR.barraAzul`.
  - `anchoBarra`: `res("100","120",1)` → `1`; `res("0","0",0)` → `0`; `res("200","50",1)` → `0.25`.
  - `textoRestante(res("100","120",1))` → `{ etiqueta: "Pagado de más", monto: "$ 20,00", excedido: true }`; `textoRestante(res("100","30",1))` → `{ etiqueta: "Faltan", monto: "$ 70,00", excedido: false }`.
  - `argb("1f3a5f")` → `"FF1F3A5F"`; `hex("1f3a5f")` → `"#1f3a5f"`.
- [ ] **Step 2:** `pnpm test src/export/estilo.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar `src/export/estilo.ts` con las firmas de arriba.
- [ ] **Step 4:** `pnpm test src/export/estilo.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: estilo común para las exportaciones`.

### Task 2: Excel — hoja Resumen con formato

**Files:**
- Modify: `src/export/campanaWorkbook.ts` (`addResumen`, `styleHeader`)
- Test: `src/export/campanaWorkbook.test.ts`

**Interfaces:**
- Consumes: `COLOR`, `argb`, `textoRestante` (Task 1).
- Produces: `buildCampanaWorkbook(campana, view, generadoEn?)` con la misma firma. Disposición fija de la hoja **Resumen** (7 columnas A–G):
  - Fila 1: `A1:G1` combinadas, valor = `campana.nombre`, fondo azul, blanco, negrita, 17 pt, alto ≈ 28.
  - Fila 2: `A2:G2` combinadas, valor = `` `${formatPeriodo(...)} · ${Activa|Cerrada} · Corte ${formatFecha(todayIso(generadoEn))}` ``, fondo azul, texto `c9d6e8`.
  - Fila 4: `A4:D4` = "Asignado", "Pagado", "Restante", "Avance" (gris, 10 pt).
  - Fila 5: `A5:D5` = números `asignado`, `pagado`, `restante`, `pct/100` (negrita 14 pt; `MONEY` en A–C con prefijo `"$ "` en el formato, `PCT` en D; B en texto verde; C en texto ámbar o texto rojo si `textoRestante(view.total).excedido`).
  - Fila 7: encabezado de la tabla (mismos 7 títulos de hoy), fondo azul, texto blanco, autofiltro `A7:G7`, panel inmovilizado `ySplit: 7`.
  - Filas 8…: un gerente por fila (mismas columnas de hoy); filas pares de datos (2.ª, 4.ª…) con fondo `banda`; bordes finos `linea` en todas las celdas de la tabla; restante negativo en texto rojo (formato `#,##0.00;[Red]-#,##0.00`).
  - Columna E de datos: formato condicional `dataBar` (min 0, max 1, color `barraAzul`) en `E8:E{últimoGerente}`; si no hay gerentes, no se agrega.
  - Fila TOTAL justo después: negrita, fondo `total`, borde superior medio azul.
  - Sin gerentes: la fila 8 es TOTAL directamente.

- [ ] **Step 1: Update the test** "genera resumen, todos los depósitos…" para la nueva disposición: `A1` = `"Marzo"`; `A2` contiene `"01/03/2026 – en curso · Activa · Corte 18/10/2026"`; `resumen.getRow(7).values` = los 7 títulos; `A8` = `"Ana"`, `C8` = `100`; fila 10: `A`=`"TOTAL"`, `B`=150, `C`=120, `D`=30, `E`=0.8; `A5`=150, `B5`=120, `C5`=30, `D5`=0.8. Nueva prueba "resumen con formato" sobre el workbook **sin** ida y vuelta: `ws.getCell("A1").isMerged` y `ws.getCell("A1").fill` con `argb("1f3a5f")`; `ws.getCell("A8").fill` sin banda y `ws.getCell("A9").fill.fgColor.argb === argb(COLOR.banda)`; existe una regla `dataBar` con `ref` `"E8:E9"` en `ws.conditionalFormattings` (o la API equivalente de la versión instalada); `ws.getCell("A10").font.bold === true`. Nueva prueba "campaña sin gerentes": `buildCampanaView([], [])` → `Resumen!A8` = `"TOTAL"` y no lanza.
- [ ] **Step 2:** `pnpm test src/export/campanaWorkbook.test.ts` → FAIL en las aserciones de Resumen.
- [ ] **Step 3:** Reescribir `addResumen` con la disposición de arriba. Extraer helpers locales reutilizables por Task 3: `franjaTitulo(ws, columnas, titulo, subtitulo)` (filas 1-2), `estilarTabla(ws, filaEncabezado, primeraFila, ultimaFila, columnas)` (encabezado, banda, bordes, autofiltro, panel inmovilizado) y `estilarTotal(row, columnas)`. Reemplazan a `styleHeader`.
- [ ] **Step 4:** `pnpm test src/export/campanaWorkbook.test.ts` → PASS (las aserciones de hojas de depósitos todavía usan la disposición vieja; si alguna falla por el cambio de helpers, ajustarlas en Task 3, no ahora).
- [ ] **Step 5: Commit** `feat: hoja Resumen del Excel con formato`.

### Task 3: Excel — hojas de depósitos e impresión

**Files:**
- Modify: `src/export/campanaWorkbook.ts` (`addDepositos`, `buildCampanaWorkbook`)
- Test: `src/export/campanaWorkbook.test.ts`

**Interfaces:**
- Consumes: helpers de Task 2; `COLOR`, `argb`, `textoRestante`.
- Produces: disposición fija de cada hoja de depósitos (11 columnas en "Todos", 10 en las de gerente; mismas columnas y anchos de hoy):
  - Fila 1: franja combinada con el título = `"Todos los depósitos"` o el nombre del gerente.
  - Fila 2: franja combinada, `` `Campaña ${campana.nombre} · Corte dd/mm/aaaa` ``.
  - Fila 3: solo en hojas de gerente, texto `` `Asignado ${formatUsd} · Pagado ${formatUsd} · ${textoRestante.etiqueta} ${monto} · Avance ${formatPct}` ``; en "Todos" queda vacía.
  - Fila 5: encabezado de tabla; datos desde la fila 6; fila TOTAL al final (texto "TOTAL" en la columna Banco, sumas de Monto Bs y USD como hoy).
  - Formato de saldo `#,##0.00;[Red]-#,##0.00`.
  - Las columnas se definen con `key`/`width`/`style` sin `header` (el encabezado se escribe en la fila 5).
- Impresión en **todas** las hojas (incluido Resumen): `pageSetup` con `orientation: "landscape"`, `fitToPage: true`, `fitToWidth: 1`, `fitToHeight: 0`, márgenes estrechos (0.25 in laterales, 0.5 in arriba/abajo) y `printTitlesRow` = fila del encabezado (`"7:7"` en Resumen, `"5:5"` en las demás).

- [ ] **Step 1: Update the test** a la nueva disposición: en "Todos los depósitos", `A6` = fecha 2026-03-01, `B6` = `"Ana"`, `D6` = `"002"`, `I6` = 130, `I7` = 30, `K7` = `"abc.png"`, `C8` = `"TOTAL"`, `H8` = 120, `A1` = `"Todos los depósitos"`; en "Ana": `A1` = `"Ana"`, `A3` contiene `"Asignado $ 100,00 · Pagado $ 100,00 · Faltan $ 0,00 · Avance 100,0 %"`, `H6` = 0, `I6` = `"obs"`. Nueva prueba "configuración de impresión": cada hoja tiene `pageSetup.orientation === "landscape"`, `fitToWidth === 1` y `printTitlesRow` correcto. Nueva prueba "gerente sin depósitos": su hoja tiene fila 6 = TOTAL con Monto Bs 0 y USD 0.
- [ ] **Step 2:** `pnpm test src/export/campanaWorkbook.test.ts` → FAIL.
- [ ] **Step 3:** Reescribir `addDepositos(ws, campana, deps, opciones: { titulo: string; resumen?: GerenteResumen }, generadoEn)` usando los helpers de Task 2 y aplicar `pageSetup` en las tres funciones.
- [ ] **Step 4:** `pnpm test` (toda la suite) → PASS.
- [ ] **Step 5:** Abrir un archivo generado en Excel para revisar a ojo: `pnpm tauri dev` con la instancia aislada de `CLAUDE.md`, crear una campaña de prueba con 2 gerentes y exportar. Comprobar franja, barra de datos, filas alternadas y vista previa de impresión.
- [ ] **Step 6: Commit** `feat: hojas de depósitos del Excel con formato e impresión`.

### Task 4: Definición del PDF

**Files:**
- Modify: `package.json` (`pnpm add pdfmake` y `pnpm add -D @types/pdfmake`)
- Create: `src/export/campanaPdf.ts`
- Test: `src/export/campanaPdf.test.ts`

**Interfaces:**
- Consumes: `Campana`, `CampanaView`, `GerenteResumen`, `DepositoCalculado`; Task 1 (`COLOR`, `hex`, `colorBarra`, `anchoBarra`, `textoRestante`); formateadores de `domain/`.
- Produces: `export function buildCampanaPdf(campana: Campana, view: CampanaView, generadoEn?: Date): TDocumentDefinitions` (tipo de `pdfmake/interfaces`). Sin imports de Tauri, DOM ni de pdfmake en tiempo de ejecución (solo tipos).

Contenido (ancho útil: `LETTER` 612 pt − márgenes 40 → 532 pt):
- `pageSize: "LETTER"`, `pageOrientation: "portrait"`, `pageMargins: [40, 50, 40, 40]`, `defaultStyle: { font: "Roboto", fontSize: 9 }`.
- `header(currentPage, pageCount)`: en la página 1 nada; desde la 2, una línea azul de 8 pt con `campana.nombre` a la izquierda y `` `Corte dd/mm/aaaa · Pág. ${n} de ${m}` `` a la derecha, con línea fina debajo. `footer`: en la página 1, `` `Pág. 1 de ${m}` `` centrado y gris.
- **Página 1:**
  - Franja: una tabla de una celda con `fillColor` azul que ocupa el ancho (márgenes negativos para ir de borde a borde son opcionales): `"REPORTE DE CAMPAÑA · CORTE dd/mm/aaaa"` (7 pt, blanco 75 %), `campana.nombre` (18 pt, negrita, blanco), `` `${formatPeriodo} · ${Activa|Cerrada}` ``.
  - Barra general: columnas `"${formatUsd(pagado)} pagado"` (negrita) / `"de ${formatUsd(asignado)}"` (gris, derecha); barra `canvas` de 532 × 8 (fondo `grisBarra`, relleno `barraAzul` con ancho `532 * anchoBarra(total)`); línea `"${etiqueta} ${monto} · ${formatPct(pct)} de avance"` con el monto en texto ámbar, o en texto rojo si `excedido`.
  - Título "Resumen por gerente" y tabla `headerRows: 1`, anchos `["*", 70, 70, 70, 130]`: Gerente, Asignado, Pagado, Restante, Avance. Montos con `formatNumberVE`, alineados a la derecha. Celda Avance = `columns` con barra `canvas` de 90 × 5 (color `colorBarra(g)`, ancho `90 * anchoBarra(g)`) y `formatPct(g.pct)`. Restante negativo con `color: hex(COLOR.textoRojo)`. Fila Total en negrita con borde superior. `layout` personalizado: líneas horizontales finas `linea`, encabezado con texto azul y línea inferior azul de 1.5, sin líneas verticales.
  - Sin gerentes: la tabla tiene una sola fila de cuerpo `"Sin gerentes asignados"` con `colSpan: 5`, y no hay más páginas.
- **Por cada gerente** (en el orden de `view.gerentes`), un bloque con `pageBreak: "before"`:
  - Nombre (16 pt, negrita); barra como la general pero con `"de ${formatUsd(asignado)} asignado"` y `colorBarra(g)`; línea `"${etiqueta} ${monto} · ${formatPct} · N depósito(s)"`.
  - Tabla `headerRows: 1`, `fontSize: 8`, anchos `[46, 55, 52, "*", 62, 40, 50, 52]`: Fecha, Banco, Referencia, Cuenta destino, Monto Bs, Tasa, USD, Saldo. Depósitos = `view.depositos.filter(d => d.asignacionId === g.asignacionId)` (ya en orden cronológico). Saldo = `saldoGerenteRestante`, rojo si negativo. Fila total: `"Total (N depósitos)"` con `colSpan: 4`, suma de Monto Bs (`Decimal`), celda de tasa vacía, `formatNumberVE(g.pagado)`, `formatNumberVE(g.restante)`.
  - Sin depósitos: una fila `"Sin depósitos registrados"` con `colSpan: 8` y sin fila de total.

- [ ] **Step 1: Write the failing test** `campanaPdf.test.ts`, con un helper `textos(nodo): string[]` que recorra la definición recursivamente juntando todos los strings (y `text` anidados), y otro `bloquesGerente(dd)` = nodos del `content` con `pageBreak === "before"`. Datos: campaña "Marzo" (2026-03-01, sin fin, activa), gerentes "Ana Peña" (asignado 100, depósitos 3650 Bs y 1095 Bs a tasa 36.5 → 100 + 30 = 130 USD, excedido) y "Luis" (asignado 50, sin depósitos); `generadoEn = new Date(2026, 9, 18, 12)`. Pruebas:
  - "una página por gerente": `bloquesGerente(dd)` tiene 2 elementos; el primero contiene `"Ana Peña"` y el segundo `"Luis"`.
  - "resumen con cifras formateadas": `textos(dd.content)` incluye `"$ 130,00 pagado"`, `"de $ 150,00"`, `"Faltan"`, `"$ 20,00"`, `"REPORTE DE CAMPAÑA · CORTE 18/10/2026"`, `"Ana Peña"` y `"Total"`.
  - "gerente excedido": el bloque de Ana incluye `"Pagado de más"` y `"$ 30,00"`; la celda del saldo final `"-30,00"` tiene `color === "#b91c1c"`.
  - "tabla de depósitos": el bloque de Ana incluye `"02/03/2026"`, `"Banesco"`, `"0102"`, `"3.650,00"`, `"36,50"`, `"100,00"`, `"Total (2 depósitos)"` y `"4.745,00"`.
  - "gerente sin depósitos": el bloque de Luis incluye `"Sin depósitos registrados"` y no incluye `"Total ("`.
  - "campaña sin gerentes": con `buildCampanaView([], [])`, `bloquesGerente` está vacío y los textos incluyen `"Sin gerentes asignados"`.
  - "encabezado y pie": `dd.header(1, 3)` no tiene textos; `textos(dd.header(2, 3))` incluye `"Marzo"` y `"Corte 18/10/2026 · Pág. 2 de 3"`; `textos(dd.footer(1, 3))` incluye `"Pág. 1 de 3"`.
  - "barra limitada": ningún `rect` de `canvas` tiene `w` mayor que su barra de fondo (532 o 90).
- [ ] **Step 2:** `pnpm test src/export/campanaPdf.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3:** `pnpm add pdfmake` y `pnpm add -D @types/pdfmake`; implementar `buildCampanaPdf` según lo descrito. Si los tipos de 0.3 no exponen `TDocumentDefinitions` en `pdfmake/interfaces`, usar la ruta que den los tipos instalados.
- [ ] **Step 4:** `pnpm test` → PASS y `pnpm build` → sin errores de tipos.
- [ ] **Step 5: Commit** `feat: definición del reporte PDF de campaña`.

### Task 5: Guardar el PDF y botón en la campaña

**Files:**
- Create: `src/export/savePdf.ts`
- Modify: `src/export/fileName.ts`, `src/export/campanaWorkbook.test.ts` (prueba de nombre), `src/features/campana/CampanaPage.tsx`, `docs/checklist-mvp.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `buildCampanaPdf` (Task 4).
- Produces:
  - `export function archivoPdf(nombre: string, fecha: string): string` → `` `${archivoBase(nombre) || "reporte"}-${fecha}.pdf` ``.
  - `export async function savePdf(dd: TDocumentDefinitions, defaultName: string): Promise<boolean>` — pide ruta con `save({ defaultPath, filters: [{ name: "PDF", extensions: ["pdf"] }] })`, devuelve `false` si se cancela; si no, carga pdfmake con `import()` dinámico (`pdfmake/build/pdfmake` + `pdfmake/build/vfs_fonts`, registrando las fuentes como pida la 0.3 instalada: `addVirtualFileSystem` o `vfs`), obtiene los bytes con `createPdf(dd).getBuffer()` y escribe con `writeFile`.

- [ ] **Step 1: Write the failing test** en `campanaWorkbook.test.ts` junto a `archivoExcel`: `archivoPdf("Campaña Marzo/2026", "2026-10-18")` → `"campana-marzo-2026-2026-10-18.pdf"`; `archivoPdf("***", "2026-10-18")` → `"reporte-2026-10-18.pdf"`.
- [ ] **Step 2:** `pnpm test src/export/campanaWorkbook.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `archivoPdf` y `savePdf`.
- [ ] **Step 4:** En `CampanaPage.tsx`, agregar `exportarPdf()` igual que `exportar()` (toast `"PDF guardado"`, `reportError(e, "Exportar")`) y un `<Button variant="outline">` con ícono `FileText` y texto `"Exportar PDF"` justo después de "Exportar a Excel".
- [ ] **Step 5:** `pnpm test` → PASS y `pnpm build` → sin errores.
- [ ] **Step 6:** Prueba manual en la instancia aislada (`CLAUDE.md`): exportar el PDF de una campaña con un gerente excedido, uno sin depósitos y uno con más de 40 depósitos. Comprobar que el texto se puede seleccionar, que los acentos se ven, que la tabla larga continúa con encabezado en la página siguiente y que la página 1 se parece a la maqueta B.
- [ ] **Step 7:** Agregar a `docs/checklist-mvp.md` los puntos de esa prueba manual, y en `CLAUDE.md` (Arquitectura) una línea: exportación en `src/export/` — `campanaWorkbook.ts` (Excel), `campanaPdf.ts` (definición pdfmake pura) + `savePdf.ts`, estilo común en `estilo.ts`.
- [ ] **Step 8: Commit** `feat: exportar la campaña a PDF`.
