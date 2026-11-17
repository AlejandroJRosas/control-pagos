# Metas por porcentaje — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Metas de campaña por monto o por porcentaje; las de porcentaje se miden también en cada gerente y se revisan en "Por gerente".

**Architecture:** `Meta` gana `porcentaje` (y `montoUsd` pasa a nulo en las de porcentaje). `vistaMetas` sigue siendo la única
función de vista: para una meta de porcentaje calcula el monto equivalente sobre el `asignado` que recibe, así sirve igual
para la campaña (`view.total`) y para un gerente (su `Resumen`). `MetaVista.montoUsd` es siempre el monto (el equivalente
en las de porcentaje), así casi todo lo que hoy muestra metas sigue igual; solo cambia el texto con `textoMeta`.

**Tech Stack:** React + TS, decimal.js, sql.js en pruebas, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-17-metas-por-porcentaje-design.md`

## Global Constraints

- Dinero como texto decimal (decimal.js, `ROUND_HALF_UP`); el equivalente redondea a 2 decimales; nada derivado se guarda.
- Cumplir = lo pagado **hasta hoy** ≥ equivalente (regla B); sin mirar la fecha de los depósitos.
- Gerente con asignado ≤ 0: la meta no aplica (no cuenta ni como cumplida ni como no cumplida).
- Las metas no viajan en el `.cpagos`. Migración nueva al final de `MIGRATIONS`, sin editar la v11.
- UI en español; porcentaje con `formatPct` ("60,0 %"); un porcentaje siempre con su monto: `60,0 % ($ 30.000,00)`.
- Sin prettier; LF; commits en español con prefijo; trabajar en `main`.

## Review Focus

1. Campaña o gerente con asignado 0 y una meta de porcentaje: no debe salir "cumplida" (equivalente 0 ≥ pagado 0). → Task 1.
2. Una meta de porcentaje elegida en la URL (`?meta=`) que se borró o pasó a monto: el selector cae a la meta por defecto, sin romper. → Task 4.
3. Cambiar una meta de monto a porcentaje al editar (y al revés): se guarda solo un valor, el otro queda nulo. → Task 2.
4. Porcentaje "60,5" / "60.5" / "0" / "101" / "abc": acepta los dos primeros, rechaza el resto. → Task 1.
5. Filtro "No cumplieron" con el árbol: la tabla pasa a lista plana (como con el filtro de estado). → Task 4.

---

### Task 1: Dominio de metas

**Files:**
- Modify: `src/domain/metas.ts`, `src/domain/metas.test.ts`
- Modify (solo literales `Meta` en pruebas, agregar `porcentaje: null`): `src/export/campanaPdf.test.ts`, `src/export/campanaWorkbook.test.ts` y cualquier otro que `pnpm build` marque

**Interfaces:**
- Produces:
  - `type Meta = { id; campanaId; montoUsd: string | null; porcentaje: string | null; fecha; nota }` (exactamente uno de los dos no nulo)
  - `type MetaVista = Omit<Meta, "montoUsd"> & { montoUsd: string /* monto o equivalente, 2 dec. en las de % */; posicion; estado; falta; fueraDeEscala }`
  - `vistaMetas(metas, total: { asignado; pagado }, hoy)` — misma firma.
  - `type MetaDraft = { tipo: "monto" | "porcentaje"; monto: string; porcentaje: string; fecha: string; nota: string }`
  - `type MetaValida = { montoUsd: string | null; porcentaje: string | null; fecha: string; nota: string | null }`
  - `parsePorcentaje(texto: string): string | null` — `/^\d{1,3}([.,]\d{1,2})?$/`, coma = punto; devuelve el texto decimal normalizado (`"60.5"`).
  - `type CumplimientoGerente = { cumplida: boolean; equivalente: string; falta: string }`
  - `cumplimientoGerente(m: Meta, g: { asignado: string; pagado: string }): CumplimientoGerente | null` — null si `m.porcentaje` es nulo o `asignado ≤ 0`.
  - `contarCumplimiento(m: Meta, gs: { asignado; pagado }[]): { cumplieron: number; noCumplieron: number }`
  - `metasDePorcentaje<T extends { porcentaje: string | null }>(ms: T[]): T[]`
  - `metaPorDefecto(vistas: MetaVista[]): MetaVista | null` — entre las de porcentaje: la primera no cumplida (orden de `vistaMetas`), si no la última.

- [ ] **Step 1: Pruebas que fallan** (en `metas.test.ts`; `meta()` gana `porcentaje: null`, y `metaPct(id, p, fecha)` con `montoUsd: null`):
  - `vistaMetas([metaPct(1,"60","2026-11-30")], {asignado:"10000", pagado:"5500"}, "2026-11-04").metas[0]` → `{ montoUsd: "6000.00", posicion: 60, estado: "pendiente", falta: "500.00", fueraDeEscala: false }`; con pagado `"6000"` → `estado: "cumplida"`.
  - Equivalente redondea: asignado `"333.33"`, 50 % → `montoUsd: "166.67"`.
  - Asignado `"0"`, pagado `"0"`, 50 % → `estado: "pendiente"` (no cumplida), `posicion: 50`.
  - `validateMeta({ tipo: "porcentaje", monto: "", porcentaje: "60,5", fecha: "2026-11-15", nota: "" })` → `{ ok: true, value: { montoUsd: null, porcentaje: "60.5", fecha, nota: null } }`; tipo monto → `porcentaje: null` aunque `porcentaje` tenga texto.
  - Rechaza `"0"`, `"101"`, `"abc"`, `""` con `errors.porcentaje = "Porcentaje inválido (de 0 a 100)"`; el error de monto sigue igual.
  - `cumplimientoGerente(metaPct(1,"60",…), { asignado: "10000", pagado: "6500" })` → `{ cumplida: true, equivalente: "6000.00", falta: "0.00" }`; pagado `"3000"` → `{ cumplida: false, falta: "3000.00" }`; asignado `"0"` → `null`; meta de monto → `null`.
  - `contarCumplimiento` con [cumple, no cumple, asignado 0] → `{ cumplieron: 1, noCumplieron: 1 }`.
  - `metaPorDefecto`: ignora las de monto; con todas cumplidas devuelve la última; sin de porcentaje → `null`.
- [ ] **Step 2:** `pnpm test src/domain/metas.test.ts` → FAIL.
- [ ] **Step 3: Implementar** en `src/domain/metas.ts`. En `vistaMetas`, para una de porcentaje: `monto = asignado × p / 100` a 2 decimales, `posicion = Number(p)`, `fueraDeEscala = false`, cumplida solo si `asignado > 0`. El orden sigue por fecha y luego `montoUsd` de la vista.
- [ ] **Step 4:** `pnpm test src/domain` → PASS.
- [ ] **Step 5:** Commit `feat: metas por porcentaje en el dominio (equivalente y cumplimiento por gerente)`.

### Task 2: Migración v12 y repositorio

**Files:**
- Modify: `src/db/migrations.ts`, `src/db/repos/metas.ts`, `src/db/repos/metas.test.ts`, `src/vista/semilla.ts`

**Interfaces:**
- Consumes: `Meta`, `MetaValida` (Task 1).
- Produces: `createMeta`/`updateMeta`/`listMetas`/`metasPorCampana` con las mismas firmas, ahora con `porcentaje`.

- [ ] **Step 1: Pruebas que fallan** (`metas.test.ts` del repo): crear una meta de porcentaje y leerla → `{ montoUsd: null, porcentaje: "60" }`; editar una de monto a porcentaje → `montoUsd: null`, y de vuelta a monto → `porcentaje: null`. Si hay prueba de migraciones con versión fija, actualizarla a 12.
- [ ] **Step 2:** `pnpm test src/db/repos/metas.test.ts` → FAIL.
- [ ] **Step 3:** Migración `version: 12`, una sentencia: `ALTER TABLE metas ADD COLUMN porcentaje TEXT` (nulo = meta por monto). `monto_usd` sigue `NOT NULL`: una meta de porcentaje guarda `''` y el SELECT lee `NULLIF(monto_usd, '') AS montoUsd, porcentaje`. INSERT/UPDATE escriben `v.montoUsd ?? ''` y `v.porcentaje`. Semilla de la vista: agregar una meta de 50 % a 20 días (`sumarDias(hoy, 20)`), las demás con `porcentaje: null`.
- [ ] **Step 4:** `pnpm test src/db` → PASS.
- [ ] **Step 5:** Commit `feat: guardar metas por porcentaje (migración v12)`.

### Task 3: Formulario y textos de la meta

**Files:**
- Modify: `src/features/campana/MetaFormDialog.tsx`, `src/components/estiloMeta.ts`, `src/features/campana/AvanceCampana.tsx` (etiqueta y próxima meta), `src/export/campanaPdf.ts`, `src/export/campanaWorkbook.ts` y sus pruebas, `src/features/campana/metas.ui.test.tsx`

**Interfaces:**
- Consumes: Task 1 y 2.
- Produces: `textoMeta(m: MetaVista): string` en `estiloMeta.ts` → `"60,0 % ($ 30.000,00)"` o `"$ 30.000,00"`. `describirMeta` lo usa (`"Meta 60,0 % ($ 6.000,00) para el …"`).

- [ ] **Step 1: Prueba de UI que falla** (`metas.ui.test.tsx`, nueva): en el diálogo, botón de tipo "Porcentaje" (dos botones `aria-pressed` "Monto" / "Porcentaje"), campo "Porcentaje a pagar (%)" con `60`, la pista dice `$ 60,00 del saldo general` (asignado 100 del `seedBasico`); al guardar, la marca se llama `/Meta 60,0 % \(\$ 60,00\) para el 20\/03\/2026 · faltan \$ 10,00/` y "Próxima meta" muestra `60,0 % ($ 60,00)`. Al editarla, el diálogo abre en "Porcentaje" con `60`.
- [ ] **Step 2:** `pnpm test src/features/campana/metas.ui.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.** El diálogo: el selector de tipo arriba; tipo monto = campo actual; tipo porcentaje = `<Input inputMode="decimal">` con pista `"<equivalente> del saldo general"`. La descripción del diálogo menciona que una meta de porcentaje también se mide en cada gerente. En la barra, la etiqueta y `ProximaMeta` usan `textoMeta`. PDF y Excel: la columna del monto muestra/escribe el equivalente (`m.montoUsd`) y se agrega a su izquierda una columna "%" con `formatPct` o vacía; pruebas de exportación con una meta de porcentaje.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat: elegir meta por monto o por porcentaje y mostrar su monto equivalente`.

### Task 4: Cumplimiento en "Por gerente"

**Files:**
- Modify: `src/features/campana/PorGerenteTab.tsx`, `src/features/campana/CampanaPage.tsx` (pasar `metas`)
- Create: `src/features/campana/metasGerentes.ui.test.tsx`

**Interfaces:**
- Consumes: `vistaMetas`, `metasDePorcentaje`, `metaPorDefecto`, `cumplimientoGerente`, `contarCumplimiento`, `textoMeta`.
- Produces: `PorGerenteTab` con prop `metas: Meta[]` y `hoy: string`; filtros de URL `meta` (id) y `cumple` (`"si"` | `"no"` | `""`) dentro de `FILTROS`.

- [ ] **Step 1: Prueba de UI que falla.** Campaña con dos gerentes (uno al 70 %, otro al 30 %) y una meta de 60 %. En `?tab=gerentes`: el selector (`BuscadorSelect`, nombre accesible "Meta") muestra `60,0 % · <fecha>`; chips "Cumplieron 1" y "No cumplieron 1"; clic en "No cumplieron" deja solo al del 30 %; la columna "Meta" dice "Cumplida" para uno y `Faltan $ …` (equivalente − pagado) para el otro. Con `?meta=999` cae a la meta por defecto. Sin metas de porcentaje no hay selector, chips ni columna.
- [ ] **Step 2:** Correr la prueba → FAIL.
- [ ] **Step 3: Implementar.** La meta elegida = la de `f.meta` si existe entre las de porcentaje, si no `metaPorDefecto`. Columna nueva `meta` en `Key`/`COLUMNAS` (tipo `numero`: 1 cumplida, 0 no, −1 no aplica) que se omite al dibujar si no hay meta elegida; en el pie y en las filas de cierre de rama queda vacía; un gerente sin asignado muestra "—". El filtro `cumple` se suma a `visibles` y apaga el modo árbol, igual que `estado`. Etiqueta de la cabecera: `Meta 60,0 %`.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** Commit `feat: ver en Por gerente quiénes cumplen una meta por porcentaje`.

### Task 5: Atajo desde la barra y marcas en la barra del gerente

**Files:**
- Modify: `src/features/campana/AvanceCampana.tsx`, `src/features/campana/CampanaPage.tsx`, `src/components/ResumenCards.tsx`, `src/features/asignacion/AsignacionPage.tsx`, `src/features/campana/metasGerentes.ui.test.tsx`

**Interfaces:**
- Consumes: `contarCumplimiento`, `metasDePorcentaje`, `vistaMetas`.
- Produces: `AvanceCampana` con props `gerentes: GerenteResumen[]` y `onVerGerentes: (metaId: number) => void` (CampanaPage navega a `?tab=gerentes&meta=<id>` y borra `cumple`). `ResumenCards` con prop `metas?: MetaVista[]` que pasa a su `AvanceBar`.

- [ ] **Step 1: Pruebas que fallan** (en `metasGerentes.ui.test.tsx`): al pasar el mouse por la marca de 60 % la casilla dice `1 de 2 gerentes la cumplen`; clic en su enlace "Ver gerentes" abre "Por gerente" con esa meta elegida. En `/asignaciones/<id>` del gerente al 30 %, la barra de Avance tiene la marca `Meta 60,0 % ($ …) para el …` (solo las de porcentaje; una de monto no aparece).
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3: Implementar.** La casilla hoy está dentro del `<button>` de la etiqueta y con `pointer-events-none`: sacarla a hermana del botón, dentro de un contenedor posicionado que lleva `onMouseEnter/Leave` (así el mouse puede llegar a ella sin cerrarla), con `pointer-events-auto` y el botón "Ver gerentes" solo en las de porcentaje. Clic en la etiqueta sigue editando. `AsignacionPage` carga `listMetas(db, a.campanaId)` en su `useData` y pasa `vistaMetas(metasDePorcentaje(metas), resumen, todayIso()).metas` a `ResumenCards`.
- [ ] **Step 4:** `pnpm test` y `pnpm build` → PASS.
- [ ] **Step 5:** Commit `feat: atajo de la meta a los gerentes que la cumplen y metas en la barra del gerente`.

### Task 6: Revisión visual y documentación

**Files:**
- Modify: `CLAUDE.md` (párrafo de metas), `docs/checklist-mvp.md` si lista metas

- [ ] **Step 1:** `pnpm vista` + `pnpm capturas` y revisar `campana`, `campana-gerentes` y `gerente-en-campana` en claro y oscuro (la casilla con el enlace no debe taparse ni recortarse).
- [ ] **Step 2:** Actualizar el párrafo de metas de `CLAUDE.md`: tipo monto/porcentaje (`porcentaje`, migración v12, `monto_usd = ''`), `MetaVista.montoUsd` = equivalente, `textoMeta`, cumplimiento por gerente (regla B, asignado 0 no cuenta) en Por gerente (`?meta=`/`?cumple=`), atajo y barra del gerente.
- [ ] **Step 3:** `pnpm test` y `pnpm build` → PASS. Commit `docs: metas por porcentaje en CLAUDE.md`.
