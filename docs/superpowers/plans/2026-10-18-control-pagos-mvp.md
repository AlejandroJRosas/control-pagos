# Control de Pagos — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la app de escritorio local (sin OCR) que registra depósitos por gerente y campaña, calcula los saldos en USD con un histórico de tasas, y exporta a Excel y a respaldos `.zip`.

**Architecture:** La app es un shell de Tauri 2 con una UI en React + TypeScript. Toda la lógica de dinero vive en `src/domain/`: funciones puras sin dependencias, probadas con Vitest. El acceso a SQLite pasa por una interfaz mínima `SqlDriver`. En producción la implementa `tauri-plugin-sql`; en las pruebas, `sql.js` en memoria. Así los repositorios y las migraciones se prueban sin Tauri. El código Rust se limita a los plugins y a los comandos de respaldo (crear, restaurar y podar zips), y tiene sus propias pruebas con `cargo test`.

**Tech Stack:** Tauri 2, React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui, react-router, decimal.js, ExcelJS, sonner, lucide-react, Vitest, sql.js (solo para pruebas), Rust (`zip`, `serde`, `tempfile` para pruebas), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-18-control-pagos-design.md`

## Global Constraints

- Toda la UI está en español. Los montos usan formato venezolano (`1.234.567,89 Bs`, `$ 1.234,56`) y las fechas se muestran como `dd/mm/aaaa`. En la BD las fechas se guardan como `YYYY-MM-DD`.
- Los montos se guardan como **texto decimal exacto**. Nunca se hacen cálculos con `number` de JS: todo cálculo de dinero usa decimal.js con `ROUND_HALF_UP`. Los USD se redondean a 2 decimales.
- **No se guardan valores derivados.** USD, saldos restantes y porcentajes siempre se calculan con las funciones de `src/domain/`.
- Hay **una tasa por fecha** (`UNIQUE(tasas.fecha)`). La tasa de un depósito **debe ser la de su misma fecha**, y el repositorio lo valida.
- Una campaña `cerrada` es de solo lectura: los repositorios rechazan cualquier cambio en sus asignaciones o depósitos con `DomainError('CAMPANA_CERRADA')`.
- Identificador de la app: `com.controlpagos.app`. BD: `control-pagos.db`. Imágenes: `<AppData>/imagenes/`. Respaldos: `<AppData>/respaldos/`. Se conservan 7 respaldos automáticos.
- Gestor de paquetes: `pnpm`. Plataforma objetivo: Windows 11 (instalador `.msi`).
- Cada commit termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Montos escritos en formatos mezclados** (`1234.56`, `1.234`, `36,5`, `2.000,00 Bs`): se interpretan según las reglas venezolanas, y lo ambiguo o inválido se rechaza en lugar de interpretarse mal. Prueba en la Task 2 (`parseMonto`).
2. **Editar la fecha de un depósito a un día que tiene otra tasa o ninguna:** el depósito no puede quedar con la tasa del día anterior. Prueba en la Task 7: `createDeposito`/`updateDeposito` rechazan una tasa de otra fecha.
3. **Restaurar un `.zip` que no es un respaldo, está corrupto o trae rutas peligrosas:** los datos actuales quedan intactos. Pruebas en la Task 10 (`restore_zip`).
4. **Referencia duplicada escrita con otra capitalización o con espacios** (`"Banesco "` vs `"banesco"`, `" 123 "` vs `"123"`): se detecta igual. Prueba en la Task 7 (`findDuplicados`).
5. **Nombres de gerente que Excel no acepta como nombre de hoja** (`/`, `:`, más de 31 caracteres, nombres repetidos o un gerente llamado "Resumen"): el Excel se genera igual, con nombres de hoja únicos. Prueba en la Task 9 (`safeSheetName`).

## Prerrequisitos (una sola vez, los hace el usuario)

Tauri en Windows necesita la toolchain **MSVC**. En esta máquina están instalados Node 24, pnpm 10, Rust 1.90 (la toolchain por defecto es `gnu`) y WebView2, pero **no** el compilador de C++ de Visual Studio. Las Tasks 1–9 no lo necesitan. **Desde la Task 10 es obligatorio.**

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
rustup default stable-x86_64-pc-windows-msvc
```

Verificación: `rustup show` muestra `stable-x86_64-pc-windows-msvc (default)`, y `& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property displayName` imprime un nombre.

## Mapa de archivos

```
package.json, vite.config.ts, tsconfig*.json, index.html, components.json   (scaffold)
src/
  main.tsx                         arranque: router + respaldo automático
  App.tsx                          rutas
  index.css                        Tailwind + tema shadcn
  lib/utils.ts                     cn() (lo genera shadcn)
  lib/reportError.ts               toast + log de errores
  components/ui/*                  componentes shadcn (generados)
  components/AppLayout.tsx         barra lateral + <Outlet/>
  components/PageHeader.tsx        título, subtítulo, volver, acciones
  components/Feedback.tsx          Cargando, Vacio, Aviso
  components/Field.tsx             label + control + error
  components/NativeSelect.tsx      <select> con estilo
  components/ConfirmDialog.tsx     confirmación controlada
  components/ResumenCards.tsx      4 indicadores (asignado, pagado, restante, %)
  components/StoredImage.tsx       muestra una imagen guardada en AppData
  components/ImageViewer.tsx       visor con zoom
  components/ComprobanteThumb.tsx  miniatura que abre el visor
  components/ImageDrop.tsx         arrastrar / pegar / elegir imagen
  components/EstadoBadge.tsx       badge de estado de campaña
  components/DepositosTable.tsx    tabla de depósitos reutilizable
  hooks/useData.ts                 carga de datos + invalidate()
  domain/money.ts                  parseo, formato y conversión a USD
  domain/dates.ts                  fechas ISO y su formato
  domain/errors.ts                 DomainError
  domain/validation.ts             validación de formularios
  domain/campanaView.ts            saldos, resúmenes y filtros
  extraction/extractor.ts          interfaz Extractor + NullExtractor
  db/driver.ts                     interfaz SqlDriver
  db/clock.ts                      nowIso()
  db/migrations.ts                 esquema versionado (PRAGMA user_version)
  db/index.ts                      getDb()/closeDb() sobre tauri-plugin-sql
  db/tauriDriver.ts                adaptador de tauri-plugin-sql a SqlDriver
  db/testing/sqljsDriver.ts        SqlDriver en memoria (solo pruebas)
  db/testing/fixtures.ts           datos semilla para pruebas
  db/repos/gerentes.ts|campanas.ts|asignaciones.ts|tasas.ts|depositos.ts
  db/queries/campanaData.ts        carga una campaña completa para calcular
  export/campanaWorkbook.ts        Excel de una campaña
  export/tasasWorkbook.ts          Excel de tasas
  export/saveWorkbook.ts           diálogo "Guardar como" + escritura + nombre de archivo
  platform/images.ts               guardar y leer imágenes en AppData
  platform/backup.ts               respaldo, restauración, respaldo automático (invoca Rust)
  features/gerentes/*, features/tasas/*, features/campanas/*, features/campana/*,
  features/asignacion/*, features/deposito/*, features/configuracion/*
src-tauri/
  Cargo.toml, tauri.conf.json, capabilities/default.json
  src/lib.rs                       plugins + comandos
  src/backup.rs                    zip, restauración, poda y listado (+ pruebas)
```

---

### Task 1: Scaffold del proyecto (Tauri + React + TS + Tailwind + shadcn + Vitest)

**Files:**
- Create: todo el scaffold de `create-tauri-app` dentro de `control-pagos/` (sin sobrescribir `.gitignore`, `README.md` ni `docs/`)
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json` (si existe), `src/index.css`, `src/App.tsx`, `src/main.tsx`
- Test: `src/smoke.test.ts` (temporal; se borra en la Task 2)

**Interfaces:**
- Produces: alias `@/` → `src/`; script `pnpm test` (`vitest run`); componentes shadcn en `@/components/ui/*`: `button input label textarea card table tabs dialog badge progress sonner alert-dialog`.

- [ ] **Step 1: Generar el scaffold en una carpeta temporal y moverlo**

```powershell
cd C:\Users\Alejandro\Documents\GitHub
pnpm create tauri-app@latest control-pagos-scaffold --manager pnpm --template react-ts --identifier com.controlpagos.app --yes
```

Copia el contenido de `control-pagos-scaffold\` a `control-pagos\`, **excepto** `.gitignore` y `README.md`, y borra la carpeta temporal:

```powershell
Get-ChildItem control-pagos-scaffold -Force | Where-Object { $_.Name -notin '.gitignore','README.md' } | Copy-Item -Destination control-pagos -Recurse -Force
Remove-Item control-pagos-scaffold -Recurse -Force
cd control-pagos
pnpm install
```

- [ ] **Step 2: Instalar dependencias**

```powershell
pnpm add react-router decimal.js exceljs sonner lucide-react
pnpm add -D vitest sql.js @types/sql.js @types/node tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configurar Vite (Tailwind + alias + Vitest)**

Reemplaza `vite.config.ts` y conserva el bloque de Tauri que trae el scaffold (`clearScreen`, `server` con el puerto 1420, `envPrefix` si existe):

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
}));
```

Agrega el alias en `compilerOptions` de `tsconfig.json`, y también en `tsconfig.app.json` si el scaffold lo creó:

```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

Agrega estos scripts en `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Tailwind + shadcn**

Reemplaza el contenido de `src/index.css` con:

```css
@import "tailwindcss";
```

Borra `src/App.css` y quita su import en `src/App.tsx`. Después:

```powershell
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input label textarea card table tabs dialog badge progress sonner alert-dialog -y
```

Si `init` pregunta algo, elige el color base `neutral`. Al terminar deben existir `components.json`, `src/lib/utils.ts` y `src/components/ui/*.tsx`.

`sonner.tsx` de shadcn importa `next-themes`. Si lo hace, reemplaza `src/components/ui/sonner.tsx` con:

```tsx
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return <Sonner className="toaster group" {...props} />;
}
```

y ejecuta `pnpm remove next-themes`, si llegó a instalarse.

- [ ] **Step 5: App mínima**

`src/App.tsx`:

```tsx
export default function App() {
  return <div className="p-6 text-lg font-semibold">Control de Pagos</div>;
}
```

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 6: Prueba de humo de Vitest**

`src/smoke.test.ts`:

```ts
import { expect, it } from "vitest";
import Decimal from "decimal.js";

it("vitest y decimal.js funcionan", () => {
  expect(new Decimal("0.1").plus("0.2").toString()).toBe("0.3");
});
```

Run: `pnpm test`
Expected: `1 passed`

- [ ] **Step 7: Verificar que el frontend compila**

Run: `pnpm build`
Expected: termina sin errores de TypeScript y genera `dist/`.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Tauri + React + TS + Tailwind + shadcn + Vitest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `domain/money.ts`: parseo, formato y conversión a USD

**Files:**
- Create: `src/domain/money.ts`
- Test: `src/domain/money.test.ts`
- Delete: `src/smoke.test.ts`

**Interfaces:**
- Produces:
  - `parseMonto(input: string): string | null`: devuelve un decimal canónico (`"1234.56"`) o `null`.
  - `formatNumberVE(value: Decimal.Value, decimals?: number): string`: `"1.234,56"` (por defecto 2 decimales).
  - `formatBs(v): string` → `"1.234,56 Bs"` · `formatUsd(v): string` → `"$ 1.234,56"` / `"-$ 20,00"`.
  - `formatTasa(v): string`: entre 2 y 4 decimales.
  - `formatPct(pct: number): string` → `"45,3 %"`.
  - `toInputVE(canonical: string): string`: formato editable con al menos 2 decimales.
  - `toUsd(montoBs: string, tasa: string): string`: monto ÷ tasa, half-up a 2 decimales, siempre con 2 decimales (`"27.40"`).

- [ ] **Step 1: Escribir las pruebas**

`src/domain/money.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBs, formatNumberVE, formatPct, formatTasa, formatUsd, parseMonto, toInputVE, toUsd } from "./money";

describe("parseMonto", () => {
  it.each([
    ["1.234.567,89", "1234567.89"],
    ["1234567,89", "1234567.89"],
    ["36,5", "36.5"],
    ["1.234", "1234"],
    ["1234.56", "1234.56"],
    ["36.5", "36.5"],
    ["1.234.567", "1234567"],
    ["500", "500"],
    ["  2.000,00 Bs ", "2000"],
    ["2.000,00 Bs.", "2000"],
    ["$ 150,25", "150.25"],
    ["0,00", "0"],
  ])("%j → %s", (input, expected) => {
    expect(parseMonto(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "1,2,3", "12,34.5", "-5", "1.23.4", ",5", "12.34.567,8x"])("rechaza %j", (input) => {
    expect(parseMonto(input)).toBeNull();
  });
});

describe("formato", () => {
  it("formatNumberVE", () => {
    expect(formatNumberVE("1234567.891")).toBe("1.234.567,89");
    expect(formatNumberVE("0.005")).toBe("0,01");
    expect(formatNumberVE("-1500")).toBe("-1.500,00");
    expect(formatNumberVE("-0.001")).toBe("0,00");
    expect(formatNumberVE("999")).toBe("999,00");
    expect(formatNumberVE("12.5", 0)).toBe("13");
  });

  it("formatBs y formatUsd", () => {
    expect(formatBs("1234.5")).toBe("1.234,50 Bs");
    expect(formatUsd("1234.5")).toBe("$ 1.234,50");
    expect(formatUsd("-20")).toBe("-$ 20,00");
  });

  it("formatTasa usa entre 2 y 4 decimales", () => {
    expect(formatTasa("36.5")).toBe("36,50");
    expect(formatTasa("40.123")).toBe("40,123");
    expect(formatTasa("245.123456")).toBe("245,1235");
  });

  it("formatPct", () => {
    expect(formatPct(45.25)).toBe("45,3 %");
    expect(formatPct(100)).toBe("100,0 %");
  });

  it("toInputVE", () => {
    expect(toInputVE("1234.5")).toBe("1.234,50");
    expect(toInputVE("36.1234")).toBe("36,1234");
  });
});

describe("toUsd", () => {
  it("divide y redondea half-up a 2 decimales", () => {
    expect(toUsd("3650", "36.5")).toBe("100.00");
    expect(toUsd("1000", "36.5")).toBe("27.40");
    expect(toUsd("0.125", "1")).toBe("0.13");
    expect(toUsd("100", "3")).toBe("33.33");
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `pnpm test src/domain/money.test.ts`
Expected: FAIL con `Failed to resolve import "./money"`

- [ ] **Step 3: Implementar**

`src/domain/money.ts`:

```ts
import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Interpreta un monto escrito por el usuario en formato venezolano.
 * - Con coma: la coma es decimal y los puntos son separadores de miles ("1.234,56").
 * - Sin coma: un único punto seguido de exactamente 3 dígitos es separador de miles ("1.234");
 *   cualquier otro punto único es decimal ("36.5"); varios puntos son miles ("1.234.567").
 * Devuelve el decimal canónico ("1234.56") o null si no es válido o es negativo.
 */
export function parseMonto(input: string): string | null {
  const s = input
    .replace(/\s/g, "")
    .replace(/^(Bs\.?|\$)/i, "")
    .replace(/(Bs\.?|\$)$/i, "");
  if (s === "") return null;

  let normalized: string;
  if (s.includes(",")) {
    if (s.indexOf(",") !== s.lastIndexOf(",")) return null;
    const [ent, dec] = s.split(",");
    if (!/^(\d{1,3}(\.\d{3})*|\d+)$/.test(ent) || !/^\d+$/.test(dec)) return null;
    normalized = `${ent.replace(/\./g, "")}.${dec}`;
  } else {
    const dots = (s.match(/\./g) ?? []).length;
    if (dots === 0) {
      if (!/^\d+$/.test(s)) return null;
      normalized = s;
    } else if (dots === 1 && !/^\d+\.\d{3}$/.test(s)) {
      if (!/^\d+\.\d+$/.test(s)) return null;
      normalized = s;
    } else {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
      normalized = s.replace(/\./g, "");
    }
  }
  return new Decimal(normalized).toFixed();
}

export function formatNumberVE(value: Decimal.Value, decimals = 2): string {
  const d = new Decimal(value).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const negative = d.isNegative() && !d.isZero();
  const [ent, dec] = d.abs().toFixed(decimals).split(".");
  const entFmt = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${entFmt}${dec ? `,${dec}` : ""}`;
}

export const formatBs = (v: Decimal.Value): string => `${formatNumberVE(v)} Bs`;

export function formatUsd(v: Decimal.Value): string {
  const s = formatNumberVE(v);
  return s.startsWith("-") ? `-$ ${s.slice(1)}` : `$ ${s}`;
}

export function formatTasa(v: Decimal.Value): string {
  const d = new Decimal(v);
  return formatNumberVE(d, Math.min(Math.max(d.decimalPlaces(), 2), 4));
}

export const formatPct = (pct: number): string => `${formatNumberVE(pct, 1)} %`;

export function toInputVE(canonical: string): string {
  const d = new Decimal(canonical);
  return formatNumberVE(d, Math.max(d.decimalPlaces(), 2));
}

export function toUsd(montoBs: string, tasa: string): string {
  return new Decimal(montoBs).div(tasa).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `pnpm test src/domain/money.test.ts`
Expected: PASS (todas)

- [ ] **Step 5: Borrar la prueba de humo y hacer commit**

```powershell
Remove-Item src/smoke.test.ts
git add -A
git commit -m "feat(domain): parseo y formato de montos venezolanos y conversión a USD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `domain/dates.ts`, `domain/errors.ts`, `domain/validation.ts`

**Files:**
- Create: `src/domain/dates.ts`, `src/domain/errors.ts`, `src/domain/validation.ts`
- Test: `src/domain/dates.test.ts`, `src/domain/validation.test.ts`

**Interfaces:**
- Consumes: `parseMonto` (Task 2).
- Produces:
  - `formatFecha(iso: string): string` → `"18/10/2026"`.
  - `isValidIsoDate(s: string): boolean`.
  - `todayIso(now?: Date): string`: usa la fecha local.
  - `formatPeriodo(inicio: string, fin: string | null): string` → `"01/03/2026 – 31/03/2026"` o `"01/03/2026 – en curso"`.
  - `class DomainError extends Error { code: DomainErrorCode }`, con `DomainErrorCode = 'VALIDACION' | 'DUPLICADO' | 'TASA_EN_USO' | 'NO_ENCONTRADO' | 'CAMPANA_CERRADA'`.
  - `type Result<T, K extends string> = { ok: true; value: T } | { ok: false; errors: Partial<Record<K, string>> }`.
  - `DepositoDraft { fecha; banco; referencia; cuentaDestino; montoBs; tasaId: number | null; observaciones }` (todos `string` excepto `tasaId`).
  - `DepositoValido { fecha; banco; referencia; cuentaDestino; montoBs /* canónico */; tasaId: number; observaciones: string | null }`.
  - `validateDeposito(d: DepositoDraft): Result<DepositoValido, keyof DepositoDraft>`.
  - `TasaDraft { fecha; valor; notas }` → `TasaValida { fecha; valor /* canónico */; notas: string | null }` mediante `validateTasa`.
  - `validateSaldo(raw: string): Result<string, 'saldoUsd'>`.
  - `CampanaDraft { nombre; fechaInicio; fechaFin; notas }` → `CampanaValida { nombre; fechaInicio; fechaFin: string | null; notas: string | null }` mediante `validateCampana`.
  - `GerenteDraft { nombre; telefono }` → `GerenteValido { nombre; telefono: string | null }` mediante `validateGerente`.

- [ ] **Step 1: Escribir las pruebas**

`src/domain/dates.test.ts`:

```ts
import { expect, it } from "vitest";
import { formatFecha, formatPeriodo, isValidIsoDate, todayIso } from "./dates";

it("formatFecha", () => {
  expect(formatFecha("2026-10-18")).toBe("18/10/2026");
});

it("isValidIsoDate", () => {
  expect(isValidIsoDate("2026-10-18")).toBe(true);
  expect(isValidIsoDate("2028-02-29")).toBe(true);
  expect(isValidIsoDate("2026-02-29")).toBe(false);
  expect(isValidIsoDate("2026-13-01")).toBe(false);
  expect(isValidIsoDate("18/10/2026")).toBe(false);
  expect(isValidIsoDate("")).toBe(false);
});

it("todayIso usa la fecha local", () => {
  expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
});

it("formatPeriodo", () => {
  expect(formatPeriodo("2026-03-01", "2026-03-31")).toBe("01/03/2026 – 31/03/2026");
  expect(formatPeriodo("2026-03-01", null)).toBe("01/03/2026 – en curso");
});
```

`src/domain/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateCampana, validateDeposito, validateGerente, validateSaldo, validateTasa, type DepositoDraft } from "./validation";

const draft = (o: Partial<DepositoDraft> = {}): DepositoDraft => ({
  fecha: "2026-03-02",
  banco: " Banesco ",
  referencia: " 0012345 ",
  cuentaDestino: "0102-0000-00-0000000000",
  montoBs: "3.650,00",
  tasaId: 7,
  observaciones: "  ",
  ...o,
});

describe("validateDeposito", () => {
  it("normaliza un borrador válido", () => {
    expect(validateDeposito(draft())).toEqual({
      ok: true,
      value: {
        fecha: "2026-03-02",
        banco: "Banesco",
        referencia: "0012345",
        cuentaDestino: "0102-0000-00-0000000000",
        montoBs: "3650",
        tasaId: 7,
        observaciones: null,
      },
    });
  });

  it("reporta cada campo inválido", () => {
    const r = validateDeposito(draft({ fecha: "", banco: "", referencia: " ", cuentaDestino: "", montoBs: "0", tasaId: null }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["banco", "cuentaDestino", "fecha", "montoBs", "referencia", "tasaId"]);
  });
});

describe("validateTasa", () => {
  it("acepta y normaliza", () => {
    expect(validateTasa({ fecha: "2026-03-02", valor: "36,50", notas: "" })).toEqual({
      ok: true,
      value: { fecha: "2026-03-02", valor: "36.5", notas: null },
    });
  });
  it("rechaza valor 0 y fecha inválida", () => {
    const r = validateTasa({ fecha: "x", valor: "0", notas: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["fecha", "valor"]);
  });
});

describe("validateSaldo", () => {
  it("acepta positivos y rechaza 0 o texto", () => {
    expect(validateSaldo("1.500,50")).toEqual({ ok: true, value: "1500.5" });
    expect(validateSaldo("0").ok).toBe(false);
    expect(validateSaldo("abc").ok).toBe(false);
  });
});

describe("validateCampana", () => {
  it("acepta sin fecha fin", () => {
    expect(validateCampana({ nombre: " Marzo ", fechaInicio: "2026-03-01", fechaFin: "", notas: "" })).toEqual({
      ok: true,
      value: { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null },
    });
  });
  it("rechaza fin anterior al inicio y nombre vacío", () => {
    const r = validateCampana({ nombre: "", fechaInicio: "2026-03-10", fechaFin: "2026-03-01", notas: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["fechaFin", "nombre"]);
  });
});

describe("validateGerente", () => {
  it("requiere nombre", () => {
    expect(validateGerente({ nombre: " Ana ", telefono: "" })).toEqual({ ok: true, value: { nombre: "Ana", telefono: null } });
    expect(validateGerente({ nombre: " ", telefono: "" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `pnpm test src/domain`
Expected: FAIL. No se resuelven `./dates` ni `./validation`.

- [ ] **Step 3: Implementar**

`src/domain/dates.ts`:

```ts
export function formatFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatPeriodo(inicio: string, fin: string | null): string {
  return `${formatFecha(inicio)} – ${fin ? formatFecha(fin) : "en curso"}`;
}
```

`src/domain/errors.ts`:

```ts
export type DomainErrorCode = "VALIDACION" | "DUPLICADO" | "TASA_EN_USO" | "NO_ENCONTRADO" | "CAMPANA_CERRADA";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
```

`src/domain/validation.ts`:

```ts
import Decimal from "decimal.js";
import { parseMonto } from "./money";
import { isValidIsoDate } from "./dates";

export type Result<T, K extends string> = { ok: true; value: T } | { ok: false; errors: Partial<Record<K, string>> };

type Errors<K extends string> = Partial<Record<K, string>>;

function finish<T, K extends string>(errors: Errors<K>, build: () => T): Result<T, K> {
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: build() };
}

function positivo(raw: string): string | null {
  const v = parseMonto(raw);
  return v !== null && new Decimal(v).gt(0) ? v : null;
}

const opcional = (s: string): string | null => s.trim() || null;

export type DepositoDraft = {
  fecha: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  tasaId: number | null;
  observaciones: string;
};

export type DepositoValido = {
  fecha: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  tasaId: number;
  observaciones: string | null;
};

