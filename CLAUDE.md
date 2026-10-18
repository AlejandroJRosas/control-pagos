# CLAUDE.md — control-pagos

App de escritorio local (Windows) para que una persona de gerencia registre depósitos/transferencias de gerentes por campaña, convierta Bs → USD con la tasa del día y siga saldos por gerente y por campaña. Diseño: `docs/superpowers/specs/2026-10-18-control-pagos-design.md`. Plan del MVP: `docs/superpowers/plans/2026-10-18-control-pagos-mvp.md`.

**Fases:** 1 = MVP actual (registro manual + imagen adjunta, Excel, respaldos). 2 = OCR local (se conecta en `src/extraction/extractor.ts`). 3 = BD en línea multiusuario.

## Comandos

```powershell
pnpm tauri dev               # app en desarrollo (puerto 1420; si queda un vite colgado, matarlo)
pnpm test                    # vitest: dominio, BD (sql.js en memoria), Excel, plataforma con mocks
pnpm build                   # tsc + vite build — única verificación de tipos de la UI
cd src-tauri; cargo test --lib   # pruebas de respaldo/restauración en Rust
pnpm tauri build             # instalador .msi en src-tauri/target/release/bundle/msi/
```

Requiere toolchain Rust `stable-x86_64-pc-windows-msvc` + VS Build Tools (C++). Gestor: **pnpm**.

## Arquitectura

- `src/domain/` — lógica pura, sin dependencias del proyecto. **Todo cálculo de dinero vive aquí** (`money.ts`, `campanaView.ts`, `validation.ts`).
- `src/db/` — `SqlDriver` mínimo (`driver.ts`); en producción `tauriDriver.ts` (tauri-plugin-sql), en pruebas `testing/sqljsDriver.ts`. Repos en `db/repos/`, consulta agregada en `db/queries/campanaData.ts`.
- `src/features/*` — pantallas; las rutas se registran en `src/App.tsx` (hash router).
- `src/platform/` — imágenes en AppData (plugin-fs) y respaldos (invoca comandos Rust).
- `src-tauri/src/backup.rs` — crear/restaurar/podar/listar zips; `lib.rs` — comandos y plugins.
- Datos en `%APPDATA%\com.controlpagos.app\`: `control-pagos.db` (modo WAL), `imagenes\`, `respaldos\`.

## Reglas del dominio (no romper)

- Montos como **texto decimal exacto**; nunca `number` para dinero. decimal.js con `ROUND_HALF_UP`; USD a 2 decimales por depósito (`toUsd`), y los totales suman esos valores redondeados.
- **No se guardan derivados** (USD, saldos, %): siempre se calculan con `buildCampanaView`.
- Orden cronológico: `fecha`, luego `creado_en`, luego `id`.
- **Una tasa por fecha**, y la tasa de un depósito debe ser la de su misma fecha (lo valida `depositos.ts`).
- Campaña `cerrada` = solo lectura; los repos lanzan `DomainError('CAMPANA_CERRADA')`.
- Formato venezolano: `parseMonto` para montos ("1.234" = mil); `parseTasa` para tasas (un único punto es decimal: "36.500" = 36,5).
- Duplicados: mismo banco + referencia comparando con `claveComparacion` (sin mayúsculas, acentos ni espacios). Es aviso, no bloqueo.
- Errores de negocio con `DomainError` (mensaje en español, se muestra tal cual en el toast).

## Convenciones

- UI y mensajes en **español**; fechas `dd/mm/aaaa` en pantalla, `YYYY-MM-DD` en BD.
- SQL solo con parámetros posicionales `?`. Columnas snake_case, alias camelCase en el SELECT.
- Migraciones en `db/migrations.ts`: **agregar** una nueva versión (no editar las existentes), una sentencia por elemento, con `IF NOT EXISTS`; se controla con `PRAGMA user_version`.
- Datos en la UI: `useData(load, deps)`; después de cualquier escritura llamar `invalidate()`. Errores: `reportError(e)`.
- TDD: la lógica nueva va en `domain/` o `db/` con su prueba primero. La UI no tiene pruebas automáticas; verificar con `pnpm build` y `docs/checklist-mvp.md`.
- Commits en español con prefijo (`feat:`, `fix:`, `docs:`…).

## Trampas conocidas

- shadcn está en estilo **Base UI** (no Radix): no existe `asChild` (usar `buttonVariants()` sobre `<Link>` o la prop `render`); `AlertDialogAction` **no cierra** el diálogo sola — `ConfirmDialog` delega el cierre en `onConfirm`.
- `cn` viene del paquete `cn` (ya combina clases de Tailwind).
- Ventana con `dragDropEnabled: false` para que el arrastrar/soltar HTML5 entregue `File`.
- Restaurar: JS cierra la BD con `closeDb({ strict: true })` antes de invocar `restore_backup`; Rust valida el zip (cabecera SQLite, rutas) y hace el cambio con renombres reversibles. Mantener esa garantía: o todo nuevo o todo como estaba.
- Los zips se escriben en `.part` y se renombran al terminar.
- Al escribir archivos con barras invertidas (`̀`, `\0`, regex), usar la herramienta de escritura de archivos y no heredocs del shell: el shell de este entorno interpreta los escapes.

## Pendientes conocidos (menores)

`"0.500"` se acepta como 500; imágenes huérfanas no se borran; `antes-de-restaurar-*.zip` sin poda; respaldo automático solo al abrir; Guardar habilitado mientras se busca la tasa; `applyExtraction` usa el `draft` previo al `await` (importa en la fase 2).