export function validateDeposito(d: DepositoDraft): Result<DepositoValido, keyof DepositoDraft> {
  const errors: Errors<keyof DepositoDraft> = {};
  if (!isValidIsoDate(d.fecha)) errors.fecha = "Fecha inválida";
  if (!d.banco.trim()) errors.banco = "Indica el banco de origen";
  if (!d.referencia.trim()) errors.referencia = "Indica la referencia bancaria";
  if (!d.cuentaDestino.trim()) errors.cuentaDestino = "Indica la cuenta destino";
  const monto = positivo(d.montoBs);
  if (!monto) errors.montoBs = "Monto inválido (ej. 1.234.567,89)";
  if (d.tasaId == null) errors.tasaId = "Falta la tasa del día";
  return finish(errors, () => ({
    fecha: d.fecha,
    banco: d.banco.trim(),
    referencia: d.referencia.trim(),
    cuentaDestino: d.cuentaDestino.trim(),
    montoBs: monto as string,
    tasaId: d.tasaId as number,
    observaciones: opcional(d.observaciones),
  }));
}

export type TasaDraft = { fecha: string; valor: string; notas: string };
export type TasaValida = { fecha: string; valor: string; notas: string | null };

export function validateTasa(d: TasaDraft): Result<TasaValida, keyof TasaDraft> {
  const errors: Errors<keyof TasaDraft> = {};
  if (!isValidIsoDate(d.fecha)) errors.fecha = "Fecha inválida";
  const valor = positivo(d.valor);
  if (!valor) errors.valor = "Tasa inválida (ej. 36,50)";
  return finish(errors, () => ({ fecha: d.fecha, valor: valor as string, notas: opcional(d.notas) }));
}

export function validateSaldo(raw: string): Result<string, "saldoUsd"> {
  const v = positivo(raw);
  return v ? { ok: true, value: v } : { ok: false, errors: { saldoUsd: "Saldo inválido (debe ser mayor que 0)" } };
}

export type CampanaDraft = { nombre: string; fechaInicio: string; fechaFin: string; notas: string };
export type CampanaValida = { nombre: string; fechaInicio: string; fechaFin: string | null; notas: string | null };

export function validateCampana(d: CampanaDraft): Result<CampanaValida, keyof CampanaDraft> {
  const errors: Errors<keyof CampanaDraft> = {};
  if (!d.nombre.trim()) errors.nombre = "Indica el nombre";
  if (!isValidIsoDate(d.fechaInicio)) errors.fechaInicio = "Fecha inválida";
  if (d.fechaFin) {
    if (!isValidIsoDate(d.fechaFin)) errors.fechaFin = "Fecha inválida";
    else if (d.fechaFin < d.fechaInicio) errors.fechaFin = "Debe ser igual o posterior al inicio";
  }
  return finish(errors, () => ({
    nombre: d.nombre.trim(),
    fechaInicio: d.fechaInicio,
    fechaFin: d.fechaFin || null,
    notas: opcional(d.notas),
  }));
}

export type GerenteDraft = { nombre: string; telefono: string };
export type GerenteValido = { nombre: string; telefono: string | null };

export function validateGerente(d: GerenteDraft): Result<GerenteValido, keyof GerenteDraft> {
  const errors: Errors<keyof GerenteDraft> = {};
  if (!d.nombre.trim()) errors.nombre = "Indica el nombre";
  return finish(errors, () => ({ nombre: d.nombre.trim(), telefono: opcional(d.telefono) }));
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `pnpm test src/domain`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat(domain): fechas, errores de dominio y validación de formularios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `domain/campanaView.ts`: saldos, resúmenes y filtros

**Files:**
- Create: `src/domain/campanaView.ts`
- Test: `src/domain/campanaView.test.ts`

**Interfaces:**
- Consumes: `toUsd` (Task 2).
- Produces:
  - `AsignacionData { id: number; gerenteId: number; gerenteNombre: string; saldoUsd: string }`
  - `DepositoData { id; asignacionId; fecha; creadoEn; banco; referencia; cuentaDestino; montoBs; tasaId; tasaValor; observaciones: string | null; imagenPath: string | null }`
  - `DepositoCalculado = DepositoData & { gerenteId: number; gerenteNombre: string; usd: string; saldoGerenteRestante: string; saldoGeneralRestante: string }`
  - `Resumen { asignado; pagado; restante /* strings con 2 decimales */; ratio: number /* real, puede ser > 1 */; pct: number /* 0–100, 1 decimal */; cantidad: number; ultimaFecha: string | null }`
  - `GerenteResumen = Resumen & { asignacionId: number; gerenteId: number; gerenteNombre: string }`
  - `CampanaView { total: Resumen; gerentes: GerenteResumen[]; depositos: DepositoCalculado[] /* orden cronológico */ }`
  - `compareCronologico(a, b): number` (por fecha, luego `creadoEn`, luego `id`).
  - `calcResumen(asignado: Decimal.Value, usds: string[], fechas: string[]): Resumen`
  - `buildCampanaView(asignaciones: AsignacionData[], depositos: DepositoData[]): CampanaView`
  - `FiltroDepositos { gerenteId?: number | null; banco?: string | null; desde?: string | null; hasta?: string | null }`
  - `FilaDeposito = DepositoCalculado & { saldoMostrado: string }`
  - `filtrarDepositos(depositos: DepositoCalculado[], f: FiltroDepositos): { filas: FilaDeposito[]; totalBs: string; totalUsd: string; cantidad: number }`

- [ ] **Step 1: Escribir las pruebas**

`src/domain/campanaView.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { buildCampanaView, filtrarDepositos, type AsignacionData, type DepositoData } from "./campanaView";

const asig = (id: number, gerenteId: number, gerenteNombre: string, saldoUsd: string): AsignacionData => ({ id, gerenteId, gerenteNombre, saldoUsd });

let seq = 0;
beforeEach(() => {
  seq = 0;
});
type DepIn = Partial<DepositoData> & Pick<DepositoData, "asignacionId" | "fecha" | "montoBs" | "tasaValor">;
const dep = (o: DepIn): DepositoData => {
  seq += 1;
  return {
    id: seq,
    creadoEn: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    banco: "Banesco",
    referencia: `REF${seq}`,
    cuentaDestino: "0102",
    tasaId: 1,
    observaciones: null,
    imagenPath: null,
    ...o,
  };
};

describe("buildCampanaView", () => {
  it("calcula usd y saldos por gerente y general en orden cronológico", () => {
    const asignaciones = [asig(1, 10, "Ana", "100"), asig(2, 20, "Luis", "50")];
    const d1 = dep({ asignacionId: 1, fecha: "2026-03-02", montoBs: "3650", tasaValor: "36.5" }); // 100
    const d2 = dep({ asignacionId: 2, fecha: "2026-03-01", montoBs: "730", tasaValor: "36.5" }); // 20
    const d3 = dep({ asignacionId: 2, fecha: "2026-03-03", montoBs: "400", tasaValor: "40" }); // 10
    const v = buildCampanaView(asignaciones, [d1, d2, d3]);

    expect(v.depositos.map((d) => d.id)).toEqual([d2.id, d1.id, d3.id]);
    expect(v.depositos.map((d) => d.usd)).toEqual(["20.00", "100.00", "10.00"]);
    expect(v.depositos.map((d) => d.saldoGeneralRestante)).toEqual(["130.00", "30.00", "20.00"]);
    expect(v.depositos.map((d) => d.saldoGerenteRestante)).toEqual(["30.00", "0.00", "20.00"]);
    expect(v.depositos[0]).toMatchObject({ gerenteNombre: "Luis", gerenteId: 20 });

    expect(v.total).toMatchObject({ asignado: "150.00", pagado: "130.00", restante: "20.00", pct: 86.7, cantidad: 3, ultimaFecha: "2026-03-03" });
    expect(v.total.ratio).toBeCloseTo(130 / 150, 10);

    expect(v.gerentes.find((g) => g.asignacionId === 1)).toMatchObject({
      gerenteNombre: "Ana",
      asignado: "100.00",
      pagado: "100.00",
      restante: "0.00",
      pct: 100,
      cantidad: 1,
      ultimaFecha: "2026-03-02",
    });
  });

  it("misma fecha: desempata por creadoEn y luego por id", () => {
    const a = [asig(1, 10, "Ana", "100")];
    const x = dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "10", tasaValor: "1", creadoEn: "2026-03-01T10:00:00.000Z" });
    const y = dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "20", tasaValor: "1", creadoEn: "2026-03-01T09:00:00.000Z" });
    const z = dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "30", tasaValor: "1", creadoEn: "2026-03-01T09:00:00.000Z" });
    expect(buildCampanaView(a, [x, z, y]).depositos.map((d) => d.id)).toEqual([y.id, z.id, x.id]);
  });

  it("pago de más: restante negativo, pct limitado a 100 y ratio real", () => {
    const v = buildCampanaView([asig(1, 10, "Ana", "10")], [dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "15", tasaValor: "1" })]);
    expect(v.gerentes[0]).toMatchObject({ restante: "-5.00", pct: 100, ratio: 1.5 });
    expect(v.depositos[0].saldoGerenteRestante).toBe("-5.00");
  });

  it("gerente sin depósitos y campaña vacía", () => {
    const v = buildCampanaView([asig(1, 10, "Ana", "80")], []);
    expect(v.gerentes[0]).toMatchObject({ pagado: "0.00", restante: "80.00", pct: 0, ratio: 0, cantidad: 0, ultimaFecha: null });
    expect(buildCampanaView([], []).total).toEqual({ asignado: "0.00", pagado: "0.00", restante: "0.00", ratio: 0, pct: 0, cantidad: 0, ultimaFecha: null });
  });

  it("falla si un depósito apunta a una asignación desconocida", () => {
    expect(() => buildCampanaView([], [dep({ asignacionId: 99, fecha: "2026-03-01", montoBs: "1", tasaValor: "1" })])).toThrow(/asignación desconocida/);
  });
});

describe("filtrarDepositos", () => {
  const asignaciones = [asig(1, 10, "Ana", "100"), asig(2, 20, "Luis", "100")];
  const build = () =>
    buildCampanaView(asignaciones, [
      dep({ asignacionId: 1, fecha: "2026-03-01", montoBs: "10", tasaValor: "1", banco: "Banesco" }),
      dep({ asignacionId: 2, fecha: "2026-03-02", montoBs: "20", tasaValor: "1", banco: "Mercantil" }),
      dep({ asignacionId: 1, fecha: "2026-03-03", montoBs: "30", tasaValor: "1", banco: " banesco " }),
    ]);

  it("sin filtro muestra el saldo general", () => {
    const r = filtrarDepositos(build().depositos, {});
    expect(r.filas.map((f) => f.saldoMostrado)).toEqual(["190.00", "170.00", "140.00"]);
    expect(r).toMatchObject({ totalBs: "60.00", totalUsd: "60.00", cantidad: 3 });
  });

  it("filtrando por gerente muestra el saldo del gerente", () => {
    const r = filtrarDepositos(build().depositos, { gerenteId: 10 });
    expect(r.filas.map((f) => f.saldoMostrado)).toEqual(["90.00", "60.00"]);
    expect(r.totalUsd).toBe("40.00");
  });

  it("banco sin distinguir mayúsculas ni espacios y rango de fechas inclusivo", () => {
    expect(filtrarDepositos(build().depositos, { banco: "BANESCO" }).cantidad).toBe(2);
    expect(filtrarDepositos(build().depositos, { desde: "2026-03-02", hasta: "2026-03-03" }).cantidad).toBe(2);
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `pnpm test src/domain/campanaView.test.ts`
Expected: FAIL con `Failed to resolve import "./campanaView"`

- [ ] **Step 3: Implementar**

`src/domain/campanaView.ts`:

```ts
import Decimal from "decimal.js";
import { toUsd } from "./money";

export type AsignacionData = { id: number; gerenteId: number; gerenteNombre: string; saldoUsd: string };

export type DepositoData = {
  id: number;
  asignacionId: number;
  fecha: string;
  creadoEn: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  tasaId: number;
  tasaValor: string;
  observaciones: string | null;
  imagenPath: string | null;
};

export type DepositoCalculado = DepositoData & {
  gerenteId: number;
  gerenteNombre: string;
  usd: string;
  saldoGerenteRestante: string;
  saldoGeneralRestante: string;
};

export type Resumen = {
  asignado: string;
  pagado: string;
  restante: string;
  ratio: number;
  pct: number;
  cantidad: number;
  ultimaFecha: string | null;
};

export type GerenteResumen = Resumen & { asignacionId: number; gerenteId: number; gerenteNombre: string };

export type CampanaView = { total: Resumen; gerentes: GerenteResumen[]; depositos: DepositoCalculado[] };

type Ordenable = Pick<DepositoData, "fecha" | "creadoEn" | "id">;

export function compareCronologico(a: Ordenable, b: Ordenable): number {
  return a.fecha.localeCompare(b.fecha) || a.creadoEn.localeCompare(b.creadoEn) || a.id - b.id;
}

export function calcResumen(asignado: Decimal.Value, usds: string[], fechas: string[]): Resumen {
  const asig = new Decimal(asignado);
  const pagado = usds.reduce((acc, u) => acc.plus(u), new Decimal(0));
  const ratio = asig.gt(0) ? pagado.div(asig) : new Decimal(0);
  const pct = Decimal.min(Decimal.max(ratio.times(100), 0), 100).toDecimalPlaces(1).toNumber();
  return {
    asignado: asig.toFixed(2),
    pagado: pagado.toFixed(2),
    restante: asig.minus(pagado).toFixed(2),
    ratio: ratio.toNumber(),
    pct,
    cantidad: usds.length,
    ultimaFecha: fechas.length > 0 ? fechas.reduce((max, f) => (f > max ? f : max)) : null,
  };
}

export function buildCampanaView(asignaciones: AsignacionData[], depositos: DepositoData[]): CampanaView {
  const porId = new Map(asignaciones.map((a) => [a.id, a]));
  const restantePorAsignacion = new Map(asignaciones.map((a) => [a.id, new Decimal(a.saldoUsd)]));
  const totalAsignado = asignaciones.reduce((acc, a) => acc.plus(a.saldoUsd), new Decimal(0));
  let restanteGeneral = totalAsignado;

  const calculados: DepositoCalculado[] = [...depositos].sort(compareCronologico).map((d) => {
    const a = porId.get(d.asignacionId);
    if (!a) throw new Error(`Depósito ${d.id} con asignación desconocida ${d.asignacionId}`);
    const usd = toUsd(d.montoBs, d.tasaValor);
    const restanteGerente = (restantePorAsignacion.get(a.id) as Decimal).minus(usd);
    restantePorAsignacion.set(a.id, restanteGerente);
    restanteGeneral = restanteGeneral.minus(usd);
    return {
      ...d,
      gerenteId: a.gerenteId,
      gerenteNombre: a.gerenteNombre,
      usd,
      saldoGerenteRestante: restanteGerente.toFixed(2),
      saldoGeneralRestante: restanteGeneral.toFixed(2),
    };
  });

  const gerentes: GerenteResumen[] = asignaciones.map((a) => {
    const propios = calculados.filter((d) => d.asignacionId === a.id);
    return {
      asignacionId: a.id,
      gerenteId: a.gerenteId,
      gerenteNombre: a.gerenteNombre,
      ...calcResumen(a.saldoUsd, propios.map((d) => d.usd), propios.map((d) => d.fecha)),
    };
  });

  return {
    total: calcResumen(totalAsignado, calculados.map((d) => d.usd), calculados.map((d) => d.fecha)),
    gerentes,
    depositos: calculados,
  };
}

export type FiltroDepositos = { gerenteId?: number | null; banco?: string | null; desde?: string | null; hasta?: string | null };
export type FilaDeposito = DepositoCalculado & { saldoMostrado: string };

export function filtrarDepositos(
  depositos: DepositoCalculado[],
  f: FiltroDepositos,
): { filas: FilaDeposito[]; totalBs: string; totalUsd: string; cantidad: number } {
  const banco = f.banco?.trim().toLowerCase() || null;
  const porGerente = f.gerenteId != null;
  const filas = depositos
    .filter(
      (d) =>
        (!porGerente || d.gerenteId === f.gerenteId) &&
        (!banco || d.banco.trim().toLowerCase() === banco) &&
        (!f.desde || d.fecha >= f.desde) &&
        (!f.hasta || d.fecha <= f.hasta),
    )
    .map((d) => ({ ...d, saldoMostrado: porGerente ? d.saldoGerenteRestante : d.saldoGeneralRestante }));
  const sum = (key: "montoBs" | "usd") => filas.reduce((acc, d) => acc.plus(d[key]), new Decimal(0)).toFixed(2);
  return { filas, totalBs: sum("montoBs"), totalUsd: sum("usd"), cantidad: filas.length };
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `pnpm test src/domain`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat(domain): saldos acumulados por gerente y por campaña, resúmenes y filtros

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `SqlDriver`, driver de pruebas con sql.js y migraciones

**Files:**
- Create: `src/db/driver.ts`, `src/db/clock.ts`, `src/db/migrations.ts`, `src/db/testing/sqljsDriver.ts`
- Test: `src/db/migrations.test.ts`

**Interfaces:**
- Produces:
  - `type SqlValue = string | number | null`
  - `interface SqlDriver { execute(sql: string, params?: SqlValue[]): Promise<{ lastInsertId: number; rowsAffected: number }>; select<T>(sql: string, params?: SqlValue[]): Promise<T[]> }`. En SQL **solo** se usan parámetros posicionales `?`.
  - `nowIso(): string`
  - `migrate(db: SqlDriver): Promise<void>` y `SCHEMA_VERSION = 1`
  - `createMemoryDriver(): Promise<SqlDriver>`: incluye `PRAGMA foreign_keys = ON`.
  - `createTestDb(): Promise<SqlDriver>`: driver en memoria ya migrado.

- [ ] **Step 1: Escribir las pruebas**

`src/db/migrations.test.ts`:

```ts
import { expect, it } from "vitest";
import { createMemoryDriver } from "./testing/sqljsDriver";
import { migrate, SCHEMA_VERSION } from "./migrations";

it("crea el esquema y fija user_version", async () => {
  const db = await createMemoryDriver();
  await migrate(db);
  const [{ user_version }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  expect(user_version).toBe(SCHEMA_VERSION);
  const tablas = await db.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite%' ORDER BY name",
  );
  expect(tablas.map((t) => t.name)).toEqual(["asignaciones", "campanas", "depositos", "gerentes", "tasas"]);
});

it("es idempotente", async () => {
  const db = await createMemoryDriver();
  await migrate(db);
  await expect(migrate(db)).resolves.toBeUndefined();
});

it("aplica claves foráneas y unicidad", async () => {
  const db = await createMemoryDriver();
  await migrate(db);
  await expect(db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd) VALUES (99, 99, '1')")).rejects.toThrow(/FOREIGN KEY/);
  await db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-03-01', '36.5')");
  await expect(db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-03-01', '40')")).rejects.toThrow(/UNIQUE/);
});

it("execute devuelve lastInsertId y rowsAffected", async () => {
  const db = await createMemoryDriver();
  await migrate(db);
  const r = await db.execute("INSERT INTO gerentes (nombre, creado_en) VALUES (?, ?)", ["Ana", "2026-01-01T00:00:00.000Z"]);
  expect(r).toEqual({ lastInsertId: 1, rowsAffected: 1 });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `pnpm test src/db`
Expected: FAIL. No se resuelven `./testing/sqljsDriver` ni `./migrations`.

- [ ] **Step 3: Implementar**

`src/db/driver.ts`:

```ts
export type SqlValue = string | number | null;

/** Acceso mínimo a SQLite. Usar solo parámetros posicionales `?`. */
export interface SqlDriver {
  execute(sql: string, params?: SqlValue[]): Promise<{ lastInsertId: number; rowsAffected: number }>;
  select<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
}
```

`src/db/clock.ts`:

```ts
export const nowIso = (): string => new Date().toISOString();
```

`src/db/migrations.ts`:

```ts
import type { SqlDriver } from "./driver";

type Migration = { version: number; statements: string[] };

/** Cada sentencia va por separado: el driver de Tauri ejecuta una sentencia por llamada. */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS gerentes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT,
        activo INTEGER NOT NULL DEFAULT 1,
        creado_en TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS campanas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT,
        estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cerrada')),
        notas TEXT,
        creado_en TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS asignaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campana_id INTEGER NOT NULL REFERENCES campanas(id) ON DELETE RESTRICT,
        gerente_id INTEGER NOT NULL REFERENCES gerentes(id) ON DELETE RESTRICT,
        saldo_usd TEXT NOT NULL,
        UNIQUE (campana_id, gerente_id)
      )`,
      `CREATE TABLE IF NOT EXISTS tasas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL UNIQUE,
        valor TEXT NOT NULL,
        imagen_path TEXT,
        notas TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS depositos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asignacion_id INTEGER NOT NULL REFERENCES asignaciones(id) ON DELETE RESTRICT,
        tasa_id INTEGER NOT NULL REFERENCES tasas(id) ON DELETE RESTRICT,
        fecha TEXT NOT NULL,
        banco TEXT NOT NULL,
        referencia TEXT NOT NULL,
        cuenta_destino TEXT NOT NULL,
        monto_bs TEXT NOT NULL,
        observaciones TEXT,
        imagen_path TEXT,
        creado_en TEXT NOT NULL,
        actualizado_en TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS idx_depositos_asignacion ON depositos(asignacion_id)",
      "CREATE INDEX IF NOT EXISTS idx_depositos_tasa ON depositos(tasa_id)",
      "CREATE INDEX IF NOT EXISTS idx_depositos_referencia ON depositos(referencia)",
    ],
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function migrate(db: SqlDriver): Promise<void> {
  const [{ user_version: current }] = await db.select<{ user_version: number }>("PRAGMA user_version");
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    for (const sql of m.statements) await db.execute(sql);
    await db.execute(`PRAGMA user_version = ${m.version}`);
  }
}
```

`src/db/testing/sqljsDriver.ts`:

```ts
import initSqlJs from "sql.js";
import type { SqlDriver, SqlValue } from "../driver";
import { migrate } from "../migrations";

export async function createMemoryDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      db.run(sql, params);
      const rowsAffected = db.getRowsModified();
      const lastInsertId = Number(db.exec("SELECT last_insert_rowid()")[0].values[0][0]);
      return { lastInsertId, rowsAffected };
    },
    async select<T>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
  };
}

export async function createTestDb(): Promise<SqlDriver> {
  const db = await createMemoryDriver();
  await migrate(db);
  return db;
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `pnpm test src/db`
Expected: PASS (4 pruebas)

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat(db): interfaz SqlDriver, driver sql.js para pruebas y migración inicial

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Repositorios de gerentes, campañas y asignaciones

**Files:**
- Create: `src/db/repos/gerentes.ts`, `src/db/repos/campanas.ts`, `src/db/repos/asignaciones.ts`
- Test: `src/db/repos/gerentes.test.ts`, `src/db/repos/campanas.test.ts`, `src/db/repos/asignaciones.test.ts`

**Interfaces:**
- Consumes: `SqlDriver`, `nowIso`, `createTestDb` (Task 5); `GerenteValido`, `CampanaValida` (Task 3); `DomainError` (Task 3).
- Produces:
  - `gerentes.ts`:
    - `type Gerente = { id: number; nombre: string; telefono: string | null; activo: boolean; creadoEn: string }`
    - `type GerenteConCampanas = Gerente & { campanas: string[] }`
    - `listGerentes(db, opts?: { soloActivos?: boolean }): Promise<Gerente[]>` (orden por nombre, sin distinguir mayúsculas)
    - `listGerentesConCampanas(db): Promise<GerenteConCampanas[]>`
    - `getGerente(db, id): Promise<Gerente | null>`
    - `createGerente(db, v: GerenteValido): Promise<number>`
    - `updateGerente(db, id, v: GerenteValido): Promise<void>`
    - `setGerenteActivo(db, id, activo: boolean): Promise<void>`
  - `campanas.ts`:
    - `type EstadoCampana = 'activa' | 'cerrada'`
    - `type Campana = { id; nombre; fechaInicio; fechaFin: string | null; estado: EstadoCampana; notas: string | null; creadoEn }`
    - `listCampanas(db): Promise<Campana[]>` (por `fecha_inicio` descendente)
    - `getCampana(db, id): Promise<Campana | null>`
    - `createCampana(db, v: CampanaValida): Promise<number>`
    - `updateCampana(db, id, v: CampanaValida): Promise<void>`: lanza `CAMPANA_CERRADA` si la campaña está cerrada.
    - `setEstadoCampana(db, id, estado: EstadoCampana): Promise<void>`
    - `assertCampanaActiva(db, campanaId): Promise<Campana>`: lanza `NO_ENCONTRADO` o `CAMPANA_CERRADA`.
  - `asignaciones.ts`:
    - `type AsignacionDetalle = { id; campanaId; gerenteId; saldoUsd: string; gerenteNombre: string; campanaNombre: string; campanaEstado: EstadoCampana }`
    - `getAsignacion(db, id): Promise<AsignacionDetalle | null>`
    - `createAsignacion(db, v: { campanaId: number; gerenteId: number; saldoUsd: string }): Promise<number>`: lanza `DUPLICADO` o `CAMPANA_CERRADA`.
    - `updateSaldoAsignacion(db, id, saldoUsd: string): Promise<void>`: lanza `CAMPANA_CERRADA`.
    - `deleteAsignacion(db, id): Promise<void>`: si tiene depósitos lanza `VALIDACION`; si la campaña está cerrada, `CAMPANA_CERRADA`.

- [ ] **Step 1: Escribir las pruebas**

`src/db/repos/gerentes.test.ts`:

```ts
import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { createGerente, getGerente, listGerentes, listGerentesConCampanas, setGerenteActivo, updateGerente } from "./gerentes";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("crea, lista ordenado y obtiene", async () => {
  const luis = await createGerente(db, { nombre: "luis", telefono: null });
  await createGerente(db, { nombre: "Ana", telefono: "0414-1234567" });
  expect((await listGerentes(db)).map((g) => g.nombre)).toEqual(["Ana", "luis"]);
  expect(await getGerente(db, luis)).toMatchObject({ id: luis, nombre: "luis", telefono: null, activo: true });
  expect(await getGerente(db, 999)).toBeNull();
});

it("actualiza y desactiva", async () => {
  const id = await createGerente(db, { nombre: "Ana", telefono: null });
  await updateGerente(db, id, { nombre: "Ana María", telefono: "0412" });
  await setGerenteActivo(db, id, false);
  expect(await getGerente(db, id)).toMatchObject({ nombre: "Ana María", telefono: "0412", activo: false });
  expect(await listGerentes(db, { soloActivos: true })).toEqual([]);
});

it("lista las campañas de cada gerente", async () => {
  const ana = await createGerente(db, { nombre: "Ana", telefono: null });
  await createGerente(db, { nombre: "Luis", telefono: null });
  await db.execute("INSERT INTO campanas (nombre, fecha_inicio, creado_en) VALUES ('Marzo, 2026', '2026-03-01', 'x'), ('Abril', '2026-04-01', 'x')");
  await db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd) VALUES (1, ?, '10'), (2, ?, '10')", [ana, ana]);
  const r = await listGerentesConCampanas(db);
  expect(r.find((g) => g.id === ana)?.campanas.sort()).toEqual(["Abril", "Marzo, 2026"]);
  expect(r.find((g) => g.nombre === "Luis")?.campanas).toEqual([]);
});
```

`src/db/repos/campanas.test.ts`:

```ts
import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { assertCampanaActiva, createCampana, getCampana, listCampanas, setEstadoCampana, updateCampana } from "./campanas";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

const base = { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null };

it("crea, lista por fecha de inicio descendente y obtiene", async () => {
  const marzo = await createCampana(db, base);
  await createCampana(db, { ...base, nombre: "Abril", fechaInicio: "2026-04-01" });
  expect((await listCampanas(db)).map((c) => c.nombre)).toEqual(["Abril", "Marzo"]);
  expect(await getCampana(db, marzo)).toMatchObject({ nombre: "Marzo", estado: "activa", fechaFin: null });
});

it("actualiza y cambia de estado", async () => {
  const id = await createCampana(db, base);
  await updateCampana(db, id, { ...base, nombre: "Marzo 2026", fechaFin: "2026-03-31", notas: "n" });
  await setEstadoCampana(db, id, "cerrada");
  expect(await getCampana(db, id)).toMatchObject({ nombre: "Marzo 2026", fechaFin: "2026-03-31", notas: "n", estado: "cerrada" });
});

it("una campaña cerrada no se puede editar", async () => {
  const id = await createCampana(db, base);
  await setEstadoCampana(db, id, "cerrada");
  await expect(updateCampana(db, id, base)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(assertCampanaActiva(db, id)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(assertCampanaActiva(db, 999)).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
});
```

`src/db/repos/asignaciones.test.ts`:

```ts
import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { createCampana, setEstadoCampana } from "./campanas";
import { createGerente } from "./gerentes";
import { createAsignacion, deleteAsignacion, getAsignacion, updateSaldoAsignacion } from "./asignaciones";

let db: SqlDriver;
let campanaId: number;
let anaId: number;
beforeEach(async () => {
  db = await createTestDb();
  campanaId = await createCampana(db, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  anaId = await createGerente(db, { nombre: "Ana", telefono: null });
});

it("crea y obtiene con detalle", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  expect(await getAsignacion(db, id)).toEqual({
    id,
    campanaId,
    gerenteId: anaId,
    saldoUsd: "100",
    gerenteNombre: "Ana",
    campanaNombre: "Marzo",
    campanaEstado: "activa",
  });
});

it("no permite el mismo gerente dos veces en una campaña", async () => {
  await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await expect(createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "5" })).rejects.toMatchObject({ code: "DUPLICADO" });
});

it("actualiza el saldo y rechaza cambios en una campaña cerrada", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await updateSaldoAsignacion(db, id, "150.5");
  expect((await getAsignacion(db, id))?.saldoUsd).toBe("150.5");
  await setEstadoCampana(db, campanaId, "cerrada");
  await expect(updateSaldoAsignacion(db, id, "1")).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  await expect(createAsignacion(db, { campanaId, gerenteId: luis, saldoUsd: "1" })).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

it("solo quita gerentes sin depósitos", async () => {
  const id = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  await db.execute("INSERT INTO tasas (fecha, valor) VALUES ('2026-03-01', '36.5')");
  await db.execute(
    "INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, creado_en, actualizado_en) VALUES (?, 1, '2026-03-01', 'B', 'R', 'C', '10', 'x', 'x')",
    [id],
  );
  await expect(deleteAsignacion(db, id)).rejects.toMatchObject({ code: "VALIDACION" });
  await db.execute("DELETE FROM depositos");
  await deleteAsignacion(db, id);
  expect(await getAsignacion(db, id)).toBeNull();
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `pnpm test src/db/repos`
Expected: FAIL. No se resuelven `./gerentes`, `./campanas` ni `./asignaciones`.

- [ ] **Step 3: Implementar**

`src/db/repos/gerentes.ts`:

```ts
import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import type { GerenteValido } from "@/domain/validation";

export type Gerente = { id: number; nombre: string; telefono: string | null; activo: boolean; creadoEn: string };
export type GerenteConCampanas = Gerente & { campanas: string[] };

type Row = Omit<Gerente, "activo"> & { activo: number };
const COLS = "g.id, g.nombre, g.telefono, g.activo, g.creado_en AS creadoEn";
const toGerente = ({ id, nombre, telefono, activo, creadoEn }: Row): Gerente => ({ id, nombre, telefono, activo: activo === 1, creadoEn });
const SEP = "\u001f";

export async function listGerentes(db: SqlDriver, opts: { soloActivos?: boolean } = {}): Promise<Gerente[]> {
  const where = opts.soloActivos ? "WHERE g.activo = 1" : "";
  const rows = await db.select<Row>(`SELECT ${COLS} FROM gerentes g ${where} ORDER BY g.nombre COLLATE NOCASE`);
  return rows.map(toGerente);
}

export async function listGerentesConCampanas(db: SqlDriver): Promise<GerenteConCampanas[]> {
  const rows = await db.select<Row & { campanas: string | null }>(
    `SELECT ${COLS},
       (SELECT group_concat(c.nombre, char(31)) FROM asignaciones a JOIN campanas c ON c.id = a.campana_id WHERE a.gerente_id = g.id) AS campanas
     FROM gerentes g ORDER BY g.nombre COLLATE NOCASE`,
  );
  return rows.map((r) => ({ ...toGerente(r), campanas: r.campanas ? r.campanas.split(SEP) : [] }));
}

export async function getGerente(db: SqlDriver, id: number): Promise<Gerente | null> {
  const [row] = await db.select<Row>(`SELECT ${COLS} FROM gerentes g WHERE g.id = ?`, [id]);
  return row ? toGerente(row) : null;
}

export async function createGerente(db: SqlDriver, v: GerenteValido): Promise<number> {
  const r = await db.execute("INSERT INTO gerentes (nombre, telefono, activo, creado_en) VALUES (?, ?, 1, ?)", [v.nombre, v.telefono, nowIso()]);
  return r.lastInsertId;
}

export async function updateGerente(db: SqlDriver, id: number, v: GerenteValido): Promise<void> {
  await db.execute("UPDATE gerentes SET nombre = ?, telefono = ? WHERE id = ?", [v.nombre, v.telefono, id]);
}

export async function setGerenteActivo(db: SqlDriver, id: number, activo: boolean): Promise<void> {
  await db.execute("UPDATE gerentes SET activo = ? WHERE id = ?", [activo ? 1 : 0, id]);
}
```

`src/db/repos/campanas.ts`:

```ts
import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import type { CampanaValida } from "@/domain/validation";
import { DomainError } from "@/domain/errors";

export type EstadoCampana = "activa" | "cerrada";
export type Campana = {
  id: number;
  nombre: string;
  fechaInicio: string;
  fechaFin: string | null;
  estado: EstadoCampana;
  notas: string | null;
  creadoEn: string;
};

const SEL = "SELECT id, nombre, fecha_inicio AS fechaInicio, fecha_fin AS fechaFin, estado, notas, creado_en AS creadoEn FROM campanas";

export async function listCampanas(db: SqlDriver): Promise<Campana[]> {
  return db.select<Campana>(`${SEL} ORDER BY fecha_inicio DESC, id DESC`);
}

export async function getCampana(db: SqlDriver, id: number): Promise<Campana | null> {
  const [row] = await db.select<Campana>(`${SEL} WHERE id = ?`, [id]);
  return row ?? null;
}

export async function assertCampanaActiva(db: SqlDriver, campanaId: number): Promise<Campana> {
  const c = await getCampana(db, campanaId);
  if (!c) throw new DomainError("NO_ENCONTRADO", "La campaña no existe");
  if (c.estado === "cerrada") throw new DomainError("CAMPANA_CERRADA", "La campaña está cerrada; no se puede modificar");
  return c;
}

export async function createCampana(db: SqlDriver, v: CampanaValida): Promise<number> {
  const r = await db.execute(
    "INSERT INTO campanas (nombre, fecha_inicio, fecha_fin, estado, notas, creado_en) VALUES (?, ?, ?, 'activa', ?, ?)",
    [v.nombre, v.fechaInicio, v.fechaFin, v.notas, nowIso()],
  );
  return r.lastInsertId;
}

export async function updateCampana(db: SqlDriver, id: number, v: CampanaValida): Promise<void> {
  await assertCampanaActiva(db, id);
  await db.execute("UPDATE campanas SET nombre = ?, fecha_inicio = ?, fecha_fin = ?, notas = ? WHERE id = ?", [
    v.nombre,
    v.fechaInicio,
    v.fechaFin,
    v.notas,
    id,
  ]);
}

export async function setEstadoCampana(db: SqlDriver, id: number, estado: EstadoCampana): Promise<void> {
  await db.execute("UPDATE campanas SET estado = ? WHERE id = ?", [estado, id]);
}
```

`src/db/repos/asignaciones.ts`:

```ts
import type { SqlDriver } from "../driver";
import { assertCampanaActiva, type EstadoCampana } from "./campanas";
import { DomainError } from "@/domain/errors";

export type AsignacionDetalle = {
  id: number;
  campanaId: number;
  gerenteId: number;
  saldoUsd: string;
  gerenteNombre: string;
  campanaNombre: string;
  campanaEstado: EstadoCampana;
};

export async function getAsignacion(db: SqlDriver, id: number): Promise<AsignacionDetalle | null> {
  const [row] = await db.select<AsignacionDetalle>(
    `SELECT a.id, a.campana_id AS campanaId, a.gerente_id AS gerenteId, a.saldo_usd AS saldoUsd,
            g.nombre AS gerenteNombre, c.nombre AS campanaNombre, c.estado AS campanaEstado
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id JOIN campanas c ON c.id = a.campana_id
     WHERE a.id = ?`,
    [id],
  );
  return row ?? null;
}

async function requireAsignacion(db: SqlDriver, id: number): Promise<AsignacionDetalle> {
  const a = await getAsignacion(db, id);
  if (!a) throw new DomainError("NO_ENCONTRADO", "La asignación no existe");
  return a;
}

export async function createAsignacion(db: SqlDriver, v: { campanaId: number; gerenteId: number; saldoUsd: string }): Promise<number> {
  await assertCampanaActiva(db, v.campanaId);
  const [dup] = await db.select<{ id: number }>("SELECT id FROM asignaciones WHERE campana_id = ? AND gerente_id = ?", [v.campanaId, v.gerenteId]);
  if (dup) throw new DomainError("DUPLICADO", "Este gerente ya está en la campaña");
  const r = await db.execute("INSERT INTO asignaciones (campana_id, gerente_id, saldo_usd) VALUES (?, ?, ?)", [v.campanaId, v.gerenteId, v.saldoUsd]);
  return r.lastInsertId;
}

export async function updateSaldoAsignacion(db: SqlDriver, id: number, saldoUsd: string): Promise<void> {
  const a = await requireAsignacion(db, id);
  await assertCampanaActiva(db, a.campanaId);
  await db.execute("UPDATE asignaciones SET saldo_usd = ? WHERE id = ?", [saldoUsd, id]);
}

export async function deleteAsignacion(db: SqlDriver, id: number): Promise<void> {
  const a = await requireAsignacion(db, id);
  await assertCampanaActiva(db, a.campanaId);
  const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos WHERE asignacion_id = ?", [id]);
  if (n > 0) throw new DomainError("VALIDACION", "No se puede quitar: el gerente tiene depósitos en esta campaña");
  await db.execute("DELETE FROM asignaciones WHERE id = ?", [id]);
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `pnpm test src/db`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat(db): repositorios de gerentes, campañas y asignaciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Repositorios de tasas y depósitos

**Files:**
- Create: `src/db/repos/tasas.ts`, `src/db/repos/depositos.ts`, `src/db/testing/fixtures.ts`
- Test: `src/db/repos/tasas.test.ts`, `src/db/repos/depositos.test.ts`

**Interfaces:**
- Consumes: Task 5 y Task 6; `TasaValida`, `DepositoValido`, `formatFecha`, `DomainError` (Task 3).
- Produces:
  - `tasas.ts`:
    - `type Tasa = { id: number; fecha: string; valor: string; imagenPath: string | null; notas: string | null }`
    - `type TasaConUsos = Tasa & { usos: number }`
    - `listTasas(db): Promise<TasaConUsos[]>` (por fecha descendente)
    - `getTasa(db, id): Promise<Tasa | null>` · `getTasaByFecha(db, fecha): Promise<Tasa | null>`
    - `createTasa(db, v: TasaValida & { imagenPath: string | null }): Promise<number>`: lanza `DUPLICADO` si ya existe esa fecha.
    - `updateTasa(db, id, v: { valor: string; notas: string | null; imagenPath: string | null }): Promise<void>`: la fecha no se cambia.
    - `countUsosTasa(db, id): Promise<number>`
    - `deleteTasa(db, id): Promise<void>`: lanza `TASA_EN_USO`.
  - `depositos.ts`:
    - `type Deposito = { id; asignacionId; tasaId; fecha; banco; referencia; cuentaDestino; montoBs; observaciones: string | null; imagenPath: string | null; creadoEn; actualizadoEn }`
    - `type DepositoGuardar = DepositoValido & { imagenPath: string | null }`
    - `type Duplicado = { id: number; fecha: string; montoBs: string; gerenteNombre: string; campanaNombre: string }`
    - `getDeposito(db, id): Promise<Deposito | null>`
    - `createDeposito(db, asignacionId, v: DepositoGuardar): Promise<number>`
    - `updateDeposito(db, id, v: DepositoGuardar): Promise<void>`: la asignación no cambia.
    - `deleteDeposito(db, id): Promise<void>`
    - `findDuplicados(db, banco, referencia, excludeId?: number): Promise<Duplicado[]>`: compara sin distinguir mayúsculas e ignorando espacios al inicio y al final.
    - `listBancosUsados(db): Promise<string[]>`
    - `createDeposito`/`updateDeposito`/`deleteDeposito` lanzan `CAMPANA_CERRADA`. Crear y actualizar también lanzan `VALIDACION` si `tasa.fecha !== v.fecha` o si la tasa no existe.
  - `fixtures.ts`:
    - `seedBasico(db): Promise<{ campanaId; anaId; asignacionId; tasaId }>` (campaña "Marzo"; Ana con saldo de 100 USD; tasa del 2026-03-02 = 36.5)
    - `depositoBase(tasaId, o?): DepositoGuardar`

- [ ] **Step 1: Escribir las pruebas**

`src/db/testing/fixtures.ts`:

```ts
import type { SqlDriver } from "../driver";
import { createCampana } from "../repos/campanas";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createTasa } from "../repos/tasas";
import type { DepositoGuardar } from "../repos/depositos";

export async function seedBasico(db: SqlDriver) {
  const campanaId = await createCampana(db, { nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, notas: null });
  const anaId = await createGerente(db, { nombre: "Ana", telefono: null });
  const asignacionId = await createAsignacion(db, { campanaId, gerenteId: anaId, saldoUsd: "100" });
  const tasaId = await createTasa(db, { fecha: "2026-03-02", valor: "36.5", notas: null, imagenPath: null });
  return { campanaId, anaId, asignacionId, tasaId };
}

export const depositoBase = (tasaId: number, o: Partial<DepositoGuardar> = {}): DepositoGuardar => ({
  fecha: "2026-03-02",
  banco: "Banesco",
  referencia: "123",
  cuentaDestino: "0102-0000-00-0000000000",
  montoBs: "3650",
  tasaId,
  observaciones: null,
  imagenPath: null,
  ...o,
});
```

`src/db/repos/tasas.test.ts`:

```ts
import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { countUsosTasa, createTasa, deleteTasa, getTasa, getTasaByFecha, listTasas, updateTasa } from "./tasas";
import { createDeposito } from "./depositos";

let db: SqlDriver;
beforeEach(async () => {
  db = await createTestDb();
});

it("crea, busca por fecha y lista con usos en orden descendente", async () => {
  const a = await createTasa(db, { fecha: "2026-03-01", valor: "36.5", notas: null, imagenPath: null });
  await createTasa(db, { fecha: "2026-03-03", valor: "37", notas: "BCV", imagenPath: "imagenes/x.png" });
  expect(await getTasaByFecha(db, "2026-03-01")).toEqual({ id: a, fecha: "2026-03-01", valor: "36.5", imagenPath: null, notas: null });
  expect(await getTasaByFecha(db, "2026-03-02")).toBeNull();
  expect((await listTasas(db)).map((t) => [t.fecha, t.usos])).toEqual([
    ["2026-03-03", 0],
    ["2026-03-01", 0],
  ]);
});

it("rechaza una segunda tasa para la misma fecha", async () => {
  await createTasa(db, { fecha: "2026-03-01", valor: "36.5", notas: null, imagenPath: null });
  await expect(createTasa(db, { fecha: "2026-03-01", valor: "40", notas: null, imagenPath: null })).rejects.toMatchObject({ code: "DUPLICADO" });
});

it("actualiza valor, notas e imagen", async () => {
  const id = await createTasa(db, { fecha: "2026-03-01", valor: "36.5", notas: null, imagenPath: null });
  await updateTasa(db, id, { valor: "36.75", notas: "corregida", imagenPath: "imagenes/t.png" });
  expect(await getTasa(db, id)).toMatchObject({ valor: "36.75", notas: "corregida", imagenPath: "imagenes/t.png", fecha: "2026-03-01" });
});

it("no borra una tasa en uso", async () => {
  const s = await seedBasico(db);
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  expect(await countUsosTasa(db, s.tasaId)).toBe(1);
  await expect(deleteTasa(db, s.tasaId)).rejects.toMatchObject({ code: "TASA_EN_USO" });
  const libre = await createTasa(db, { fecha: "2026-03-09", valor: "1", notas: null, imagenPath: null });
  await deleteTasa(db, libre);
  expect(await getTasa(db, libre)).toBeNull();
});
```

`src/db/repos/depositos.test.ts`:

```ts
import { beforeEach, expect, it } from "vitest";
import type { SqlDriver } from "../driver";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createTasa } from "./tasas";
import { setEstadoCampana } from "./campanas";
import { createDeposito, deleteDeposito, findDuplicados, getDeposito, listBancosUsados, updateDeposito } from "./depositos";

let db: SqlDriver;
let s: Awaited<ReturnType<typeof seedBasico>>;
beforeEach(async () => {
  db = await createTestDb();
  s = await seedBasico(db);
});

it("crea y obtiene", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { observaciones: "primer pago" }));
  const d = await getDeposito(db, id);
  expect(d).toMatchObject({ id, asignacionId: s.asignacionId, tasaId: s.tasaId, montoBs: "3650", observaciones: "primer pago" });
  expect(d?.creadoEn).toBe(d?.actualizadoEn);
});

it("rechaza una tasa que no es de la fecha del depósito", async () => {
  await expect(createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { fecha: "2026-03-05" }))).rejects.toMatchObject({ code: "VALIDACION" });
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await expect(updateDeposito(db, id, depositoBase(s.tasaId, { fecha: "2026-03-05" }))).rejects.toMatchObject({ code: "VALIDACION" });
  const t5 = await createTasa(db, { fecha: "2026-03-05", valor: "40", notas: null, imagenPath: null });
  await updateDeposito(db, id, depositoBase(t5, { fecha: "2026-03-05", montoBs: "4000" }));
  expect(await getDeposito(db, id)).toMatchObject({ fecha: "2026-03-05", tasaId: t5, montoBs: "4000" });
});

it("detecta duplicados sin distinguir mayúsculas ni espacios, excluyendo el propio", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banesco ", referencia: " 123 " }));
  const dups = await findDuplicados(db, "banesco", "123");
  expect(dups).toEqual([{ id, fecha: "2026-03-02", montoBs: "3650", gerenteNombre: "Ana", campanaNombre: "Marzo" }]);
  expect(await findDuplicados(db, "BANESCO", "123", id)).toEqual([]);
  expect(await findDuplicados(db, "Mercantil", "123")).toEqual([]);
});

it("bloquea cambios en campaña cerrada", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId));
  await setEstadoCampana(db, s.campanaId, "cerrada");
  await expect(createDeposito(db, s.asignacionId, depositoBase(s.tasaId))).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(updateDeposito(db, id, depositoBase(s.tasaId))).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
  await expect(deleteDeposito(db, id)).rejects.toMatchObject({ code: "CAMPANA_CERRADA" });
});

it("elimina y lista bancos usados sin repetir", async () => {
  const id = await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Mercantil" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banesco", referencia: "9" }));
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId, { banco: "Banesco", referencia: "10" }));
  expect(await listBancosUsados(db)).toEqual(["Banesco", "Mercantil"]);
  await deleteDeposito(db, id);
  expect(await getDeposito(db, id)).toBeNull();
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `pnpm test src/db/repos`
Expected: FAIL. No se resuelven `./tasas` ni `./depositos`.

- [ ] **Step 3: Implementar**

`src/db/repos/tasas.ts`:

```ts
import type { SqlDriver } from "../driver";
import type { TasaValida } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import { formatFecha } from "@/domain/dates";

export type Tasa = { id: number; fecha: string; valor: string; imagenPath: string | null; notas: string | null };
export type TasaConUsos = Tasa & { usos: number };

const COLS = "t.id, t.fecha, t.valor, t.imagen_path AS imagenPath, t.notas";

export async function listTasas(db: SqlDriver): Promise<TasaConUsos[]> {
  return db.select<TasaConUsos>(
    `SELECT ${COLS}, (SELECT COUNT(*) FROM depositos d WHERE d.tasa_id = t.id) AS usos FROM tasas t ORDER BY t.fecha DESC`,
  );
}

export async function getTasa(db: SqlDriver, id: number): Promise<Tasa | null> {
  const [row] = await db.select<Tasa>(`SELECT ${COLS} FROM tasas t WHERE t.id = ?`, [id]);
  return row ?? null;
}

export async function getTasaByFecha(db: SqlDriver, fecha: string): Promise<Tasa | null> {
  const [row] = await db.select<Tasa>(`SELECT ${COLS} FROM tasas t WHERE t.fecha = ?`, [fecha]);
  return row ?? null;
}

export async function createTasa(db: SqlDriver, v: TasaValida & { imagenPath: string | null }): Promise<number> {
  if (await getTasaByFecha(db, v.fecha)) throw new DomainError("DUPLICADO", `Ya existe una tasa para el ${formatFecha(v.fecha)}`);
  const r = await db.execute("INSERT INTO tasas (fecha, valor, imagen_path, notas) VALUES (?, ?, ?, ?)", [v.fecha, v.valor, v.imagenPath, v.notas]);
  return r.lastInsertId;
}

export async function updateTasa(db: SqlDriver, id: number, v: { valor: string; notas: string | null; imagenPath: string | null }): Promise<void> {
  await db.execute("UPDATE tasas SET valor = ?, notas = ?, imagen_path = ? WHERE id = ?", [v.valor, v.notas, v.imagenPath, id]);
}

export async function countUsosTasa(db: SqlDriver, id: number): Promise<number> {
  const [{ n }] = await db.select<{ n: number }>("SELECT COUNT(*) AS n FROM depositos WHERE tasa_id = ?", [id]);
  return n;
}

export async function deleteTasa(db: SqlDriver, id: number): Promise<void> {
  const usos = await countUsosTasa(db, id);
  if (usos > 0) throw new DomainError("TASA_EN_USO", `La tasa está en uso por ${usos} depósito(s); no se puede eliminar`);
  await db.execute("DELETE FROM tasas WHERE id = ?", [id]);
}
```

`src/db/repos/depositos.ts`:

```ts
import type { SqlDriver } from "../driver";
import { nowIso } from "../clock";
import { assertCampanaActiva } from "./campanas";
import { getAsignacion } from "./asignaciones";
import { getTasa } from "./tasas";
import type { DepositoValido } from "@/domain/validation";
import { DomainError } from "@/domain/errors";
import { formatFecha } from "@/domain/dates";

export type Deposito = {
  id: number;
  asignacionId: number;
  tasaId: number;
  fecha: string;
  banco: string;
  referencia: string;
  cuentaDestino: string;
  montoBs: string;
  observaciones: string | null;
  imagenPath: string | null;
  creadoEn: string;
  actualizadoEn: string;
};
export type DepositoGuardar = DepositoValido & { imagenPath: string | null };
export type Duplicado = { id: number; fecha: string; montoBs: string; gerenteNombre: string; campanaNombre: string };

const SEL = `SELECT id, asignacion_id AS asignacionId, tasa_id AS tasaId, fecha, banco, referencia, cuenta_destino AS cuentaDestino,
  monto_bs AS montoBs, observaciones, imagen_path AS imagenPath, creado_en AS creadoEn, actualizado_en AS actualizadoEn FROM depositos`;

export async function getDeposito(db: SqlDriver, id: number): Promise<Deposito | null> {
  const [row] = await db.select<Deposito>(`${SEL} WHERE id = ?`, [id]);
  return row ?? null;
}

async function assertEditable(db: SqlDriver, asignacionId: number): Promise<void> {
  const a = await getAsignacion(db, asignacionId);
  if (!a) throw new DomainError("NO_ENCONTRADO", "La asignación no existe");
  await assertCampanaActiva(db, a.campanaId);
}

async function assertTasaDeLaFecha(db: SqlDriver, v: DepositoGuardar): Promise<void> {
  const tasa = await getTasa(db, v.tasaId);
  if (!tasa) throw new DomainError("VALIDACION", "La tasa seleccionada no existe");
  if (tasa.fecha !== v.fecha) {
    throw new DomainError("VALIDACION", `La tasa es del ${formatFecha(tasa.fecha)} y el depósito del ${formatFecha(v.fecha)}`);
  }
}

export async function createDeposito(db: SqlDriver, asignacionId: number, v: DepositoGuardar): Promise<number> {
  await assertEditable(db, asignacionId);
  await assertTasaDeLaFecha(db, v);
  const now = nowIso();
  const r = await db.execute(
    `INSERT INTO depositos (asignacion_id, tasa_id, fecha, banco, referencia, cuenta_destino, monto_bs, observaciones, imagen_path, creado_en, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [asignacionId, v.tasaId, v.fecha, v.banco, v.referencia, v.cuentaDestino, v.montoBs, v.observaciones, v.imagenPath, now, now],
  );
  return r.lastInsertId;
}

async function requireDeposito(db: SqlDriver, id: number): Promise<Deposito> {
  const d = await getDeposito(db, id);
  if (!d) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
  return d;
}

export async function updateDeposito(db: SqlDriver, id: number, v: DepositoGuardar): Promise<void> {
  const actual = await requireDeposito(db, id);
  await assertEditable(db, actual.asignacionId);
  await assertTasaDeLaFecha(db, v);
  await db.execute(
    `UPDATE depositos SET tasa_id = ?, fecha = ?, banco = ?, referencia = ?, cuenta_destino = ?, monto_bs = ?,
       observaciones = ?, imagen_path = ?, actualizado_en = ? WHERE id = ?`,
    [v.tasaId, v.fecha, v.banco, v.referencia, v.cuentaDestino, v.montoBs, v.observaciones, v.imagenPath, nowIso(), id],
  );
}

export async function deleteDeposito(db: SqlDriver, id: number): Promise<void> {
  const actual = await requireDeposito(db, id);
  await assertEditable(db, actual.asignacionId);
  await db.execute("DELETE FROM depositos WHERE id = ?", [id]);
}

export async function findDuplicados(db: SqlDriver, banco: string, referencia: string, excludeId?: number): Promise<Duplicado[]> {
  return db.select<Duplicado>(
    `SELECT d.id, d.fecha, d.monto_bs AS montoBs, g.nombre AS gerenteNombre, c.nombre AS campanaNombre
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN gerentes g ON g.id = a.gerente_id
     JOIN campanas c ON c.id = a.campana_id
     WHERE lower(trim(d.banco)) = lower(trim(?)) AND trim(d.referencia) = trim(?) AND d.id != ?
     ORDER BY d.fecha`,
    [banco, referencia, excludeId ?? -1],
  );
}

export async function listBancosUsados(db: SqlDriver): Promise<string[]> {
  const rows = await db.select<{ banco: string }>("SELECT DISTINCT trim(banco) AS banco FROM depositos ORDER BY banco COLLATE NOCASE");
  return rows.map((r) => r.banco);
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `pnpm test src/db`
Expected: PASS

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat(db): repositorios de tasas y depósitos con validación de tasa por fecha y duplicados

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `loadCampanaData`: carga de una campaña para calcular

**Files:**
- Create: `src/db/queries/campanaData.ts`
- Test: `src/db/queries/campanaData.test.ts`

**Interfaces:**
- Consumes: `getCampana`, `Campana` (Task 6); `AsignacionData`, `DepositoData`, `buildCampanaView` (Task 4); fixtures (Task 7).
- Produces: `type CampanaData = { campana: Campana; asignaciones: AsignacionData[]; depositos: DepositoData[] }` y `loadCampanaData(db, campanaId): Promise<CampanaData>`, que lanza `NO_ENCONTRADO`.

- [ ] **Step 1: Escribir la prueba**

`src/db/queries/campanaData.test.ts`:

```ts
import { expect, it } from "vitest";
import { createTestDb } from "../testing/sqljsDriver";
import { depositoBase, seedBasico } from "../testing/fixtures";
import { createDeposito } from "../repos/depositos";
import { createGerente } from "../repos/gerentes";
import { createAsignacion } from "../repos/asignaciones";
import { createCampana } from "../repos/campanas";
import { loadCampanaData } from "./campanaData";
import { buildCampanaView } from "@/domain/campanaView";

it("carga solo los datos de la campaña y alimenta buildCampanaView", async () => {
  const db = await createTestDb();
  const s = await seedBasico(db);
  const luis = await createGerente(db, { nombre: "Luis", telefono: null });
  const asigLuis = await createAsignacion(db, { campanaId: s.campanaId, gerenteId: luis, saldoUsd: "50" });
  await createDeposito(db, s.asignacionId, depositoBase(s.tasaId)); // 100 USD
  await createDeposito(db, asigLuis, depositoBase(s.tasaId, { referencia: "9", montoBs: "730" })); // 20 USD

  const otra = await createCampana(db, { nombre: "Abril", fechaInicio: "2026-04-01", fechaFin: null, notas: null });
  const asigOtra = await createAsignacion(db, { campanaId: otra, gerenteId: luis, saldoUsd: "999" });
  await createDeposito(db, asigOtra, depositoBase(s.tasaId, { referencia: "X" }));

  const data = await loadCampanaData(db, s.campanaId);
  expect(data.campana.nombre).toBe("Marzo");
  expect(data.asignaciones.map((a) => a.gerenteNombre)).toEqual(["Ana", "Luis"]);
  expect(data.depositos).toHaveLength(2);
  expect(data.depositos[0]).toMatchObject({ tasaValor: "36.5", cuentaDestino: "0102-0000-00-0000000000" });

  const view = buildCampanaView(data.asignaciones, data.depositos);
  expect(view.total).toMatchObject({ asignado: "150.00", pagado: "120.00", restante: "30.00" });
});

it("lanza NO_ENCONTRADO para una campaña inexistente", async () => {
  const db = await createTestDb();
  await expect(loadCampanaData(db, 42)).rejects.toMatchObject({ code: "NO_ENCONTRADO" });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `pnpm test src/db/queries`
Expected: FAIL con `Failed to resolve import "./campanaData"`

- [ ] **Step 3: Implementar**

`src/db/queries/campanaData.ts`:

```ts
import type { SqlDriver } from "../driver";
import { getCampana, type Campana } from "../repos/campanas";
import type { AsignacionData, DepositoData } from "@/domain/campanaView";
import { DomainError } from "@/domain/errors";

export type CampanaData = { campana: Campana; asignaciones: AsignacionData[]; depositos: DepositoData[] };

export async function loadCampanaData(db: SqlDriver, campanaId: number): Promise<CampanaData> {
  const campana = await getCampana(db, campanaId);
  if (!campana) throw new DomainError("NO_ENCONTRADO", "La campaña no existe");
  const asignaciones = await db.select<AsignacionData>(
    `SELECT a.id, a.gerente_id AS gerenteId, g.nombre AS gerenteNombre, a.saldo_usd AS saldoUsd
     FROM asignaciones a JOIN gerentes g ON g.id = a.gerente_id
     WHERE a.campana_id = ? ORDER BY g.nombre COLLATE NOCASE`,
    [campanaId],
  );
  const depositos = await db.select<DepositoData>(
    `SELECT d.id, d.asignacion_id AS asignacionId, d.fecha, d.creado_en AS creadoEn, d.banco, d.referencia,
            d.cuenta_destino AS cuentaDestino, d.monto_bs AS montoBs, d.tasa_id AS tasaId, t.valor AS tasaValor,
            d.observaciones, d.imagen_path AS imagenPath
     FROM depositos d
     JOIN asignaciones a ON a.id = d.asignacion_id
     JOIN tasas t ON t.id = d.tasa_id
     WHERE a.campana_id = ?`,
    [campanaId],
  );
  return { campana, asignaciones, depositos };
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `pnpm test`
Expected: PASS (toda la suite)

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat(db): consulta de datos completos de una campaña

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Exportación a Excel (campaña y tasas)

**Files:**
- Create: `src/export/campanaWorkbook.ts`, `src/export/tasasWorkbook.ts`, `src/export/fileName.ts`
- Test: `src/export/campanaWorkbook.test.ts`, `src/export/tasasWorkbook.test.ts`

**Interfaces:**
- Consumes: `Campana` (Task 6); `CampanaView`, `DepositoCalculado` (Task 4); `Tasa` (Task 7); `formatFecha`, `formatPeriodo` (Task 3).
- Produces:
  - `safeSheetName(name: string, used: Set<string>): string`
  - `isoToExcelDate(iso: string): Date` (medianoche UTC)
  - `buildCampanaWorkbook(campana: Campana, view: CampanaView, generadoEn?: Date): ExcelJS.Workbook`: crea las hojas `Resumen`, `Todos los depósitos` y una por gerente.
  - `buildTasasWorkbook(tasas: Tasa[]): ExcelJS.Workbook`: crea la hoja `Tasas` en orden ascendente.
  - `archivoExcel(nombre: string, fecha: string): string` → `"campana-marzo-2026-2026-10-18.xlsx"`.

- [ ] **Step 1: Escribir las pruebas**

`src/export/campanaWorkbook.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildCampanaWorkbook, isoToExcelDate, safeSheetName } from "./campanaWorkbook";
import { archivoExcel } from "./fileName";
import { buildCampanaView, type DepositoData } from "@/domain/campanaView";
import type { Campana } from "@/db/repos/campanas";

const campana: Campana = { id: 1, nombre: "Marzo", fechaInicio: "2026-03-01", fechaFin: null, estado: "activa", notas: null, creadoEn: "x" };
const dep = (id: number, asignacionId: number, fecha: string, montoBs: string): DepositoData => ({
  id,
  asignacionId,
  fecha,
  creadoEn: `2026-01-01T00:00:0${id}.000Z`,
  banco: "Banesco",
  referencia: `00${id}`,
  cuentaDestino: "0102",
  montoBs,
  tasaId: 1,
  tasaValor: "36.5",
  observaciones: id === 1 ? "obs" : null,
  imagenPath: id === 1 ? "imagenes/abc.png" : null,
});

async function roundTrip(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const buf = await wb.xlsx.writeBuffer();
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(buf);
  return out;
}

describe("safeSheetName", () => {
  it("limpia caracteres inválidos, recorta a 31 y evita repetidos", () => {
    const used = new Set<string>(["resumen"]);
    expect(safeSheetName("Ana/Pérez: [norte]", used)).toBe("Ana Pérez   norte");
    expect(safeSheetName("Resumen", used)).toBe("Resumen (2)");
    expect(safeSheetName("ana/pérez: [norte]", used)).toBe("ana pérez   norte (2)");
    const largo = safeSheetName("x".repeat(40), used);
    expect(largo).toHaveLength(31);
    expect(safeSheetName("x".repeat(40), used)).toBe(`${"x".repeat(27)} (2)`);
    expect(safeSheetName("''", used)).toBe("Hoja");
  });
});

it("archivoExcel genera un nombre seguro", () => {
  expect(archivoExcel("Campaña Marzo/2026", "2026-10-18")).toBe("campana-marzo-2026-2026-10-18.xlsx");
  expect(archivoExcel("***", "2026-10-18")).toBe("reporte-2026-10-18.xlsx");
});

it("genera resumen, todos los depósitos y una hoja por gerente", async () => {
  const view = buildCampanaView(
    [
      { id: 1, gerenteId: 10, gerenteNombre: "Ana", saldoUsd: "100" },
      { id: 2, gerenteId: 20, gerenteNombre: "Ana", saldoUsd: "50" },
    ],
    [dep(1, 1, "2026-03-02", "3650"), dep(2, 2, "2026-03-01", "730")],
  );
  const wb = await roundTrip(buildCampanaWorkbook(campana, view, new Date("2026-10-18T12:00:00Z")));
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Todos los depósitos", "Ana", "Ana (2)"]);

  const resumen = wb.getWorksheet("Resumen")!;
  expect(resumen.getCell("B1").value).toBe("Marzo");
  expect(resumen.getRow(6).values).toEqual([, "Gerente", "Asignado USD", "Pagado USD", "Restante USD", "% avance", "Depósitos", "Último depósito"]);
  expect(resumen.getCell("A7").value).toBe("Ana");
  expect(resumen.getCell("C7").value).toBe(100);
  const total = resumen.getRow(9);
  expect(total.getCell(1).value).toBe("TOTAL");
  expect(total.getCell(2).value).toBe(150);
  expect(total.getCell(3).value).toBe(120);
  expect(total.getCell(4).value).toBe(30);
  expect(total.getCell(5).value).toBe(0.8);

  const todos = wb.getWorksheet("Todos los depósitos")!;
  expect(todos.getCell("A2").value).toEqual(isoToExcelDate("2026-03-01"));
  expect(todos.getCell("B2").value).toBe("Ana");
  expect(todos.getCell("D2").value).toBe("002");
  expect(todos.getCell("I2").value).toBe(130);
  expect(todos.getCell("I3").value).toBe(30);
  expect(todos.getCell("K3").value).toBe("abc.png");
  expect(todos.getCell("C4").value).toBe("TOTAL");
  expect(todos.getCell("H4").value).toBe(120);

  const ana = wb.getWorksheet("Ana")!;
  expect(ana.getCell("H2").value).toBe(0);
  expect(ana.getCell("I2").value).toBe("obs");
});
```

`src/export/tasasWorkbook.test.ts`:

```ts
import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildTasasWorkbook } from "./tasasWorkbook";
import { isoToExcelDate } from "./campanaWorkbook";

it("exporta las tasas en orden ascendente", async () => {
  const wb = buildTasasWorkbook([
    { id: 2, fecha: "2026-03-02", valor: "37.1234", imagenPath: null, notas: "BCV" },
    { id: 1, fecha: "2026-03-01", valor: "36.5", imagenPath: null, notas: null },
  ]);
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  const ws = out.getWorksheet("Tasas")!;
  expect(ws.getRow(1).values).toEqual([, "Fecha", "Bs por USD", "Notas"]);
  expect(ws.getCell("A2").value).toEqual(isoToExcelDate("2026-03-01"));
  expect(ws.getCell("B2").value).toBe(36.5);
  expect(ws.getCell("B3").value).toBe(37.1234);
  expect(ws.getCell("C3").value).toBe("BCV");
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `pnpm test src/export`
Expected: FAIL. No se resuelven los módulos.

- [ ] **Step 3: Implementar**

`src/export/fileName.ts`:

```ts
export function archivoExcel(nombre: string, fecha: string): string {
  const slug = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${slug || "reporte"}-${fecha}.xlsx`;
}
```

`src/export/campanaWorkbook.ts`:

```ts
import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import type { Campana } from "@/db/repos/campanas";
import type { CampanaView, DepositoCalculado } from "@/domain/campanaView";
import { formatPeriodo } from "@/domain/dates";

const MONEY = "#,##0.00";
const TASA = "#,##0.0000";
const PCT = "0.0%";
const FECHA = "dd/mm/yyyy";
const num = (s: string) => Number(s);

export function isoToExcelDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function safeSheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[[\]:*?/\\]/g, " ")
      .replace(/^'+|'+$/g, "")
      .trim()
      .slice(0, 31) || "Hoja";
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function styleHeader(ws: ExcelJS.Worksheet, rowNumber: number, columns: number): void {
  const row = ws.getRow(rowNumber);
  for (let c = 1; c <= columns; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  }
  ws.views = [{ state: "frozen", ySplit: rowNumber }];
  ws.autoFilter = { from: { row: rowNumber, column: 1 }, to: { row: rowNumber, column: columns } };
}

function addResumen(ws: ExcelJS.Worksheet, campana: Campana, view: CampanaView, generadoEn: Date): void {
  ws.addRow(["Campaña", campana.nombre]);
  ws.addRow(["Período", formatPeriodo(campana.fechaInicio, campana.fechaFin)]);
  ws.addRow(["Estado", campana.estado === "activa" ? "Activa" : "Cerrada"]);
  ws.addRow(["Generado", generadoEn.toLocaleString("es-VE")]);
  ws.addRow([]);
  ws.addRow(["Gerente", "Asignado USD", "Pagado USD", "Restante USD", "% avance", "Depósitos", "Último depósito"]);
  const fila = (nombre: string, r: CampanaView["total"]) => [
    nombre,
    num(r.asignado),
    num(r.pagado),
    num(r.restante),
    r.pct / 100,
    r.cantidad,
    r.ultimaFecha ? isoToExcelDate(r.ultimaFecha) : null,
  ];
  for (const g of view.gerentes) ws.addRow(fila(g.gerenteNombre, g));
  ws.addRow(fila("TOTAL", view.total)).font = { bold: true };

  ws.getColumn(1).width = 28;
  for (const c of [2, 3, 4]) Object.assign(ws.getColumn(c), { width: 16, numFmt: MONEY });
  Object.assign(ws.getColumn(5), { width: 12, numFmt: PCT });
  ws.getColumn(6).width = 12;
  Object.assign(ws.getColumn(7), { width: 16, numFmt: FECHA });
  styleHeader(ws, 6, 7);
}

function addDepositos(ws: ExcelJS.Worksheet, deps: DepositoCalculado[], general: boolean): void {
  ws.columns = [
    { header: "Fecha", key: "fecha", width: 12, style: { numFmt: FECHA } },
    ...(general ? [{ header: "Gerente", key: "gerente", width: 24 }] : []),
    { header: "Banco", key: "banco", width: 18 },
    { header: "Referencia", key: "referencia", width: 18 },
    { header: "Cuenta destino", key: "cuenta", width: 26 },
    { header: "Monto Bs", key: "montoBs", width: 16, style: { numFmt: MONEY } },
    { header: "Tasa", key: "tasa", width: 12, style: { numFmt: TASA } },
    { header: "USD", key: "usd", width: 14, style: { numFmt: MONEY } },
    { header: general ? "Saldo general restante" : "Saldo restante", key: "saldo", width: 20, style: { numFmt: MONEY } },
    { header: "Observaciones", key: "obs", width: 30 },
    { header: "Comprobante", key: "img", width: 40 },
  ];
  for (const d of deps) {
    ws.addRow({
      fecha: isoToExcelDate(d.fecha),
      gerente: d.gerenteNombre,
      banco: d.banco,
      referencia: d.referencia,
      cuenta: d.cuentaDestino,
      montoBs: num(d.montoBs),
      tasa: num(d.tasaValor),
      usd: num(d.usd),
      saldo: num(general ? d.saldoGeneralRestante : d.saldoGerenteRestante),
      obs: d.observaciones ?? "",
      img: d.imagenPath ? (d.imagenPath.split("/").pop() ?? "") : "",
    });
  }
  const sum = (k: "montoBs" | "usd") => deps.reduce((acc, d) => acc.plus(d[k]), new Decimal(0)).toNumber();
  ws.addRow({ banco: "TOTAL", montoBs: sum("montoBs"), usd: sum("usd") }).font = { bold: true };
  styleHeader(ws, 1, ws.columns.length);
}

export function buildCampanaWorkbook(campana: Campana, view: CampanaView, generadoEn: Date = new Date()): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Pagos";
  wb.created = generadoEn;
  const used = new Set<string>();
  addResumen(wb.addWorksheet(safeSheetName("Resumen", used)), campana, view, generadoEn);
  addDepositos(wb.addWorksheet(safeSheetName("Todos los depósitos", used)), view.depositos, true);
  for (const g of view.gerentes) {
    addDepositos(
      wb.addWorksheet(safeSheetName(g.gerenteNombre, used)),
      view.depositos.filter((d) => d.asignacionId === g.asignacionId),
      false,
    );
  }
  return wb;
}
```

En la prueba, el total de la hoja "Todos los depósitos" queda en la fila 4 y el texto `TOTAL` en la columna C (Banco), porque la hoja general tiene la columna Gerente. En las hojas por gerente, `TOTAL` cae en la columna B.

`src/export/tasasWorkbook.ts`:

```ts
import ExcelJS from "exceljs";
import type { Tasa } from "@/db/repos/tasas";
import { isoToExcelDate } from "./campanaWorkbook";

export function buildTasasWorkbook(tasas: Tasa[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Control de Pagos";
  const ws = wb.addWorksheet("Tasas");
  ws.columns = [
    { header: "Fecha", key: "fecha", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Bs por USD", key: "valor", width: 14, style: { numFmt: "#,##0.0000" } },
    { header: "Notas", key: "notas", width: 40 },
  ];
  for (const t of [...tasas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    ws.addRow({ fecha: isoToExcelDate(t.fecha), valor: Number(t.valor), notas: t.notas ?? "" });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return wb;
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `pnpm test src/export`
Expected: PASS. Si una aserción sobre una celda vacía falla porque ExcelJS devuelve `null` en lugar de `""`, ajusta **la prueba** para aceptar el valor que ExcelJS realmente escribe en esa celda vacía. La implementación se queda como está.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "feat(export): Excel de campaña (resumen, todos los depósitos, por gerente) y de tasas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Integración con Tauri: plugins, comandos de respaldo en Rust, driver real, imágenes y log

> **Requiere los Prerrequisitos (MSVC).** Verifica `rustup show` antes de empezar.

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- Create: `src-tauri/src/backup.rs`, `src/db/tauriDriver.ts`, `src/db/index.ts`, `src/platform/images.ts`, `src/platform/backup.ts`, `src/lib/reportError.ts`
- Test: pruebas de Rust dentro de `src-tauri/src/backup.rs`; `src/platform/images.test.ts`

**Interfaces:**
- Consumes: `SqlDriver`, `migrate` (Task 5); `DomainError` (Task 3); `todayIso` (Task 3).
- Produces:
  - Comandos Rust, invocados desde JS con argumentos en camelCase:
    - `data_paths() -> { dbPath, imagesDir, backupsDir }`
    - `create_backup({ snapshotPath, destPath })`: arma un zip con `control-pagos.db` + `imagenes/*` y borra el snapshot.
    - `auto_backup_path({ today }) -> string | null`: devuelve `null` si ya existe `auto-<today>.zip`.
    - `prune_auto_backups()`: conserva los 7 más recientes.
    - `list_backups() -> BackupInfo[]`, con `BackupInfo = { name, path, sizeBytes, modifiedMs }`, del más reciente al más antiguo.
    - `restore_backup({ zipPath })`: primero respalda los datos actuales en `antes-de-restaurar-<epoch>.zip` y después los reemplaza. Requiere que la BD esté cerrada.
  - `src/db/index.ts`: `getDb(): Promise<SqlDriver>` (abre, activa FK y migra solo la primera vez) · `closeDb(): Promise<void>`.
  - `src/platform/images.ts`:
    - `type ImagenValue = { kind: 'stored'; path: string } | { kind: 'new'; file: Blob; previewUrl: string } | null`
    - `ACCEPTED_IMAGE_TYPES: string[]` · `extensionFor(mime): string | null` · `mimeForPath(path): string`
    - `saveImage(file: Blob): Promise<string>` (devuelve la ruta relativa `imagenes/<uuid>.<ext>`)
    - `loadImageUrl(relPath): Promise<string>` (blob URL; quien la usa debe liberarla con `URL.revokeObjectURL`)
    - `persistImagen(v: ImagenValue): Promise<string | null>`
  - `src/platform/backup.ts`: `getDataPaths()`, `listBackups()`, `createBackup(db, destPath)`, `runAutoBackup(db)`, `restoreBackup(zipPath)`.
  - `src/lib/reportError.ts`: `errorMessage(e): string` · `reportError(e, contexto?): void` (muestra un toast y escribe en el log).

- [ ] **Step 1: Agregar los plugins**

```powershell
pnpm tauri add sql
pnpm tauri add fs
pnpm tauri add dialog
pnpm tauri add log
```

Edita `src-tauri/Cargo.toml` para que `[dependencies]` incluya lo siguiente. Deja como estén las versiones que haya puesto `tauri add`, pero asegúrate de que `tauri-plugin-sql` tenga `features = ["sqlite"]`:

```toml
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
log = "0.4"
zip = { version = "2", default-features = false, features = ["deflate"] }
serde = { version = "1", features = ["derive"] }

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Escribir las pruebas de Rust (`backup.rs`)**

Crea `src-tauri/src/backup.rs`. Primero solo con las pruebas y las firmas, con `todo!()` como cuerpo:

```rust
use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const DB_NAME: &str = "control-pagos.db";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_ms: u64,
}

pub fn create_zip(_db: &Path, _images_dir: &Path, _dest: &Path) -> Result<(), String> { todo!() }
pub fn restore_zip(_zip_path: &Path, _db_path: &Path, _images_dir: &Path) -> Result<(), String> { todo!() }
pub fn prune_auto(_dir: &Path, _keep: usize) -> Result<(), String> { todo!() }
pub fn list(_dir: &Path) -> Result<Vec<BackupInfo>, String> { todo!() }

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    fn write(p: &Path, content: &[u8]) {
        if let Some(d) = p.parent() {
            fs::create_dir_all(d).unwrap();
        }
        fs::write(p, content).unwrap();
    }

    fn zip_with(path: &Path, entries: &[(&str, &[u8])]) {
        let mut z = zip::ZipWriter::new(fs::File::create(path).unwrap());
        for (name, data) in entries {
            z.start_file(*name, SimpleFileOptions::default()).unwrap();
            z.write_all(data).unwrap();
        }
        z.finish().unwrap();
    }

    struct Destino {
        _dir: tempfile::TempDir,
        db: PathBuf,
        imgs: PathBuf,
    }

    fn destino_con_datos() -> Destino {
        let dir = tempdir().unwrap();
        let db = dir.path().join("cfg").join(DB_NAME);
        let imgs = dir.path().join("data").join("imagenes");
        write(&db, b"DB-VIEJA");
        write(&imgs.join("vieja.png"), b"X");
        Destino { _dir: dir, db, imgs }
    }

    fn intactos(d: &Destino) {
        assert_eq!(fs::read(&d.db).unwrap(), b"DB-VIEJA");
        assert!(d.imgs.join("vieja.png").exists());
        assert!(!d.imgs.parent().unwrap().join("restaurando-tmp").exists());
    }

    #[test]
    fn zip_y_restaurar_ida_y_vuelta() {
        let src = tempdir().unwrap();
        let snap = src.path().join("snap.db");
        write(&snap, b"DB-ORIGINAL");
        let imgs = src.path().join("imagenes");
        write(&imgs.join("a.png"), b"IMG-A");
        let zip_path = src.path().join("r.zip");
        create_zip(&snap, &imgs, &zip_path).unwrap();

        let d = destino_con_datos();
        restore_zip(&zip_path, &d.db, &d.imgs).unwrap();
        assert_eq!(fs::read(&d.db).unwrap(), b"DB-ORIGINAL");
        assert_eq!(fs::read(d.imgs.join("a.png")).unwrap(), b"IMG-A");
        assert!(!d.imgs.join("vieja.png").exists());
    }

    #[test]
    fn crea_zip_aunque_no_exista_la_carpeta_de_imagenes() {
        let src = tempdir().unwrap();
        let snap = src.path().join("snap.db");
        write(&snap, b"DB");
        let zip_path = src.path().join("r.zip");
        create_zip(&snap, &src.path().join("no-existe"), &zip_path).unwrap();
        let d = destino_con_datos();
        restore_zip(&zip_path, &d.db, &d.imgs).unwrap();
        assert_eq!(fs::read(&d.db).unwrap(), b"DB");
        assert!(d.imgs.exists());
    }

    #[test]
    fn zip_sin_bd_no_toca_los_datos() {
        let src = tempdir().unwrap();
        let zip_path = src.path().join("r.zip");
        zip_with(&zip_path, &[("otra.txt", b"hola")]);
        let d = destino_con_datos();
        assert!(restore_zip(&zip_path, &d.db, &d.imgs).is_err());
        intactos(&d);
    }

    #[test]
    fn archivo_que_no_es_zip_no_toca_los_datos() {
        let src = tempdir().unwrap();
        let bad = src.path().join("r.zip");
        write(&bad, b"esto no es un zip");
        let d = destino_con_datos();
        assert!(restore_zip(&bad, &d.db, &d.imgs).is_err());
        intactos(&d);
    }

    #[test]
    fn rechaza_rutas_peligrosas_sin_tocar_los_datos() {
        let src = tempdir().unwrap();
        let zip_path = src.path().join("r.zip");
        zip_with(&zip_path, &[(DB_NAME, b"DB"), ("imagenes/../../evil.txt", b"x")]);
        let d = destino_con_datos();
        assert!(restore_zip(&zip_path, &d.db, &d.imgs).is_err());
        intactos(&d);
    }

    #[test]
    fn prune_conserva_los_mas_recientes() {
        let dir = tempdir().unwrap();
        for i in 1..=9 {
            write(&dir.path().join(format!("auto-2026-01-0{i}.zip")), b"z");
        }
        write(&dir.path().join("manual.zip"), b"z");
        prune_auto(dir.path(), 7).unwrap();
        let mut names: Vec<String> = fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
        names.sort();
        assert_eq!(names.len(), 8);
        assert!(!names.contains(&"auto-2026-01-01.zip".to_string()));
        assert!(!names.contains(&"auto-2026-01-02.zip".to_string()));
        assert!(names.contains(&"manual.zip".to_string()));
    }

    #[test]
    fn lista_solo_zips() {
        let dir = tempdir().unwrap();
        write(&dir.path().join("a.zip"), b"12345");
        write(&dir.path().join("snapshot-x.db"), b"z");
        let l = list(dir.path()).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].name, "a.zip");
        assert_eq!(l[0].size_bytes, 5);
    }
}
```

Agrega `mod backup;` al inicio de `src-tauri/src/lib.rs`.

Run: `cd src-tauri; cargo test`
Expected: FAIL. Las pruebas compilan pero entran en pánico con `not yet implemented`.

- [ ] **Step 3: Implementar `backup.rs`**

Reemplaza los cuatro `todo!()` con:

```rust
fn s<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

pub fn create_zip(db: &Path, images_dir: &Path, dest: &Path) -> Result<(), String> {
    use zip::write::SimpleFileOptions;
    let mut zip = zip::ZipWriter::new(fs::File::create(dest).map_err(s)?);
    let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file(DB_NAME, opts).map_err(s)?;
    io::copy(&mut fs::File::open(db).map_err(s)?, &mut zip).map_err(s)?;
    if images_dir.exists() {
        for entry in fs::read_dir(images_dir).map_err(s)? {
            let entry = entry.map_err(s)?;
            if entry.file_type().map_err(s)?.is_file() {
                zip.start_file(format!("imagenes/{}", entry.file_name().to_string_lossy()), opts).map_err(s)?;
                io::copy(&mut fs::File::open(entry.path()).map_err(s)?, &mut zip).map_err(s)?;
            }
        }
    }
    zip.finish().map_err(s)?;
    Ok(())
}

fn extract_to(zip_path: &Path, tmp: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(s)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "El archivo no es un respaldo válido".to_string())?;
    fs::create_dir_all(tmp.join("imagenes")).map_err(s)?;
    let mut has_db = false;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(s)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        let target = if name == DB_NAME {
            has_db = true;
            tmp.join(DB_NAME)
        } else if let Some(file) = name.strip_prefix("imagenes/") {
            if file.is_empty() || file.contains('/') || file.contains("..") || file.contains(':') {
                return Err(format!("El respaldo contiene una ruta no permitida: {name}"));
            }
            tmp.join("imagenes").join(file)
        } else {
            continue;
        };
        let mut out = fs::File::create(&target).map_err(s)?;
        io::copy(&mut entry, &mut out).map_err(s)?;
    }
    if !has_db {
        return Err("El respaldo no contiene la base de datos".into());
    }
    Ok(())
}

pub fn restore_zip(zip_path: &Path, db_path: &Path, images_dir: &Path) -> Result<(), String> {
    let parent = images_dir.parent().ok_or("Ruta de imágenes inválida")?;
    fs::create_dir_all(parent).map_err(s)?;
    let tmp = parent.join("restaurando-tmp");
    if tmp.exists() {
        fs::remove_dir_all(&tmp).map_err(s)?;
    }
    if let Err(e) = extract_to(zip_path, &tmp) {
        let _ = fs::remove_dir_all(&tmp);
        return Err(e);
    }
    // A partir de aquí el contenido es válido: reemplazar.
    if let Some(p) = db_path.parent() {
        fs::create_dir_all(p).map_err(s)?;
    }
    for suffix in ["-wal", "-shm", "-journal"] {
        let _ = fs::remove_file(PathBuf::from(format!("{}{suffix}", db_path.display())));
    }
    fs::copy(tmp.join(DB_NAME), db_path).map_err(s)?;
    if images_dir.exists() {
        fs::remove_dir_all(images_dir).map_err(s)?;
    }
    fs::rename(tmp.join("imagenes"), images_dir).map_err(s)?;
    let _ = fs::remove_dir_all(&tmp);
    Ok(())
}

pub fn prune_auto(dir: &Path, keep: usize) -> Result<(), String> {
    let mut autos: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(s)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("auto-") && n.ends_with(".zip"))
                .unwrap_or(false)
        })
        .collect();
    autos.sort();
    autos.reverse();
    for p in autos.into_iter().skip(keep) {
        fs::remove_file(p).map_err(s)?;
    }
    Ok(())
}

pub fn list(dir: &Path) -> Result<Vec<BackupInfo>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(s)? {
        let entry = entry.map_err(s)?;
        let path = entry.path();
        if path.extension().and_then(|x| x.to_str()) != Some("zip") {
            continue;
        }
        let meta = entry.metadata().map_err(s)?;
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(BackupInfo {
            name: entry.file_name().to_string_lossy().into_owned(),
            path: path.display().to_string(),
            size_bytes: meta.len(),
            modified_ms,
        });
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}
```

Run: `cd src-tauri; cargo test`
Expected: PASS (7 pruebas)

- [ ] **Step 4: Comandos y plugins en `lib.rs`**

Reemplaza `src-tauri/src/lib.rs` con lo siguiente (el `main.rs` del scaffold llama a `control_pagos_lib::run()`, y ese llamado se mantiene):

```rust
mod backup;

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

struct Paths {
    db: PathBuf,
    images: PathBuf,
    backups: PathBuf,
}

/// tauri-plugin-sql resuelve "sqlite:control-pagos.db" relativo a app_config_dir.
fn paths(app: &AppHandle) -> Result<Paths, String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backups = data.join("respaldos");
    std::fs::create_dir_all(&backups).map_err(|e| e.to_string())?;
    Ok(Paths { db: config.join(backup::DB_NAME), images: data.join("imagenes"), backups })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DataPaths {
    db_path: String,
    images_dir: String,
    backups_dir: String,
}

#[tauri::command]
fn data_paths(app: AppHandle) -> Result<DataPaths, String> {
    let p = paths(&app)?;
    Ok(DataPaths {
        db_path: p.db.display().to_string(),
        images_dir: p.images.display().to_string(),
        backups_dir: p.backups.display().to_string(),
    })
}

#[tauri::command]
fn create_backup(app: AppHandle, snapshot_path: String, dest_path: String) -> Result<(), String> {
    let p = paths(&app)?;
    let snapshot = Path::new(&snapshot_path);
    if !snapshot.starts_with(&p.backups) {
        return Err("Snapshot fuera de la carpeta de respaldos".into());
    }
    let result = backup::create_zip(snapshot, &p.images, Path::new(&dest_path));
    let _ = std::fs::remove_file(snapshot);
    result
}

#[tauri::command]
fn auto_backup_path(app: AppHandle, today: String) -> Result<Option<String>, String> {
    if today.is_empty() || !today.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("Fecha inválida".into());
    }
    let dest = paths(&app)?.backups.join(format!("auto-{today}.zip"));
    Ok(if dest.exists() { None } else { Some(dest.display().to_string()) })
}

#[tauri::command]
fn prune_auto_backups(app: AppHandle) -> Result<(), String> {
    backup::prune_auto(&paths(&app)?.backups, 7)
}

#[tauri::command]
fn list_backups(app: AppHandle) -> Result<Vec<backup::BackupInfo>, String> {
    backup::list(&paths(&app)?.backups)
}

/// La BD debe estar cerrada desde JS (closeDb) antes de llamar a este comando.
#[tauri::command]
fn restore_backup(app: AppHandle, zip_path: String) -> Result<(), String> {
    let p = paths(&app)?;
    if p.db.exists() {
        let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        backup::create_zip(&p.db, &p.images, &p.backups.join(format!("antes-de-restaurar-{secs}.zip")))?;
    }
    backup::restore_zip(Path::new(&zip_path), &p.db, &p.images)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            data_paths,
            create_backup,
            auto_backup_path,
            prune_auto_backups,
            list_backups,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
```

Si el scaffold dejó un comando `greet`, elimínalo, y elimina también su uso en el frontend.

- [ ] **Step 5: Configuración y permisos**

En `src-tauri/tauri.conf.json`:
- `"productName": "Control de Pagos"`
- `"identifier": "com.controlpagos.app"`
- En `app.windows[0]`: `"title": "Control de Pagos"`, `"width": 1400`, `"height": 900`, `"minWidth": 1100`, `"minHeight": 700`, `"dragDropEnabled": false`. Este último es necesario para que el arrastrar y soltar de HTML5 entregue objetos `File`.
- En `bundle`: `"targets": ["msi"]`.

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Permisos de la ventana principal",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "sql:default",
    "sql:allow-execute",
    "fs:default",
    "fs:allow-appdata-read-recursive",
    "fs:allow-appdata-write-recursive",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:allow-mkdir",
    "dialog:default",
    "log:default"
  ]
}
```

- [ ] **Step 6: Driver real, BD, imágenes, respaldo y reporte de errores (TS)**

`src/db/tauriDriver.ts`:

```ts
import type Database from "@tauri-apps/plugin-sql";
import type { SqlDriver, SqlValue } from "./driver";

export function tauriDriver(db: Database): SqlDriver {
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const r = await db.execute(sql, params);
      return { lastInsertId: Number(r.lastInsertId ?? 0), rowsAffected: r.rowsAffected };
    },
    select<T>(sql: string, params: SqlValue[] = []) {
      return db.select<T[]>(sql, params);
    },
  };
}
```

`src/db/index.ts`:

```ts
import Database from "@tauri-apps/plugin-sql";
import type { SqlDriver } from "./driver";
import { tauriDriver } from "./tauriDriver";
import { migrate } from "./migrations";

const DB_URL = "sqlite:control-pagos.db";
type Opened = { raw: Database; driver: SqlDriver };
let current: Promise<Opened> | null = null;

async function open(): Promise<Opened> {
  const raw = await Database.load(DB_URL);
  const driver = tauriDriver(raw);
  await driver.execute("PRAGMA foreign_keys = ON");
  await migrate(driver);
  return { raw, driver };
}

export async function getDb(): Promise<SqlDriver> {
  if (!current) {
    const opening = open();
    current = opening;
    opening.catch(() => {
      if (current === opening) current = null;
    });
  }
  return (await current).driver;
}

export async function closeDb(): Promise<void> {
  if (!current) return;
  const opened = current;
  current = null;
  try {
    await (await opened).raw.close();
  } catch {
    // ya estaba cerrada o nunca abrió
  }
}
```

`src/platform/images.ts`:

```ts
import { BaseDirectory, mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";

export type ImagenValue = { kind: "stored"; path: string } | { kind: "new"; file: Blob; previewUrl: string } | null;

const EXT_BY_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export const ACCEPTED_IMAGE_TYPES = Object.keys(EXT_BY_MIME);
export const extensionFor = (mime: string): string | null => EXT_BY_MIME[mime] ?? null;
export const mimeForPath = (path: string): string => MIME_BY_EXT[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

const opts = { baseDir: BaseDirectory.AppData };

export async function saveImage(file: Blob): Promise<string> {
  const ext = extensionFor(file.type);
  if (!ext) throw new Error("Formato de imagen no soportado. Usa PNG, JPG o WEBP.");
  await mkdir("imagenes", { ...opts, recursive: true });
  const rel = `imagenes/${crypto.randomUUID()}.${ext}`;
  await writeFile(rel, new Uint8Array(await file.arrayBuffer()), opts);
  return rel;
}

export async function loadImageUrl(relPath: string): Promise<string> {
  const bytes = await readFile(relPath, opts);
  return URL.createObjectURL(new Blob([bytes], { type: mimeForPath(relPath) }));
}

export async function persistImagen(v: ImagenValue): Promise<string | null> {
  if (!v) return null;
  return v.kind === "stored" ? v.path : saveImage(v.file);
}
```

`src/platform/images.test.ts`:

```ts
import { expect, it } from "vitest";
import { extensionFor, mimeForPath } from "./images";

it("mapea tipos MIME y extensiones", () => {
  expect(extensionFor("image/jpeg")).toBe("jpg");
  expect(extensionFor("application/pdf")).toBeNull();
  expect(mimeForPath("imagenes/a.JPG")).toBe("image/jpeg");
  expect(mimeForPath("imagenes/a.bin")).toBe("application/octet-stream");
});
```

`src/platform/backup.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import type { SqlDriver } from "@/db/driver";
import { closeDb } from "@/db";
import { todayIso } from "@/domain/dates";

export type DataPaths = { dbPath: string; imagesDir: string; backupsDir: string };
export type BackupInfo = { name: string; path: string; sizeBytes: number; modifiedMs: number };

export const getDataPaths = () => invoke<DataPaths>("data_paths");
export const listBackups = () => invoke<BackupInfo[]>("list_backups");

const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Copia consistente de la BD abierta, dentro de la carpeta de respaldos. */
async function snapshot(db: SqlDriver): Promise<string> {
  const { backupsDir } = await getDataPaths();
  const path = await join(backupsDir, `snapshot-${crypto.randomUUID()}.db`);
  await db.execute(`VACUUM INTO ${sqlString(path)}`);
  return path;
}

export async function createBackup(db: SqlDriver, destPath: string): Promise<void> {
  const snapshotPath = await snapshot(db);
  await invoke("create_backup", { snapshotPath, destPath });
}

export async function runAutoBackup(db: SqlDriver): Promise<void> {
  const dest = await invoke<string | null>("auto_backup_path", { today: todayIso() });
  if (!dest) return;
  await createBackup(db, dest);
  await invoke("prune_auto_backups");
}

/** Cierra la BD y reemplaza los datos. Quien llama debe recargar la ventana. */
export async function restoreBackup(zipPath: string): Promise<void> {
  await closeDb();
  await invoke("restore_backup", { zipPath });
}
```

`src/lib/reportError.ts`:

```ts
import { toast } from "sonner";
import { error as logError } from "@tauri-apps/plugin-log";
import { DomainError } from "@/domain/errors";

export function errorMessage(e: unknown): string {
  if (e instanceof DomainError) return e.message;
  if (e instanceof Error) return `Error inesperado: ${e.message}`;
  return `Error inesperado: ${String(e)}`;
}

export function reportError(e: unknown, contexto?: string): void {
  const msg = errorMessage(e);
  toast.error(contexto ? `${contexto}: ${msg}` : msg);
  const detalle = e instanceof Error ? (e.stack ?? e.message) : String(e);
  logError(`${contexto ?? "error"}: ${detalle}`).catch(() => {});
}
```

Agrega temporalmente en `src/App.tsx` una prueba de vida de la BD:

```tsx
import { useEffect, useState } from "react";
import { getDb } from "@/db";
import { getDataPaths } from "@/platform/backup";

export default function App() {
  const [estado, setEstado] = useState("Abriendo base de datos…");
  useEffect(() => {
    getDb()
      .then(getDataPaths)
      .then((p) => setEstado(`Base de datos lista: ${p.dbPath}`))
      .catch((e) => setEstado(`Error: ${String(e)}`));
  }, []);
  return <div className="p-6">{estado}</div>;
}
```

- [ ] **Step 7: Verificar**

Run: `pnpm test` → Expected: PASS
Run: `cd src-tauri; cargo test` → Expected: PASS
Run: `pnpm tauri dev` → Expected: se abre la ventana "Control de Pagos" y muestra `Base de datos lista: C:\Users\…\AppData\Roaming\com.controlpagos.app\control-pagos.db`. Ciérrala.

Si un permiso de `capabilities/default.json` no existe en la versión instalada del plugin, el build falla con `Permission … not found`. Quita ese identificador, revisa en `src-tauri/gen/schemas/desktop-schema.json` cuáles sí existen y usa el equivalente.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "feat(tauri): plugins sql/fs/dialog/log, comandos de respaldo en Rust, driver real e imágenes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Estructura de la app: router, layout, `useData`, componentes compartidos y Extractor

**Files:**
- Create: `src/hooks/useData.ts`, `src/components/AppLayout.tsx`, `src/components/PageHeader.tsx`, `src/components/Feedback.tsx`, `src/components/Field.tsx`, `src/components/NativeSelect.tsx`, `src/components/ConfirmDialog.tsx`, `src/components/ResumenCards.tsx`, `src/components/StoredImage.tsx`, `src/components/ImageViewer.tsx`, `src/components/ComprobanteThumb.tsx`, `src/components/ImageDrop.tsx`, `src/extraction/extractor.ts`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/extraction/extractor.test.ts`

**Interfaces:**
- Consumes: `getDb` (Task 10), `reportError` (Task 10), `ImagenValue`, `ACCEPTED_IMAGE_TYPES`, `loadImageUrl` (Task 10), `Resumen` (Task 4), `formatUsd`, `formatPct` (Task 2).
- Produces:
  - `useData<T>(load: (db: SqlDriver) => Promise<T>, deps: readonly unknown[]): { data: T | undefined; error: unknown; loading: boolean }` · `invalidate(): void`
  - `<PageHeader title subtitle? actions? back?={{ to, label }} />`
  - `<Cargando error? />`, `<Vacio texto />`, `<Aviso tono?="info" | "warning">…</Aviso>`
  - `<Field id label error? hint?>{control}</Field>`
  - `<NativeSelect {...selectProps} />`
  - `<ConfirmDialog open onOpenChange title description confirmLabel destructive? onConfirm />`
  - `<ResumenCards resumen etiquetaAsignado? />`
  - `<StoredImage path alt? className? style? />`
  - `<ImageViewer path open onOpenChange />`
  - `<ComprobanteThumb path />`
  - `<ImageDrop value onChange pasteEnabled? disabled? label? className? />`
  - `extraction/extractor.ts`: `ExtractableField`, `ExtractedField`, `ExtractionResult`, `interface Extractor { extract(image: Blob): Promise<ExtractionResult> }`, `nullExtractor` y `extractor` (el activo, que en el MVP es `nullExtractor`).
  - `App.tsx` exporta `router`. Cada task siguiente **agrega sus rutas** a la lista `children`.

- [ ] **Step 1: Prueba del Extractor**

`src/extraction/extractor.test.ts`:

```ts
import { expect, it } from "vitest";
import { extractor, nullExtractor } from "./extractor";

it("en el MVP el extractor activo es el nulo y no devuelve campos", async () => {
  expect(extractor).toBe(nullExtractor);
  await expect(extractor.extract(new Blob(["x"], { type: "image/png" }))).resolves.toEqual({ fields: {} });
});
```

Run: `pnpm test src/extraction` → Expected: FAIL (no se resuelve `./extractor`)

- [ ] **Step 2: Implementar el Extractor**

`src/extraction/extractor.ts`:

```ts
export type ExtractableField = "fecha" | "banco" | "referencia" | "cuentaDestino" | "montoBs";
export type ExtractedField = { value: string; confidence: number };
export type ExtractionResult = { fields: Partial<Record<ExtractableField, ExtractedField>> };

/** Lee un comprobante y propone valores. En la fase 2 se conecta el OCR local aquí. */
export interface Extractor {
  extract(image: Blob): Promise<ExtractionResult>;
}

export const nullExtractor: Extractor = {
  async extract() {
    return { fields: {} };
  },
};

export const extractor: Extractor = nullExtractor;
```

Run: `pnpm test src/extraction` → Expected: PASS

- [ ] **Step 3: `useData` e `invalidate`**

`src/hooks/useData.ts`:

```ts
import { useEffect, useState, useSyncExternalStore } from "react";
import type { SqlDriver } from "@/db/driver";
import { getDb } from "@/db";
import { reportError } from "@/lib/reportError";

let version = 0;
const listeners = new Set<() => void>();

/** Llamar después de cualquier escritura: recarga todas las vistas montadas. */
export function invalidate(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

type State<T> = { data: T | undefined; error: unknown; loading: boolean };
type Keyed<T> = State<T> & { key: string };
const LOADING = { data: undefined, error: null, loading: true } as const;

export function useData<T>(load: (db: SqlDriver) => Promise<T>, deps: readonly unknown[]): State<T> {
  const v = useSyncExternalStore(subscribe, () => version);
  const key = JSON.stringify(deps);
  const [state, setState] = useState<Keyed<T>>({ key, ...LOADING });

  useEffect(() => {
    let alive = true;
    getDb()
      .then(load)
      .then(
        (data) => {
          if (alive) setState({ key, data, error: null, loading: false });
        },
        (error: unknown) => {
          if (!alive) return;
          setState({ key, data: undefined, error, loading: false });
          reportError(error);
        },
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, key]);

  // Si cambiaron los deps, no mostrar datos de la entidad anterior.
  return state.key === key ? state : LOADING;
}
```

- [ ] **Step 4: Componentes básicos**

`src/components/PageHeader.tsx`:

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";

type Props = { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } };

export function PageHeader({ title, subtitle, actions, back }: Props) {
  return (
    <div className="mb-6 space-y-1">
      {back && (
        <Link to={back.to} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
```

`src/components/Feedback.tsx`:

```tsx
import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/reportError";

export function Cargando({ error }: { error?: unknown }) {
  if (error) return <Aviso tono="warning">{errorMessage(error)}</Aviso>;
  return <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>;
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{texto}</p>;
}

export function Aviso({ tono = "info", children }: { tono?: "info" | "warning"; children: ReactNode }) {
  const Icon = tono === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex gap-2 rounded-md border px-3 py-2 text-sm",
        tono === "warning" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
```

`src/components/Field.tsx`:

```tsx
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

type Props = { id: string; label: string; error?: string; hint?: string; children: ReactNode };

export function Field({ id, label, error, hint, children }: Props) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
```

`src/components/NativeSelect.tsx`:

```tsx
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
    />
  );
}
```

`src/components/ConfirmDialog.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className={cn(destructive && "bg-destructive text-white hover:bg-destructive/90")} onClick={() => void onConfirm()}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

`src/components/ResumenCards.tsx`:

```tsx
import Decimal from "decimal.js";
import type { Resumen } from "@/domain/campanaView";
import { formatPct, formatUsd } from "@/domain/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function Stat({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", danger && "text-destructive")}>{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="px-4 text-xs text-destructive">{hint}</CardContent>}
    </Card>
  );
}

export function ResumenCards({ resumen, etiquetaAsignado = "Saldo asignado" }: { resumen: Resumen; etiquetaAsignado?: string }) {
  const pagoDeMas = new Decimal(resumen.restante).isNegative();
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label={etiquetaAsignado} value={formatUsd(resumen.asignado)} />
      <Stat label="Pagado" value={formatUsd(resumen.pagado)} />
      <Stat label="Restante" value={formatUsd(resumen.restante)} danger={pagoDeMas} hint={pagoDeMas ? "Pagado de más" : undefined} />
      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardDescription>Avance</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{formatPct(resumen.pct)}</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <Progress value={resumen.pct} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Componentes de imagen**

`src/components/StoredImage.tsx`:

```tsx
import { useEffect, useState, type CSSProperties } from "react";
import { loadImageUrl } from "@/platform/images";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

type Props = { path: string; alt?: string; className?: string; style?: CSSProperties };

export function StoredImage({ path, alt = "Comprobante", className, style }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    setUrl(null);
    loadImageUrl(path)
      .then((u) => {
        if (alive) {
          created = u;
          setUrl(u);
        } else URL.revokeObjectURL(u);
      })
      .catch((e) => reportError(e, "No se pudo cargar la imagen"));
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);
  if (!url) return <div className={cn("animate-pulse bg-muted", className)} style={style} />;
  return <img src={url} alt={alt} className={className} style={style} />;
}
```

`src/components/ImageViewer.tsx`:

```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StoredImage } from "./StoredImage";

type Props = { path: string | null; open: boolean; onOpenChange: (open: boolean) => void };

export function ImageViewer({ path, open, onOpenChange }: Props) {
  const [zoom, setZoom] = useState(1);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setZoom(1);
      }}
    >
      <DialogContent className="flex h-[90vh] max-w-[90vw] flex-col sm:max-w-[90vw]">
        <DialogHeader>
          <DialogTitle>Comprobante</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
            −
          </Button>
          <span className="w-14 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
            +
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(1)}>
            Ajustar
          </Button>
        </div>
        <div className="flex-1 overflow-auto rounded border bg-muted/30">
          {path && <StoredImage path={path} className="max-w-none" style={{ width: `${zoom * 100}%` }} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/ComprobanteThumb.tsx`:

```tsx
import { useState } from "react";
import { StoredImage } from "./StoredImage";
import { ImageViewer } from "./ImageViewer";

export function ComprobanteThumb({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title="Ver comprobante"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <StoredImage path={path} className="size-10 rounded border object-cover" />
      </button>
      <ImageViewer path={path} open={open} onOpenChange={setOpen} />
    </>
  );
}
```

`src/components/ImageDrop.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ACCEPTED_IMAGE_TYPES, type ImagenValue } from "@/platform/images";
import { StoredImage } from "./StoredImage";
import { cn } from "@/lib/utils";

type Props = {
  value: ImagenValue;
  onChange: (v: ImagenValue) => void;
  pasteEnabled?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function ImageDrop({ value, onChange, pasteEnabled = true, disabled = false, label = "Imagen", className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const accept = useCallback(
    (f: Blob | null | undefined) => {
      if (!f) return;
      if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) {
        toast.error("Formato no soportado. Usa PNG, JPG o WEBP.");
        return;
      }
      if (value?.kind === "new") URL.revokeObjectURL(value.previewUrl);
      onChange({ kind: "new", file: f, previewUrl: URL.createObjectURL(f) });
    },
    [value, onChange],
  );

  useEffect(() => {
    if (!pasteEnabled || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      accept(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pasteEnabled, disabled, accept]);

  const quitar = () => {
    if (value?.kind === "new") URL.revokeObjectURL(value.previewUrl);
    onChange(null);
  };

  const preview =
    value?.kind === "new" ? (
      <img src={value.previewUrl} alt={label} className="max-h-full max-w-full object-contain" />
    ) : value?.kind === "stored" ? (
      <StoredImage path={value.path} alt={label} className="max-h-full max-w-full object-contain" />
    ) : null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex h-8 items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {value && !disabled && (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>
              Cambiar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={quitar}>
              Quitar
            </Button>
          </div>
        )}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) accept(e.dataTransfer.files[0]);
        }}
        onClick={() => {
          if (!value && !disabled) inputRef.current?.click();
        }}
        className={cn(
          "flex min-h-48 flex-1 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted/30 p-2",
          over && "border-primary bg-primary/5",
          !value && !disabled && "cursor-pointer",
        )}
      >
        {preview ?? (
          <div className="text-center text-sm text-muted-foreground">
            <ImagePlus className="mx-auto mb-2 size-8" />
            Arrastra la imagen, pégala con Ctrl+V
            <br />o haz clic para elegir un archivo
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        hidden
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

- [ ] **Step 6: Layout, router y arranque**

`src/components/AppLayout.tsx`:

```tsx
import { NavLink, Outlet } from "react-router";
import { FolderKanban, LineChart, Settings, Users } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const items = [
  { to: "/campanas", label: "Campañas", icon: FolderKanban },
  { to: "/gerentes", label: "Gerentes", icon: Users },
  { to: "/tasas", label: "Tasas", icon: LineChart },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppLayout() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/40 p-3">
        <div className="px-2 py-3 text-lg font-semibold">Control de Pagos</div>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn("flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted", isActive && "bg-muted font-medium")}
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
```

`src/App.tsx` (reemplaza la prueba de vida de la Task 10):

```tsx
import { createHashRouter, Navigate } from "react-router";
import { AppLayout } from "@/components/AppLayout";

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/campanas" replace /> },
      // Las rutas de cada pantalla se agregan aquí en las tasks 12–15.
      { path: "*", element: <Navigate to="/campanas" replace /> },
    ],
  },
]);
```

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./App";
import { reportError } from "./lib/reportError";
import "./index.css";

window.addEventListener("unhandledrejection", (e) => reportError(e.reason));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
```

Si la versión instalada de `react-router` no exporta `RouterProvider` desde `"react-router"`, impórtalo desde `"react-router/dom"`.

- [ ] **Step 7: Verificar**

Run: `pnpm test` → Expected: PASS
Run: `pnpm build` → Expected: sin errores
Run: `pnpm tauri dev` → Expected: aparece la barra lateral con las 4 entradas. Al hacer clic en cada una, la URL cambia y por ahora redirige a Campañas, que todavía está vacía.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "feat(ui): layout, router, useData, componentes compartidos e interfaz Extractor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Pantallas de Gerentes y Tasas (con exportación de tasas)

**Files:**
- Create: `src/features/gerentes/GerentesPage.tsx`, `src/features/gerentes/GerenteFormDialog.tsx`, `src/features/tasas/TasasPage.tsx`, `src/features/tasas/TasaFormDialog.tsx`, `src/export/saveWorkbook.ts`
- Modify: `src/App.tsx` (rutas `gerentes` y `tasas`)

**Interfaces:**
- Consumes: repos de las Tasks 6 y 7; validaciones de la Task 3; componentes y `useData`/`invalidate` de la Task 11; `persistImagen` de la Task 10; `buildTasasWorkbook` y `archivoExcel` de la Task 9.
- Produces:
  - `saveWorkbook(wb: ExcelJS.Workbook, defaultName: string): Promise<boolean>` (`false` si el usuario cancela).
  - `<TasaFormDialog tasa: TasaConUsos | null; fechaFija?: string; open; onOpenChange; onSaved?: (t: Tasa) => void />`. Se reutiliza en la Task 14.

- [ ] **Step 1: `saveWorkbook`**

`src/export/saveWorkbook.ts`:

```ts
import type ExcelJS from "exceljs";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export async function saveWorkbook(wb: ExcelJS.Workbook, defaultName: string): Promise<boolean> {
  const path = await save({ defaultPath: defaultName, filters: [{ name: "Excel", extensions: ["xlsx"] }] });
  if (!path) return false;
  const buffer = await wb.xlsx.writeBuffer();
  await writeFile(path, new Uint8Array(buffer as ArrayBuffer));
  return true;
}
```

- [ ] **Step 2: Gerentes**

`src/features/gerentes/GerenteFormDialog.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { getDb } from "@/db";
import { createGerente, updateGerente, type Gerente } from "@/db/repos/gerentes";
import { validateGerente, type GerenteDraft } from "@/domain/validation";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = { gerente: Gerente | null; open: boolean; onOpenChange: (open: boolean) => void };

export function GerenteFormDialog({ gerente, open, onOpenChange }: Props) {
  const [draft, setDraft] = useState<GerenteDraft>({ nombre: "", telefono: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof GerenteDraft, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({ nombre: gerente?.nombre ?? "", telefono: gerente?.telefono ?? "" });
    setErrors({});
  }, [open, gerente]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateGerente(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      if (gerente) await updateGerente(db, gerente.id, r.value);
      else await createGerente(db, r.value);
      toast.success(gerente ? "Gerente actualizado" : "Gerente creado");
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{gerente ? "Editar gerente" : "Nuevo gerente"}</DialogTitle>
          </DialogHeader>
          <Field id="g-nombre" label="Nombre" error={errors.nombre}>
            <Input id="g-nombre" autoFocus value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
          </Field>
          <Field id="g-tel" label="Teléfono (opcional)">
            <Input id="g-tel" value={draft.telefono} onChange={(e) => setDraft({ ...draft, telefono: e.target.value })} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`src/features/gerentes/GerentesPage.tsx`:

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { getDb } from "@/db";
import { listGerentesConCampanas, setGerenteActivo, type Gerente } from "@/db/repos/gerentes";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { GerenteFormDialog } from "./GerenteFormDialog";

export function GerentesPage() {
  const { data, error } = useData((db) => listGerentesConCampanas(db), []);
  const [dialog, setDialog] = useState<{ open: boolean; gerente: Gerente | null }>({ open: false, gerente: null });
  const [verInactivos, setVerInactivos] = useState(false);

  async function toggleActivo(g: Gerente) {
    try {
      await setGerenteActivo(await getDb(), g.id, !g.activo);
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  const filas = (data ?? []).filter((g) => verInactivos || g.activo);

  return (
    <div>
      <PageHeader
        title="Gerentes"
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
              Ver inactivos
            </label>
            <Button onClick={() => setDialog({ open: true, gerente: null })}>
              <Plus />
              Nuevo gerente
            </Button>
          </>
        }
      />
      {!data ? (
        <Cargando error={error} />
      ) : filas.length === 0 ? (
        <Vacio texto="Todavía no hay gerentes." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Campañas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.nombre}</TableCell>
                <TableCell>{g.telefono ?? "—"}</TableCell>
                <TableCell className="max-w-80">
                  <div className="flex flex-wrap gap-1">
                    {g.campanas.length === 0 ? "—" : g.campanas.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
                  </div>
                </TableCell>
                <TableCell>{g.activo ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, gerente: g })}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActivo(g)}>
                    {g.activo ? "Desactivar" : "Activar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <GerenteFormDialog gerente={dialog.gerente} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}
```

- [ ] **Step 3: Tasas**

`src/features/tasas/TasaFormDialog.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { Aviso } from "@/components/Feedback";
import { ImageDrop } from "@/components/ImageDrop";
import { getDb } from "@/db";
import { createTasa, getTasa, updateTasa, type Tasa, type TasaConUsos } from "@/db/repos/tasas";
import { validateTasa, type TasaDraft } from "@/domain/validation";
import { parseMonto, toInputVE } from "@/domain/money";
import { todayIso } from "@/domain/dates";
import { persistImagen, type ImagenValue } from "@/platform/images";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = {
  tasa: TasaConUsos | null;
  fechaFija?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (t: Tasa) => void;
};

export function TasaFormDialog({ tasa, fechaFija, open, onOpenChange, onSaved }: Props) {
  const [draft, setDraft] = useState<TasaDraft>({ fecha: "", valor: "", notas: "" });
  const [imagen, setImagen] = useState<ImagenValue>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof TasaDraft, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({ fecha: tasa?.fecha ?? fechaFija ?? todayIso(), valor: tasa ? toInputVE(tasa.valor) : "", notas: tasa?.notas ?? "" });
    setImagen(tasa?.imagenPath ? { kind: "stored", path: tasa.imagenPath } : null);
    setErrors({});
  }, [open, tasa, fechaFija]);

  const nuevoValor = parseMonto(draft.valor);
  const afectados = tasa && nuevoValor !== null && nuevoValor !== tasa.valor ? tasa.usos : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateTasa(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      const imagenPath = await persistImagen(imagen);
      let id: number;
      if (tasa) {
        await updateTasa(db, tasa.id, { valor: r.value.valor, notas: r.value.notas, imagenPath });
        id = tasa.id;
      } else {
        id = await createTasa(db, { ...r.value, imagenPath });
      }
      const guardada = await getTasa(db, id);
      toast.success(tasa ? "Tasa actualizada" : "Tasa registrada");
      invalidate();
      onOpenChange(false);
      if (guardada) onSaved?.(guardada);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{tasa ? "Editar tasa" : "Registrar tasa del día"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field id="t-fecha" label="Fecha" error={errors.fecha}>
              <Input
                id="t-fecha"
                type="date"
                value={draft.fecha}
                disabled={tasa != null || fechaFija != null}
                onChange={(e) => setDraft({ ...draft, fecha: e.target.value })}
              />
            </Field>
            <Field id="t-valor" label="Bs por USD" error={errors.valor} hint="Ej. 36,50">
              <Input
                id="t-valor"
                autoFocus
                inputMode="decimal"
                className="text-right tabular-nums"
                value={draft.valor}
                onChange={(e) => setDraft({ ...draft, valor: e.target.value })}
              />
            </Field>
          </div>
          {afectados > 0 && <Aviso tono="warning">Cambiar esta tasa recalcula {afectados} depósito(s).</Aviso>}
          <Field id="t-notas" label="Notas (opcional)">
            <Textarea id="t-notas" rows={2} value={draft.notas} onChange={(e) => setDraft({ ...draft, notas: e.target.value })} />
          </Field>
          <ImageDrop label="Captura de la tasa (opcional)" value={imagen} onChange={setImagen} pasteEnabled={open} className="h-56" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {afectados > 0 ? `Guardar (afecta ${afectados})` : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`src/features/tasas/TasasPage.tsx`:

```tsx
import { useState } from "react";
import { FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { ComprobanteThumb } from "@/components/ComprobanteThumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { deleteTasa, listTasas, type TasaConUsos } from "@/db/repos/tasas";
import { formatFecha, todayIso } from "@/domain/dates";
import { formatTasa } from "@/domain/money";
import { buildTasasWorkbook } from "@/export/tasasWorkbook";
import { archivoExcel } from "@/export/fileName";
import { saveWorkbook } from "@/export/saveWorkbook";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { TasaFormDialog } from "./TasaFormDialog";

export function TasasPage() {
  const { data, error } = useData((db) => listTasas(db), []);
  const [dialog, setDialog] = useState<{ open: boolean; tasa: TasaConUsos | null }>({ open: false, tasa: null });
  const [borrar, setBorrar] = useState<TasaConUsos | null>(null);

  async function exportar() {
    try {
      if (await saveWorkbook(buildTasasWorkbook(data ?? []), archivoExcel("tasas", todayIso()))) toast.success("Excel guardado");
    } catch (e) {
      reportError(e, "Exportar");
    }
  }

  async function eliminar(t: TasaConUsos) {
    try {
      await deleteTasa(await getDb(), t.id);
      toast.success("Tasa eliminada");
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setBorrar(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasas"
        subtitle="Histórico de la tasa del día (Bs por USD)"
        actions={
          <>
            <Button variant="outline" onClick={exportar} disabled={!data?.length}>
              <FileSpreadsheet />
              Exportar a Excel
            </Button>
            <Button onClick={() => setDialog({ open: true, tasa: null })}>
              <Plus />
              Nueva tasa
            </Button>
          </>
        }
      />
      {!data ? (
        <Cargando error={error} />
      ) : data.length === 0 ? (
        <Vacio texto="Todavía no hay tasas registradas." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Bs por USD</TableHead>
              <TableHead>Captura</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">Depósitos</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{formatFecha(t.fecha)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatTasa(t.valor)}</TableCell>
                <TableCell>{t.imagenPath ? <ComprobanteThumb path={t.imagenPath} /> : "—"}</TableCell>
                <TableCell className="max-w-64 truncate" title={t.notas ?? ""}>
                  {t.notas ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{t.usos}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, tasa: t })}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={t.usos > 0}
                    title={t.usos > 0 ? "En uso: no se puede eliminar" : undefined}
                    onClick={() => setBorrar(t)}
                  >
                    Eliminar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <TasaFormDialog tasa={dialog.tasa} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <ConfirmDialog
        open={borrar !== null}
        onOpenChange={(o) => !o && setBorrar(null)}
        title="Eliminar tasa"
        description={borrar ? `Se eliminará la tasa del ${formatFecha(borrar.fecha)}.` : ""}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => (borrar ? eliminar(borrar) : undefined)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rutas**

En `src/App.tsx`, agrega los imports y estas líneas a `children`, antes de la ruta `"*"`:

```tsx
import { GerentesPage } from "@/features/gerentes/GerentesPage";
import { TasasPage } from "@/features/tasas/TasasPage";
// …
      { path: "gerentes", element: <GerentesPage /> },
      { path: "tasas", element: <TasasPage /> },
```

- [ ] **Step 5: Verificar manualmente**

Run: `pnpm build` → sin errores. Run: `pnpm tauri dev` y comprueba:
1. Crear dos gerentes, editar uno, desactivarlo y verlo con "Ver inactivos".
2. Crear una tasa con `36,50` y pegar una captura con Ctrl+V. Debe aparecer la miniatura, y al hacer clic se abre el visor con zoom.
3. Intentar crear otra tasa para la misma fecha muestra el toast "Ya existe una tasa para el …".
4. "Exportar a Excel" guarda un `.xlsx` que se abre en Excel con las tasas.
5. Eliminar una tasa sin uso funciona.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat(ui): pantallas de gerentes y de histórico de tasas con exportación

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Campañas: lista, vista general con pestañas, asignaciones y exportación

**Files:**
- Create: `src/components/EstadoBadge.tsx`, `src/components/DepositosTable.tsx`, `src/features/campanas/CampanasPage.tsx`, `src/features/campanas/CampanaFormDialog.tsx`, `src/features/campana/CampanaPage.tsx`, `src/features/campana/PorGerenteTab.tsx`, `src/features/campana/TodosDepositosTab.tsx`, `src/features/campana/AsignacionFormDialog.tsx`
- Modify: `src/App.tsx` (rutas `campanas` y `campanas/:campanaId`)

**Interfaces:**
- Consumes: repos (Tasks 6–8), `buildCampanaView`/`filtrarDepositos` (Task 4), `buildCampanaWorkbook`/`archivoExcel` (Task 9), `saveWorkbook` (Task 12), componentes (Task 11).
- Produces:
  - `<EstadoBadge estado />`
  - `<DepositosTable filas: FilaDeposito[]; mostrarGerente: boolean; saldoLabel: string; totales?: { totalBs; totalUsd; cantidad } />`: al hacer clic en una fila se navega a `/depositos/:id`. Se reutiliza en la Task 14.

- [ ] **Step 1: Componentes reutilizables**

`src/components/EstadoBadge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import type { EstadoCampana } from "@/db/repos/campanas";

export function EstadoBadge({ estado }: { estado: EstadoCampana }) {
  return estado === "activa" ? <Badge>Activa</Badge> : <Badge variant="secondary">Cerrada</Badge>;
}
```

`src/components/DepositosTable.tsx`:

```tsx
import Decimal from "decimal.js";
import { useNavigate } from "react-router";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FilaDeposito } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatNumberVE, formatTasa, formatUsd } from "@/domain/money";
import { ComprobanteThumb } from "./ComprobanteThumb";
import { Vacio } from "./Feedback";
import { cn } from "@/lib/utils";

type Props = {
  filas: FilaDeposito[];
  mostrarGerente: boolean;
  saldoLabel: string;
  totales?: { totalBs: string; totalUsd: string; cantidad: number };
};

export function DepositosTable({ filas, mostrarGerente, saldoLabel, totales }: Props) {
  const navigate = useNavigate();
  if (filas.length === 0) return <Vacio texto="No hay depósitos." />;
  const num = "text-right tabular-nums";
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          {mostrarGerente && <TableHead>Gerente</TableHead>}
          <TableHead>Banco</TableHead>
          <TableHead>Referencia</TableHead>
          <TableHead>Cuenta destino</TableHead>
          <TableHead className="text-right">Monto Bs</TableHead>
          <TableHead className="text-right">Tasa</TableHead>
          <TableHead className="text-right">USD</TableHead>
          <TableHead className="text-right">{saldoLabel}</TableHead>
          <TableHead>Observaciones</TableHead>
          <TableHead>Comprobante</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((d) => (
          <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/depositos/${d.id}`)}>
            <TableCell>{formatFecha(d.fecha)}</TableCell>
            {mostrarGerente && <TableCell>{d.gerenteNombre}</TableCell>}
            <TableCell>{d.banco}</TableCell>
            <TableCell className="font-mono">{d.referencia}</TableCell>
            <TableCell className="font-mono text-xs">{d.cuentaDestino}</TableCell>
            <TableCell className={num}>{formatNumberVE(d.montoBs)}</TableCell>
            <TableCell className={num}>{formatTasa(d.tasaValor)}</TableCell>
            <TableCell className={num}>{formatUsd(d.usd)}</TableCell>
            <TableCell className={cn(num, new Decimal(d.saldoMostrado).isNegative() && "font-medium text-destructive")}>{formatUsd(d.saldoMostrado)}</TableCell>
            <TableCell className="max-w-48 truncate" title={d.observaciones ?? ""}>
              {d.observaciones}
            </TableCell>
            <TableCell>{d.imagenPath ? <ComprobanteThumb path={d.imagenPath} /> : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      {totales && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={mostrarGerente ? 5 : 4}>Total ({totales.cantidad} depósitos)</TableCell>
            <TableCell className={num}>{formatNumberVE(totales.totalBs)}</TableCell>
            <TableCell />
            <TableCell className={num}>{formatUsd(totales.totalUsd)}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
```

- [ ] **Step 2: Lista de campañas y formulario**

`src/features/campanas/CampanaFormDialog.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/Field";
import { getDb } from "@/db";
import { createCampana, updateCampana, type Campana } from "@/db/repos/campanas";
import { validateCampana, type CampanaDraft } from "@/domain/validation";
import { todayIso } from "@/domain/dates";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = { campana: Campana | null; open: boolean; onOpenChange: (open: boolean) => void; onCreated?: (id: number) => void };

export function CampanaFormDialog({ campana, open, onOpenChange, onCreated }: Props) {
  const [draft, setDraft] = useState<CampanaDraft>({ nombre: "", fechaInicio: "", fechaFin: "", notas: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof CampanaDraft, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({
      nombre: campana?.nombre ?? "",
      fechaInicio: campana?.fechaInicio ?? todayIso(),
      fechaFin: campana?.fechaFin ?? "",
      notas: campana?.notas ?? "",
    });
    setErrors({});
  }, [open, campana]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateCampana(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      if (campana) {
        await updateCampana(db, campana.id, r.value);
        toast.success("Campaña actualizada");
      } else {
        const id = await createCampana(db, r.value);
        toast.success("Campaña creada");
        onCreated?.(id);
      }
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof CampanaDraft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{campana ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
          </DialogHeader>
          <Field id="c-nombre" label="Nombre" error={errors.nombre}>
            <Input id="c-nombre" autoFocus value={draft.nombre} onChange={set("nombre")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field id="c-inicio" label="Inicio" error={errors.fechaInicio}>
              <Input id="c-inicio" type="date" value={draft.fechaInicio} onChange={set("fechaInicio")} />
            </Field>
            <Field id="c-fin" label="Fin (opcional)" error={errors.fechaFin}>
              <Input id="c-fin" type="date" value={draft.fechaFin} onChange={set("fechaFin")} />
            </Field>
          </div>
          <Field id="c-notas" label="Notas (opcional)">
            <Textarea id="c-notas" rows={2} value={draft.notas} onChange={set("notas")} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`src/features/campanas/CampanasPage.tsx`:

```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { EstadoBadge } from "@/components/EstadoBadge";
import { listCampanas } from "@/db/repos/campanas";
import { loadCampanaData } from "@/db/queries/campanaData";
import { buildCampanaView } from "@/domain/campanaView";
import { formatPeriodo } from "@/domain/dates";
import { formatPct, formatUsd } from "@/domain/money";
import { useData } from "@/hooks/useData";
import { CampanaFormDialog } from "./CampanaFormDialog";

export function CampanasPage() {
  const navigate = useNavigate();
  const [nueva, setNueva] = useState(false);
  const { data, error } = useData(async (db) => {
    const campanas = await listCampanas(db);
    return Promise.all(
      campanas.map(async (campana) => {
        const d = await loadCampanaData(db, campana.id);
        return { campana, total: buildCampanaView(d.asignaciones, d.depositos).total, gerentes: d.asignaciones.length };
      }),
    );
  }, []);

  return (
    <div>
      <PageHeader
        title="Campañas"
        actions={
          <Button onClick={() => setNueva(true)}>
            <Plus />
            Nueva campaña
          </Button>
        }
      />
      {!data ? (
        <Cargando error={error} />
      ) : data.length === 0 ? (
        <Vacio texto="Todavía no hay campañas. Crea la primera." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map(({ campana, total, gerentes }) => (
            <Link key={campana.id} to={`/campanas/${campana.id}`}>
              <Card className="transition-colors hover:border-primary">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{campana.nombre}</CardTitle>
                    <EstadoBadge estado={campana.estado} />
                  </div>
                  <CardDescription>
                    {formatPeriodo(campana.fechaInicio, campana.fechaFin)} · {gerentes} gerente(s)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="tabular-nums">
                      {formatUsd(total.pagado)} de {formatUsd(total.asignado)}
                    </span>
                    <span className="font-medium tabular-nums">{formatPct(total.pct)}</span>
                  </div>
                  <Progress value={total.pct} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <CampanaFormDialog campana={null} open={nueva} onOpenChange={setNueva} onCreated={(id) => navigate(`/campanas/${id}`)} />
    </div>
  );
}
```

- [ ] **Step 3: Diálogo de asignación**

`src/features/campana/AsignacionFormDialog.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { NativeSelect } from "@/components/NativeSelect";
import { getDb } from "@/db";
import { listGerentes } from "@/db/repos/gerentes";
import { createAsignacion, updateSaldoAsignacion } from "@/db/repos/asignaciones";
import { validateSaldo } from "@/domain/validation";
import { toInputVE } from "@/domain/money";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

export type AsignacionEditable = { id: number; gerenteNombre: string; saldoUsd: string };

type Props = {
  campanaId: number;
  gerentesEnCampana: number[];
  asignacion: AsignacionEditable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AsignacionFormDialog({ campanaId, gerentesEnCampana, asignacion, open, onOpenChange }: Props) {
  const { data: gerentes } = useData((db) => listGerentes(db, { soloActivos: true }), []);
  const [gerenteId, setGerenteId] = useState("");
  const [saldo, setSaldo] = useState("");
  const [errors, setErrors] = useState<{ gerenteId?: string; saldoUsd?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGerenteId("");
    setSaldo(asignacion ? toInputVE(asignacion.saldoUsd) : "");
    setErrors({});
  }, [open, asignacion]);

  const disponibles = (gerentes ?? []).filter((g) => !gerentesEnCampana.includes(g.id));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const r = validateSaldo(saldo);
    const errs: typeof errors = r.ok ? {} : { ...r.errors };
    if (!asignacion && !gerenteId) errs.gerenteId = "Elige un gerente";
    if (!r.ok || errs.gerenteId) return setErrors(errs);
    setSaving(true);
    try {
      const db = await getDb();
      if (asignacion) await updateSaldoAsignacion(db, asignacion.id, r.value);
      else await createAsignacion(db, { campanaId, gerenteId: Number(gerenteId), saldoUsd: r.value });
      toast.success(asignacion ? "Saldo actualizado" : "Gerente agregado a la campaña");
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{asignacion ? `Saldo de ${asignacion.gerenteNombre}` : "Agregar gerente a la campaña"}</DialogTitle>
          </DialogHeader>
          {!asignacion && (
            <Field id="a-gerente" label="Gerente" error={errors.gerenteId} hint={disponibles.length === 0 ? "No hay gerentes disponibles: créalos en Gerentes." : undefined}>
              <NativeSelect id="a-gerente" value={gerenteId} onChange={(e) => setGerenteId(e.target.value)}>
                <option value="">Selecciona…</option>
                {disponibles.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nombre}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <Field id="a-saldo" label="Saldo a pagar (USD)" error={errors.saldoUsd} hint="Ej. 1.500,00">
            <Input id="a-saldo" autoFocus={!!asignacion} inputMode="decimal" className="text-right tabular-nums" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Pestañas**

`src/features/campana/PorGerenteTab.tsx`:

```tsx
import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { useNavigate } from "react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Vacio } from "@/components/Feedback";
import type { GerenteResumen } from "@/domain/campanaView";
import { formatFecha } from "@/domain/dates";
import { formatPct, formatUsd } from "@/domain/money";
import { cn } from "@/lib/utils";

type Key = "gerenteNombre" | "asignado" | "pagado" | "restante" | "pct" | "cantidad" | "ultimaFecha";
const COLS: { key: Key; label: string; numeric?: boolean }[] = [
  { key: "gerenteNombre", label: "Gerente" },
  { key: "asignado", label: "Asignado", numeric: true },
  { key: "pagado", label: "Pagado", numeric: true },
  { key: "restante", label: "Restante", numeric: true },
  { key: "pct", label: "% avance", numeric: true },
  { key: "cantidad", label: "Depósitos", numeric: true },
  { key: "ultimaFecha", label: "Último depósito" },
];
const DECIMALES: Key[] = ["asignado", "pagado", "restante"];

function compare(a: GerenteResumen, b: GerenteResumen, key: Key): number {
  const va = a[key];
  const vb = b[key];
  if (va == null) return vb == null ? 0 : -1;
  if (vb == null) return 1;
  if (DECIMALES.includes(key)) return new Decimal(va).cmp(vb as string);
  if (typeof va === "number") return va - (vb as number);
  return String(va).localeCompare(String(vb), "es");
}

type Props = {
  gerentes: GerenteResumen[];
  cerrada: boolean;
  onEditarSaldo: (g: GerenteResumen) => void;
  onQuitar: (g: GerenteResumen) => void;
};

export function PorGerenteTab({ gerentes, cerrada, onEditarSaldo, onQuitar }: Props) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "gerenteNombre", dir: 1 });
  const filas = useMemo(() => [...gerentes].sort((a, b) => compare(a, b, sort.key) * sort.dir), [gerentes, sort]);

  if (gerentes.length === 0) return <Vacio texto="Agrega gerentes a la campaña con su saldo a pagar." />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLS.map((c) => (
            <TableHead key={c.key} className={cn(c.numeric && "text-right")}>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
              >
                {c.label}
                {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
              </button>
            </TableHead>
          ))}
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((g) => (
          <TableRow key={g.asignacionId} className="cursor-pointer" onClick={() => navigate(`/asignaciones/${g.asignacionId}`)}>
            <TableCell className="font-medium">{g.gerenteNombre}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(g.asignado)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatUsd(g.pagado)}</TableCell>
            <TableCell className={cn("text-right tabular-nums", new Decimal(g.restante).isNegative() && "text-destructive")}>{formatUsd(g.restante)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPct(g.pct)}</TableCell>
            <TableCell className="text-right tabular-nums">{g.cantidad}</TableCell>
            <TableCell>{g.ultimaFecha ? formatFecha(g.ultimaFecha) : "—"}</TableCell>
            <TableCell className="space-x-2 text-right" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="outline" disabled={cerrada} onClick={() => onEditarSaldo(g)}>
                Editar saldo
              </Button>
              {g.cantidad === 0 && (
                <Button size="sm" variant="ghost" disabled={cerrada} onClick={() => onQuitar(g)}>
                  Quitar
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

`src/features/campana/TodosDepositosTab.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/NativeSelect";
import { DepositosTable } from "@/components/DepositosTable";
import { filtrarDepositos, type CampanaView } from "@/domain/campanaView";

const VACIO = { gerenteId: "", banco: "", desde: "", hasta: "" };

export function TodosDepositosTab({ view }: { view: CampanaView }) {
  const [f, setF] = useState(VACIO);
  const bancos = useMemo(
    () => Array.from(new Set(view.depositos.map((d) => d.banco.trim()))).sort((a, b) => a.localeCompare(b, "es")),
    [view],
  );
  const r = useMemo(
    () =>
      filtrarDepositos(view.depositos, {
        gerenteId: f.gerenteId ? Number(f.gerenteId) : null,
        banco: f.banco || null,
        desde: f.desde || null,
        hasta: f.hasta || null,
      }),
    [view, f],
  );
  const porGerente = f.gerenteId !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid w-52 gap-1.5">
          <Label htmlFor="f-gerente">Gerente</Label>
          <NativeSelect id="f-gerente" value={f.gerenteId} onChange={(e) => setF({ ...f, gerenteId: e.target.value })}>
            <option value="">Todos</option>
            {view.gerentes.map((g) => (
              <option key={g.gerenteId} value={g.gerenteId}>
                {g.gerenteNombre}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid w-44 gap-1.5">
          <Label htmlFor="f-banco">Banco</Label>
          <NativeSelect id="f-banco" value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })}>
            <option value="">Todos</option>
            {bancos.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-desde">Desde</Label>
          <Input id="f-desde" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-hasta">Hasta</Label>
          <Input id="f-hasta" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
        </div>
        <Button variant="ghost" onClick={() => setF(VACIO)}>
          Limpiar
        </Button>
      </div>
      <DepositosTable filas={r.filas} mostrarGerente saldoLabel={porGerente ? "Saldo del gerente" : "Saldo general restante"} totales={r} />
    </div>
  );
}
```

- [ ] **Step 5: Vista de la campaña**

`src/features/campana/CampanaPage.tsx`:

```tsx
import { useState } from "react";
import { useParams } from "react-router";
import { FileSpreadsheet, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { EstadoBadge } from "@/components/EstadoBadge";
import { ResumenCards } from "@/components/ResumenCards";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { loadCampanaData } from "@/db/queries/campanaData";
import { setEstadoCampana } from "@/db/repos/campanas";
import { deleteAsignacion } from "@/db/repos/asignaciones";
import { buildCampanaView, type GerenteResumen } from "@/domain/campanaView";
import { formatPeriodo, todayIso } from "@/domain/dates";
import { buildCampanaWorkbook } from "@/export/campanaWorkbook";
import { archivoExcel } from "@/export/fileName";
import { saveWorkbook } from "@/export/saveWorkbook";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { CampanaFormDialog } from "@/features/campanas/CampanaFormDialog";
import { AsignacionFormDialog, type AsignacionEditable } from "./AsignacionFormDialog";
import { PorGerenteTab } from "./PorGerenteTab";
import { TodosDepositosTab } from "./TodosDepositosTab";

export function CampanaPage() {
  const campanaId = Number(useParams().campanaId);
  const { data, error } = useData(async (db) => {
    const d = await loadCampanaData(db, campanaId);
    return { ...d, view: buildCampanaView(d.asignaciones, d.depositos) };
  }, [campanaId]);
  const [tab, setTab] = useState("gerentes");
  const [editar, setEditar] = useState(false);
  const [asig, setAsig] = useState<{ open: boolean; asignacion: AsignacionEditable | null }>({ open: false, asignacion: null });
  const [confirmEstado, setConfirmEstado] = useState(false);
  const [quitar, setQuitar] = useState<GerenteResumen | null>(null);

  if (!data) return <Cargando error={error} />;
  const { campana, view, asignaciones } = data;
  const cerrada = campana.estado === "cerrada";

  async function cambiarEstado() {
    try {
      await setEstadoCampana(await getDb(), campanaId, cerrada ? "activa" : "cerrada");
      toast.success(cerrada ? "Campaña reabierta" : "Campaña cerrada");
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setConfirmEstado(false);
    }
  }

  async function quitarGerente(g: GerenteResumen) {
    try {
      await deleteAsignacion(await getDb(), g.asignacionId);
      toast.success(`${g.gerenteNombre} quitado de la campaña`);
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setQuitar(null);
    }
  }

  async function exportar() {
    try {
      if (await saveWorkbook(buildCampanaWorkbook(campana, view), archivoExcel(campana.nombre, todayIso()))) toast.success("Excel guardado");
    } catch (e) {
      reportError(e, "Exportar");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: "/campanas", label: "Campañas" }}
        title={
          <span className="flex items-center gap-3">
            {campana.nombre}
            <EstadoBadge estado={campana.estado} />
          </span>
        }
        subtitle={formatPeriodo(campana.fechaInicio, campana.fechaFin)}
        actions={
          <>
            <Button variant="outline" onClick={exportar}>
              <FileSpreadsheet />
              Exportar a Excel
            </Button>
            <Button variant="outline" disabled={cerrada} onClick={() => setEditar(true)}>
              Editar
            </Button>
            <Button variant="outline" onClick={() => setConfirmEstado(true)}>
              {cerrada ? "Reabrir" : "Cerrar campaña"}
            </Button>
            <Button disabled={cerrada} onClick={() => setAsig({ open: true, asignacion: null })}>
              <Plus />
              Agregar gerente
            </Button>
          </>
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: solo lectura. Reábrela para hacer cambios.</Aviso>}
      <ResumenCards resumen={view.total} etiquetaAsignado="Saldo general" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="gerentes">Por gerente ({view.gerentes.length})</TabsTrigger>
          <TabsTrigger value="depositos">Todos los depósitos ({view.depositos.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="gerentes">
          <PorGerenteTab
            gerentes={view.gerentes}
            cerrada={cerrada}
            onEditarSaldo={(g) => setAsig({ open: true, asignacion: { id: g.asignacionId, gerenteNombre: g.gerenteNombre, saldoUsd: g.asignado } })}
            onQuitar={setQuitar}
          />
        </TabsContent>
        <TabsContent value="depositos">
          <TodosDepositosTab view={view} />
        </TabsContent>
      </Tabs>

      <CampanaFormDialog campana={campana} open={editar} onOpenChange={setEditar} />
      <AsignacionFormDialog
        campanaId={campanaId}
        gerentesEnCampana={asignaciones.map((a) => a.gerenteId)}
        asignacion={asig.asignacion}
        open={asig.open}
        onOpenChange={(open) => setAsig((s) => ({ ...s, open }))}
      />
      <ConfirmDialog
        open={confirmEstado}
        onOpenChange={setConfirmEstado}
        title={cerrada ? "Reabrir campaña" : "Cerrar campaña"}
        description={cerrada ? "La campaña volverá a aceptar cambios." : "La campaña quedará de solo lectura: no se podrán registrar, editar ni eliminar depósitos."}
        confirmLabel={cerrada ? "Reabrir" : "Cerrar"}
        onConfirm={cambiarEstado}
      />
      <ConfirmDialog
        open={quitar !== null}
        onOpenChange={(o) => !o && setQuitar(null)}
        title="Quitar gerente"
        description={quitar ? `Se quitará a ${quitar.gerenteNombre} de esta campaña.` : ""}
        confirmLabel="Quitar"
        destructive
        onConfirm={() => (quitar ? quitarGerente(quitar) : undefined)}
      />
    </div>
  );
}
```

`g.asignado` viene con 2 decimales (`"100.00"`). `toInputVE` lo muestra como `100,00`, y eso es correcto.

- [ ] **Step 6: Rutas**

En `src/App.tsx`:

```tsx
import { CampanasPage } from "@/features/campanas/CampanasPage";
import { CampanaPage } from "@/features/campana/CampanaPage";
// …
      { path: "campanas", element: <CampanasPage /> },
      { path: "campanas/:campanaId", element: <CampanaPage /> },
```

- [ ] **Step 7: Verificar manualmente**

Run: `pnpm build` → sin errores. Run: `pnpm tauri dev`:
1. Crear la campaña "Marzo 2026". Se abre su vista con los indicadores en 0.
2. Agregar a Ana con `1.000,00` y a Luis con `500`. La pestaña "Por gerente" muestra 2 filas, y al hacer clic en un encabezado se ordena la tabla.
3. "Editar saldo" de Luis a `600`: el saldo general pasa a `$ 1.600,00`.
4. "Quitar" aparece solo para gerentes sin depósitos y funciona.
5. "Cerrar campaña" deshabilita Agregar y Editar y muestra el aviso. "Reabrir" lo revierte.
6. "Exportar a Excel" genera un archivo con las hojas Resumen, Todos los depósitos y una por gerente.
7. En la lista de campañas, la tarjeta muestra el % y la barra de avance.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "feat(ui): campañas, vista general con pestañas por gerente y todos los depósitos, exportación

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Vista de gerente en la campaña y formulario de depósito

**Files:**
- Create: `src/features/asignacion/AsignacionPage.tsx`, `src/features/deposito/DepositoPage.tsx`, `src/features/deposito/bancos.ts`
- Modify: `src/App.tsx` (rutas `asignaciones/:asignacionId`, `asignaciones/:asignacionId/depositos/nuevo` y `depositos/:depositoId`)
- Test: `src/features/deposito/bancos.test.ts`

**Interfaces:**
- Consumes: todo lo anterior; `TasaFormDialog` (Task 12); `DepositosTable` (Task 13); `extractor` (Task 11).
- Produces: `sugerenciasBancos(usados: string[]): string[]`, que une la lista base con los bancos usados, sin repetidos (sin distinguir mayúsculas) y ordenados.

- [ ] **Step 1: Prueba de `sugerenciasBancos`**

`src/features/deposito/bancos.test.ts`:

```ts
import { expect, it } from "vitest";
import { BANCOS_SUGERIDOS, sugerenciasBancos } from "./bancos";

it("une sugeridos y usados sin duplicar ignorando mayúsculas", () => {
  const r = sugerenciasBancos(["banesco", "Banco Plaza"]);
  expect(r).toContain("Banco Plaza");
  expect(r.filter((b) => b.toLowerCase() === "banesco")).toHaveLength(1);
  expect(r.length).toBe(BANCOS_SUGERIDOS.length + 1);
  expect([...r].sort((a, b) => a.localeCompare(b, "es"))).toEqual(r);
});
```

Run: `pnpm test src/features` → Expected: FAIL (no se resuelve `./bancos`)

- [ ] **Step 2: Implementar `bancos.ts`**

`src/features/deposito/bancos.ts`:

```ts
export const BANCOS_SUGERIDOS = [
  "100% Banco",
  "Activo",
  "Bancamiga",
  "Bancaribe",
  "Banco de Venezuela",
  "Banco del Tesoro",
  "Bancrecer",
  "Banesco",
  "Banfanb",
  "Banplus",
  "Bicentenario",
  "BNC",
  "Del Sur",
  "Exterior",
  "Mercantil",
  "Mi Banco",
  "Provincial",
  "R4",
  "Sofitasa",
  "Venezolano de Crédito",
];

export function sugerenciasBancos(usados: string[]): string[] {
  const porClave = new Map<string, string>();
  for (const b of [...BANCOS_SUGERIDOS, ...usados]) {
    const clave = b.trim().toLowerCase();
    if (clave && !porClave.has(clave)) porClave.set(clave, b.trim());
  }
  return [...porClave.values()].sort((a, b) => a.localeCompare(b, "es"));
}
```

Run: `pnpm test src/features` → Expected: PASS

- [ ] **Step 3: Vista del gerente en la campaña**

`src/features/asignacion/AsignacionPage.tsx`:

```tsx
import { Link, useParams } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { ResumenCards } from "@/components/ResumenCards";
import { DepositosTable } from "@/components/DepositosTable";
import { getAsignacion } from "@/db/repos/asignaciones";
import { loadCampanaData } from "@/db/queries/campanaData";
import { buildCampanaView, filtrarDepositos } from "@/domain/campanaView";
import { DomainError } from "@/domain/errors";
import { useData } from "@/hooks/useData";

export function AsignacionPage() {
  const asignacionId = Number(useParams().asignacionId);
  const { data, error } = useData(async (db) => {
    const a = await getAsignacion(db, asignacionId);
    if (!a) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
    const d = await loadCampanaData(db, a.campanaId);
    const view = buildCampanaView(d.asignaciones, d.depositos);
    const resumen = view.gerentes.find((g) => g.asignacionId === asignacionId);
    if (!resumen) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
    return { a, resumen, r: filtrarDepositos(view.depositos, { gerenteId: a.gerenteId }) };
  }, [asignacionId]);

  if (!data) return <Cargando error={error} />;
  const { a, resumen, r } = data;
  const cerrada = a.campanaEstado === "cerrada";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: `/campanas/${a.campanaId}`, label: a.campanaNombre }}
        title={a.gerenteNombre}
        subtitle={`Campaña ${a.campanaNombre}`}
        actions={
          cerrada ? (
            <Button disabled>
              <Plus />
              Registrar depósito
            </Button>
          ) : (
            <Button asChild>
              <Link to={`/asignaciones/${a.id}/depositos/nuevo`}>
                <Plus />
                Registrar depósito
              </Link>
            </Button>
          )
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: solo lectura.</Aviso>}
      <ResumenCards resumen={resumen} />
      <DepositosTable filas={r.filas} mostrarGerente={false} saldoLabel="Saldo restante" totales={r} />
    </div>
  );
}
```

- [ ] **Step 4: Formulario de depósito**

`src/features/deposito/DepositoPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Decimal from "decimal.js";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Aviso, Cargando } from "@/components/Feedback";
import { Field } from "@/components/Field";
import { ImageDrop } from "@/components/ImageDrop";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { getAsignacion, type AsignacionDetalle } from "@/db/repos/asignaciones";
import { createDeposito, deleteDeposito, findDuplicados, getDeposito, listBancosUsados, updateDeposito, type Deposito, type Duplicado } from "@/db/repos/depositos";
import { getTasaByFecha, type Tasa } from "@/db/repos/tasas";
import { loadCampanaData, type CampanaData } from "@/db/queries/campanaData";
import { buildCampanaView } from "@/domain/campanaView";
import { formatFecha, isValidIsoDate, todayIso } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { formatBs, formatTasa, formatUsd, parseMonto, toInputVE, toUsd } from "@/domain/money";
import { validateDeposito, type DepositoDraft } from "@/domain/validation";
import { extractor, type ExtractableField, type ExtractionResult } from "@/extraction/extractor";
import { persistImagen, type ImagenValue } from "@/platform/images";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";
import { TasaFormDialog } from "@/features/tasas/TasaFormDialog";
import { sugerenciasBancos } from "./bancos";

type Ctx = { deposito: Deposito | null; asignacion: AsignacionDetalle; data: CampanaData; bancos: string[] };

const vacio = (fecha: string): DepositoDraft => ({
  fecha,
  banco: "",
  referencia: "",
  cuentaDestino: "",
  montoBs: "",
  tasaId: null,
  observaciones: "",
});

export function DepositoPage() {
  const { depositoId, asignacionId } = useParams();
  const { data: ctx, error } = useData<Ctx>(async (db) => {
    const deposito = depositoId ? await getDeposito(db, Number(depositoId)) : null;
    if (depositoId && !deposito) throw new DomainError("NO_ENCONTRADO", "El depósito no existe");
    const asignacion = await getAsignacion(db, deposito?.asignacionId ?? Number(asignacionId));
    if (!asignacion) throw new DomainError("NO_ENCONTRADO", "El gerente no está en esta campaña");
    const data = await loadCampanaData(db, asignacion.campanaId);
    return { deposito, asignacion, data, bancos: sugerenciasBancos(await listBancosUsados(db)) };
  }, [depositoId, asignacionId]);

  if (!ctx) return <Cargando error={error} />;
  return <DepositoForm key={`${depositoId ?? "nuevo"}-${asignacionId ?? ""}`} {...ctx} />;
}

function confClass(c: number | undefined): string {
  if (c === undefined) return "";
  if (c >= 0.9) return "border-green-500";
  if (c >= 0.6) return "border-amber-500 bg-amber-50";
  return "border-red-500 bg-red-50";
}

function DepositoForm({ deposito, asignacion, data, bancos }: Ctx) {
  const navigate = useNavigate();
  const cerrada = asignacion.campanaEstado === "cerrada";
  const [draft, setDraft] = useState<DepositoDraft>(() =>
    deposito
      ? {
          fecha: deposito.fecha,
          banco: deposito.banco,
          referencia: deposito.referencia,
          cuentaDestino: deposito.cuentaDestino,
          montoBs: toInputVE(deposito.montoBs),
          tasaId: deposito.tasaId,
          observaciones: deposito.observaciones ?? "",
        }
      : vacio(todayIso()),
  );
  const [imagen, setImagen] = useState<ImagenValue>(deposito?.imagenPath ? { kind: "stored", path: deposito.imagenPath } : null);
  const [tasa, setTasa] = useState<Tasa | null | undefined>(undefined); // undefined = buscando
  const [tasaDialog, setTasaDialog] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof DepositoDraft, string>>>({});
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [confianza, setConfianza] = useState<Partial<Record<ExtractableField, number>>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // La tasa siempre es la de la fecha del depósito.
  useEffect(() => {
    let alive = true;
    setTasa(undefined);
    if (!isValidIsoDate(draft.fecha)) {
      setTasa(null);
      setDraft((d) => ({ ...d, tasaId: null }));
      return;
    }
    getDb()
      .then((db) => getTasaByFecha(db, draft.fecha))
      .then((t) => {
        if (!alive) return;
        setTasa(t);
        setDraft((d) => ({ ...d, tasaId: t?.id ?? null }));
      })
      .catch(reportError);
    return () => {
      alive = false;
    };
  }, [draft.fecha]);

  // Aviso de referencia duplicada.
  useEffect(() => {
    const banco = draft.banco.trim();
    const ref = draft.referencia.trim();
    if (!banco || !ref) {
      setDuplicados([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      getDb()
        .then((db) => findDuplicados(db, banco, ref, deposito?.id))
        .then((r) => alive && setDuplicados(r))
        .catch(reportError);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [draft.banco, draft.referencia, deposito?.id]);

  // Cálculos en vivo, excluyendo este mismo depósito si se está editando.
  const view = useMemo(
    () => buildCampanaView(data.asignaciones, data.depositos.filter((d) => d.id !== deposito?.id)),
    [data, deposito?.id],
  );
  const resumenGerente = view.gerentes.find((g) => g.asignacionId === asignacion.id);
  const monto = parseMonto(draft.montoBs);
  const usd = monto && tasa && new Decimal(monto).gt(0) ? toUsd(monto, tasa.valor) : null;
  const restanteGerente = new Decimal(resumenGerente?.restante ?? 0).minus(usd ?? 0);
  const restanteGeneral = new Decimal(view.total.restante).minus(usd ?? 0);

  function set<K extends keyof DepositoDraft>(k: K, v: DepositoDraft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setConfianza((c) => {
      const next = { ...c };
      delete next[k as ExtractableField];
      return next;
    });
  }

  function applyExtraction(r: ExtractionResult) {
    const next = { ...draft };
    const conf: Partial<Record<ExtractableField, number>> = {};
    for (const [k, f] of Object.entries(r.fields) as [ExtractableField, { value: string; confidence: number } | undefined][]) {
      if (f && !next[k].trim()) {
        next[k] = f.value;
        conf[k] = f.confidence;
      }
    }
    setDraft(next);
    setConfianza(conf);
  }

  async function onImagen(v: ImagenValue) {
    setImagen(v);
    if (v?.kind !== "new") return;
    try {
      applyExtraction(await extractor.extract(v.file));
    } catch (e) {
      reportError(e, "Lectura del comprobante");
    }
  }

  async function guardar(yNuevo: boolean) {
    const r = validateDeposito(draft);
    if (!r.ok) return setErrors(r.errors);
    setSaving(true);
    try {
      const db = await getDb();
      const v = { ...r.value, imagenPath: await persistImagen(imagen) };
      if (deposito) await updateDeposito(db, deposito.id, v);
      else await createDeposito(db, asignacion.id, v);
      toast.success(deposito ? "Depósito actualizado" : "Depósito registrado");
      if (yNuevo) {
        if (imagen?.kind === "new") URL.revokeObjectURL(imagen.previewUrl);
        setDraft((d) => ({ ...vacio(d.fecha), tasaId: d.tasaId }));
        setImagen(null);
        setConfianza({});
        setDuplicados([]);
        invalidate();
      } else {
        navigate(`/asignaciones/${asignacion.id}`);
        invalidate();
      }
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  }

  async function eliminar() {
    if (!deposito) return;
    try {
      await deleteDeposito(await getDb(), deposito.id);
      toast.success("Depósito eliminado");
      navigate(`/asignaciones/${asignacion.id}`, { replace: true });
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  const fechaValida = isValidIsoDate(draft.fecha);

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ to: `/asignaciones/${asignacion.id}`, label: asignacion.gerenteNombre }}
        title={deposito ? "Editar depósito" : "Registrar depósito"}
        subtitle={`${asignacion.gerenteNombre} · ${asignacion.campanaNombre}`}
        actions={
          deposito && !cerrada ? (
            <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Eliminar
            </Button>
          ) : null
        }
      />
      {cerrada && <Aviso>La campaña está cerrada: el depósito no se puede modificar.</Aviso>}

      <div className="grid grid-cols-2 gap-6">
        <ImageDrop
          label="Comprobante"
          value={imagen}
          onChange={onImagen}
          pasteEnabled={!tasaDialog}
          disabled={cerrada}
          className="h-[calc(100vh-11rem)] min-h-96"
        />

        <form
          className="grid content-start gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(false);
          }}
        >
          <fieldset disabled={cerrada || saving} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field id="d-fecha" label="Fecha" error={errors.fecha}>
                <Input id="d-fecha" type="date" className={confClass(confianza.fecha)} value={draft.fecha} onChange={(e) => set("fecha", e.target.value)} />
              </Field>
              <Field id="d-tasa" label="Tasa del día" error={errors.tasaId}>
                <div id="d-tasa" className="flex h-9 items-center gap-2 text-sm">
                  {tasa === undefined ? (
                    <span className="text-muted-foreground">Buscando…</span>
                  ) : tasa ? (
                    <span className="font-medium tabular-nums">{formatTasa(tasa.valor)} Bs/USD</span>
                  ) : (
                    <>
                      <span className="text-amber-700">{fechaValida ? `Sin tasa para el ${formatFecha(draft.fecha)}` : "Elige una fecha"}</span>
                      <Button type="button" size="sm" variant="outline" disabled={!fechaValida} onClick={() => setTasaDialog(true)}>
                        Registrar tasa
                      </Button>
                    </>
                  )}
                </div>
              </Field>
            </div>
            <Field id="d-banco" label="Banco de origen" error={errors.banco}>
              <Input id="d-banco" list="bancos" className={confClass(confianza.banco)} value={draft.banco} onChange={(e) => set("banco", e.target.value)} />
              <datalist id="bancos">
                {bancos.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field id="d-ref" label="Referencia bancaria" error={errors.referencia}>
                <Input id="d-ref" className={cn("font-mono", confClass(confianza.referencia))} value={draft.referencia} onChange={(e) => set("referencia", e.target.value)} />
              </Field>
              <Field id="d-monto" label="Monto en Bs" error={errors.montoBs} hint="Ej. 1.234.567,89">
                <Input
                  id="d-monto"
                  inputMode="decimal"
                  className={cn("text-right tabular-nums", confClass(confianza.montoBs))}
                  value={draft.montoBs}
                  onChange={(e) => set("montoBs", e.target.value)}
                  onBlur={() => {
                    const m = parseMonto(draft.montoBs);
                    if (m) setDraft((d) => ({ ...d, montoBs: toInputVE(m) }));
                  }}
                />
              </Field>
            </div>
            <Field id="d-cuenta" label="Cuenta destino" error={errors.cuentaDestino}>
              <Input id="d-cuenta" className={cn("font-mono", confClass(confianza.cuentaDestino))} value={draft.cuentaDestino} onChange={(e) => set("cuentaDestino", e.target.value)} />
            </Field>
            <Field id="d-obs" label="Observaciones">
              <Textarea id="d-obs" rows={3} value={draft.observaciones} onChange={(e) => set("observaciones", e.target.value)} />
            </Field>

            <Card className="py-4">
              <CardContent className="grid grid-cols-3 gap-4 px-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Dólares</div>
                  <div className="text-lg font-semibold tabular-nums">{usd ? formatUsd(usd) : "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Saldo del gerente después</div>
                  <div className={cn("text-lg font-semibold tabular-nums", restanteGerente.isNegative() && "text-destructive")}>{formatUsd(restanteGerente)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Saldo general después</div>
                  <div className="text-lg font-semibold tabular-nums">{formatUsd(restanteGeneral)}</div>
                </div>
              </CardContent>
            </Card>

            {duplicados.length > 0 && (
              <Aviso tono="warning">
                Ya existe un depósito con este banco y esta referencia:
                <ul className="mt-1 list-disc pl-4">
                  {duplicados.map((d) => (
                    <li key={d.id}>
                      {formatFecha(d.fecha)} · {d.gerenteNombre} · {d.campanaNombre} · {formatBs(d.montoBs)}
                    </li>
                  ))}
                </ul>
              </Aviso>
            )}
            {usd && restanteGerente.isNegative() && (
              <Aviso tono="warning">Con este depósito el gerente pagaría {formatUsd(restanteGerente.abs())} de más.</Aviso>
            )}
          </fieldset>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            {!deposito && (
              <Button type="button" variant="secondary" disabled={cerrada || saving} onClick={() => void guardar(true)}>
                Guardar y nuevo
              </Button>
            )}
            <Button type="submit" disabled={cerrada || saving}>
              Guardar
            </Button>
          </div>
        </form>
      </div>

      <TasaFormDialog
        tasa={null}
        fechaFija={draft.fecha}
        open={tasaDialog}
        onOpenChange={setTasaDialog}
        onSaved={(t) => {
          setTasa(t);
          set("tasaId", t.id);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar depósito"
        description="El depósito se eliminará y los saldos se recalcularán."
        confirmLabel="Eliminar"
        destructive
        onConfirm={eliminar}
      />
    </div>
  );
}
```

- [ ] **Step 5: Rutas**

En `src/App.tsx`:

```tsx
import { AsignacionPage } from "@/features/asignacion/AsignacionPage";
import { DepositoPage } from "@/features/deposito/DepositoPage";
// …
      { path: "asignaciones/:asignacionId", element: <AsignacionPage /> },
      { path: "asignaciones/:asignacionId/depositos/nuevo", element: <DepositoPage /> },
      { path: "depositos/:depositoId", element: <DepositoPage /> },
```

- [ ] **Step 6: Verificar manualmente**

Run: `pnpm test` → PASS. Run: `pnpm build` → sin errores. Run: `pnpm tauri dev`:
1. En la campaña de la Task 13, abre a Ana y entra a "Registrar depósito".
2. Pega una captura con Ctrl+V: aparece a la izquierda. Si la fecha no tiene tasa, usa "Registrar tasa" (`36,50`) y la tasa queda asignada.
3. Escribe el monto `36500`. Al salir del campo se muestra `36.500,00`, los dólares quedan en `$ 1.000,00` y el saldo del gerente después en `$ 0,00`.
4. Usa "Guardar y nuevo" y registra otro depósito con la **misma referencia y el mismo banco**: aparece el aviso de duplicado y aun así se puede guardar.
5. Un monto que supere el saldo muestra el aviso de pago de más, y el saldo se ve en rojo en las tablas.
6. Edita un depósito y cambia su fecha a un día sin tasa: aparece "Sin tasa para el …" y no se puede guardar hasta registrarla.
7. Elimina un depósito: los saldos se recalculan.
8. La pestaña "Todos los depósitos" de la campaña muestra todo en orden por fecha con el saldo general. Al filtrar por Ana, la columna pasa a mostrar su saldo.
9. Al hacer clic en la miniatura se abre el visor con zoom.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat(ui): vista de gerente en campaña y formulario de depósito con tasa por fecha y avisos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Configuración: respaldos y restauración, más respaldo automático diario

**Files:**
- Create: `src/features/configuracion/ConfiguracionPage.tsx`
- Modify: `src/App.tsx` (ruta `configuracion`), `src/main.tsx` (respaldo automático)

**Interfaces:**
- Consumes: `getDataPaths`, `listBackups`, `createBackup`, `restoreBackup`, `runAutoBackup` (Task 10).

- [ ] **Step 1: Pantalla de configuración**

`src/features/configuracion/ConfiguracionPage.tsx`:

```tsx
import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getDb } from "@/db";
import { createBackup, getDataPaths, listBackups, restoreBackup } from "@/platform/backup";
import { todayIso } from "@/domain/dates";
import { formatNumberVE } from "@/domain/money";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

const tamano = (bytes: number) => (bytes < 1024 * 1024 ? `${formatNumberVE(bytes / 1024, 0)} KB` : `${formatNumberVE(bytes / 1024 / 1024, 1)} MB`);

export function ConfiguracionPage() {
  const { data, error } = useData(async () => ({ paths: await getDataPaths(), backups: await listBackups() }), []);
  const [restaurar, setRestaurar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function respaldar() {
    const dest = await save({ defaultPath: `control-pagos-respaldo-${todayIso()}.zip`, filters: [{ name: "Respaldo", extensions: ["zip"] }] });
    if (!dest) return;
    setBusy(true);
    try {
      await createBackup(await getDb(), dest);
      toast.success("Respaldo creado");
      invalidate();
    } catch (e) {
      reportError(e, "Respaldo");
    } finally {
      setBusy(false);
    }
  }

  async function elegirArchivo() {
    const p = await open({ multiple: false, directory: false, filters: [{ name: "Respaldo", extensions: ["zip"] }] });
    if (typeof p === "string") setRestaurar(p);
  }

  async function confirmarRestaurar() {
    if (!restaurar) return;
    setBusy(true);
    try {
      await restoreBackup(restaurar);
      window.location.reload();
    } catch (e) {
      reportError(e, "Restaurar");
      setBusy(false);
      setRestaurar(null);
      invalidate();
    }
  }

  if (!data) return <Cargando error={error} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" />
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
          <CardDescription>Todo se guarda en esta computadora.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <div>
            <span className="text-muted-foreground">Base de datos: </span>
            <code>{data.paths.dbPath}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Imágenes: </span>
            <code>{data.paths.imagesDir}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Respaldos: </span>
            <code>{data.paths.backupsDir}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Respaldos</CardTitle>
          <CardDescription>
            Un respaldo (.zip) incluye la base de datos y todas las imágenes. Cada día se crea uno automático y se conservan los últimos 7.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={respaldar} disabled={busy}>
              <Archive />
              Crear respaldo…
            </Button>
            <Button variant="outline" onClick={elegirArchivo} disabled={busy}>
              <RotateCcw />
              Restaurar desde archivo…
            </Button>
          </div>
          {data.backups.length === 0 ? (
            <Vacio texto="Aún no hay respaldos en la carpeta de respaldos." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Tamaño</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.backups.map((b) => (
                  <TableRow key={b.path}>
                    <TableCell className="font-mono text-xs">{b.name}</TableCell>
                    <TableCell>{new Date(b.modifiedMs).toLocaleString("es-VE")}</TableCell>
                    <TableCell className="text-right tabular-nums">{tamano(b.sizeBytes)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRestaurar(b.path)}>
                        Restaurar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={restaurar !== null}
        onOpenChange={(o) => !o && !busy && setRestaurar(null)}
        title="Restaurar respaldo"
        description="Se reemplazarán TODOS los datos actuales (depósitos, tasas, imágenes) por los del respaldo. Antes se guardará automáticamente una copia de los datos actuales en la carpeta de respaldos."
        confirmLabel="Restaurar"
        destructive
        onConfirm={confirmarRestaurar}
      />
    </div>
  );
}
```

- [ ] **Step 2: Ruta y respaldo automático**

En `src/App.tsx`:

```tsx
import { ConfiguracionPage } from "@/features/configuracion/ConfiguracionPage";
// …
      { path: "configuracion", element: <ConfiguracionPage /> },
```

En `src/main.tsx`, después del `addEventListener`:

```tsx
import { getDb } from "./db";
import { runAutoBackup } from "./platform/backup";
// …
getDb()
  .then(runAutoBackup)
  .catch((e) => reportError(e, "Respaldo automático"));
```

- [ ] **Step 3: Verificar manualmente**

Run: `pnpm build` → sin errores. Run: `pnpm tauri dev`:
1. Al abrir la app, Configuración lista `auto-<hoy>.zip`. Al reabrirla el mismo día no se crea otro.
2. "Crear respaldo…" guarda el zip en el Escritorio. Ábrelo con el Explorador: contiene `control-pagos.db` e `imagenes/`.
3. Registra un depósito nuevo y después restaura el zip del paso 2: la app se recarga, el depósito nuevo ya no está y en la lista aparece `antes-de-restaurar-….zip`.
4. Restaura ese `antes-de-restaurar-….zip`: el depósito vuelve.
5. Restaurar un `.zip` cualquiera que no sea un respaldo muestra el error "El respaldo no contiene la base de datos" y los datos quedan intactos.

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "feat(ui): configuración con respaldos, restauración y respaldo automático diario

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Instalador, lista de comprobación del MVP y README

**Files:**
- Create: `docs/checklist-mvp.md`
- Modify: `README.md`

- [ ] **Step 1: Lista de comprobación manual**

`docs/checklist-mvp.md`:

```markdown
# Checklist manual del MVP

Ejecutar con `pnpm tauri dev` (o con el instalador) partiendo de datos vacíos.

- [ ] Crear 3 gerentes; desactivar uno; no aparece al agregar gerentes a una campaña.
- [ ] Crear campaña; agregar 2 gerentes con saldo; saldo general = suma.
- [ ] Registrar tasa desde Tasas y otra desde el formulario de depósito.
- [ ] Registrar depósitos pegando (Ctrl+V), arrastrando y eligiendo archivo.
- [ ] USD = Bs ÷ tasa con 2 decimales; saldo del gerente y general bajan en cada depósito.
- [ ] Aviso de referencia duplicada (mismo banco, distinta capitalización).
- [ ] Aviso y saldo en rojo al pagar de más.
- [ ] Editar la tasa de un día avisa "afecta N depósitos" y recalcula los saldos.
- [ ] No se puede eliminar una tasa en uso.
- [ ] "Todos los depósitos": orden cronológico, filtros por gerente/banco/fechas y totales.
- [ ] Ordenar la pestaña "Por gerente" por % avance.
- [ ] Cerrar campaña → todo de solo lectura; reabrir.
- [ ] Exportar campaña a Excel: Resumen, Todos los depósitos, una hoja por gerente; números sumables en Excel.
- [ ] Exportar tasas a Excel.
- [ ] Crear respaldo, restaurarlo; respaldo automático diario visible.
- [ ] Cerrar y volver a abrir la app: todos los datos siguen ahí.
```

- [ ] **Step 2: Generar el instalador**

Run: `pnpm tauri build`
Expected: crea `src-tauri/target/release/bundle/msi/Control de Pagos_0.1.0_x64_en-US.msi`. La primera vez Tauri descarga WiX automáticamente. Instálalo, ábrelo desde el menú Inicio y repite la lista de comprobación de forma rápida.

- [ ] **Step 3: README**

Reemplaza la sección "Estado" de `README.md` con:

````markdown
## Requisitos de desarrollo

- Node 20+ y pnpm
- Rust (toolchain `stable-x86_64-pc-windows-msvc`) y Visual Studio Build Tools con "Desarrollo para el escritorio con C++"
- WebView2 (incluido en Windows 11)

## Comandos

```powershell
pnpm install
pnpm tauri dev      # app en modo desarrollo
pnpm test           # pruebas de dominio, BD y exportación
cd src-tauri; cargo test   # pruebas de respaldos
pnpm tauri build    # instalador .msi
```

## Datos

Todo se guarda localmente en `%APPDATA%\com.controlpagos.app\`:
`control-pagos.db`, `imagenes\` y `respaldos\` (los respaldos automáticos se conservan 7 días).

## Fases

1. **MVP (actual):** registro manual con imagen adjunta, saldos, Excel y respaldos.
2. OCR local para autorrellenar el formulario (`src/extraction/`).
3. Base de datos en línea con varios usuarios.
````

- [ ] **Step 4: Verificación final**

Run: `pnpm test` → PASS · `cd src-tauri; cargo test` → PASS · `pnpm build` → OK

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "docs: checklist del MVP, instrucciones de desarrollo e instalador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Notas para quien ejecute el plan

- **Las imágenes reemplazadas o de depósitos eliminados** se quedan en `imagenes/` (sin borrarse). Es aceptable en el MVP, y una limpieza de huérfanas puede agregarse después.
- **Las migraciones no corren dentro de una transacción**, porque el pool de `tauri-plugin-sql` no garantiza que todas las sentencias usen la misma conexión. Cada migración debe poder reintentarse sin dañar nada; la v1 solo crea tablas nuevas.
- **Si un import o API de una librería cambió de versión** (react-router, shadcn, plugins de Tauri), adapta la línea afectada sin cambiar el comportamiento, y anótalo en el mensaje del commit.
