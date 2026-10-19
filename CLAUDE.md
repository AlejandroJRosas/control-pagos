# CLAUDE.md — control-pagos

App de escritorio local (Windows) para que una persona de gerencia registre depósitos/transferencias de gerentes por campaña, convierta Bs → USD con la tasa del día y siga saldos por gerente y por campaña. Diseño: `docs/superpowers/specs/2026-10-18-control-pagos-design.md`. Plan del MVP: `docs/superpowers/plans/2026-10-18-control-pagos-mvp.md`.

**Fases:** 1 = MVP (registro manual + imagen adjunta, Excel, respaldos). 2 = OCR local con el motor de Windows (`src/extraction/`, diseño en `docs/superpowers/specs/2026-10-18-ocr-comprobantes-design.md`). 3 = BD en línea multiusuario.

## Comandos

```powershell
pnpm tauri dev               # app en desarrollo (puerto 1420; si queda un vite colgado, matarlo). OJO: usa los datos reales de %APPDATA%
# Instancia aislada para probar (otros datos, puerto y target):
# CARGO_TARGET_DIR=<tmp> pnpm tauri dev --config '{"identifier":"com.controlpagos.dev","build":{"devUrl":"http://localhost:1431","beforeDevCommand":"pnpm vite --port 1431 --strictPort"}}' 
pnpm test                    # vitest: dominio, BD (sql.js en memoria), Excel, plataforma con mocks
pnpm build                   # tsc + vite build — única verificación de tipos de la UI
cd src-tauri; cargo test --lib   # pruebas de respaldo/restauración y OCR en Rust
cd src-tauri; cargo run --example ocr -- <imagen>   # JSON del OCR de una imagen (para fixtures)
pnpm tauri build             # instalador .msi en src-tauri/target/release/bundle/msi/
```

Requiere toolchain Rust `stable-x86_64-pc-windows-msvc` + VS Build Tools (C++). Gestor: **pnpm**.

## Arquitectura

- `src/domain/` — lógica pura, sin dependencias del proyecto. **Todo cálculo de dinero vive aquí** (`money.ts`, `campanaView.ts`, `validation.ts`).
- `src/db/` — `SqlDriver` mínimo (`driver.ts`); en producción `tauriDriver.ts` (tauri-plugin-sql), en pruebas `testing/sqljsDriver.ts`. Repos en `db/repos/`, consulta agregada en `db/queries/campanaData.ts`.
- `src/db/operaciones/` — escrituras de varios pasos con reversión manual (el plugin SQL no da transacciones entre llamadas): `destino.ts` (gerente/asignación al registrar desde la campaña), `importarPagos.ts` (plan + importación).
- `src/import/cuadroPagos.ts` — lee la hoja "CUADRO DE PAGOS" de las facturas por gerente (busca el encabezado por texto, no por celda fija).
- Tablas ordenables con `SortableHead` + `useOrden` y `ordenar` (`lib/orden.ts`: montos como `decimal`, nunca como texto).
- Filtros de tablas en la URL con `useFiltrosUrl(clave, keys)` (`lib/filtrosUrl.ts`): se recuerdan por pantalla/campaña en localStorage. La búsqueda libre usa `coincideBusqueda` (`domain/busqueda.ts`: sin acentos y montos con o sin separadores). El campo de búsqueda de cada tabla lleva `data-buscar-tabla` (lo enfoca la tecla `/`).
- Ficha del gerente `/gerentes/:id` (`features/gerentes/GerentePage.tsx` + `db/queries/gerenteData.ts`): todas sus campañas resumidas con `buildCampanaView` sobre sus asignaciones.
- Volver a la lista de origen: quien abre un detalle pasa `state: conVolver(location, etiqueta)` (`lib/volver.ts`; `DepositosTable` lo hace con `volverLabel`) y el depósito lo lee con `leerVolver`; sin él vuelve al gerente o a la campaña.
- Barra lateral colapsable (`lib/barraLateral.ts`): automática según el ancho (≤ 1100 px) salvo que el usuario la cierre (se recuerda en localStorage); Ctrl+B.
- Búsqueda global Ctrl+K: `components/BusquedaGlobal.tsx` + `db/queries/busqueda.ts`. Atajos con `useAtajo` (`hooks/useAtajo.ts`; la lista de la ayuda `?` está en `ATAJOS`). `PageHeader` con `back` vuelve con Esc.
- Selector con buscador: `components/BuscadorSelect.tsx` (combobox de Base UI, `ui/combobox.tsx`).
- Formularios con cambios sin guardar: `useAvisoSinGuardar(sucio)` (bloquea la navegación y el cierre de ventana; llamar `permitirSalida()` antes de navegar tras guardar).
- Eliminar depósitos devuelve `Eliminados`; `avisarDepositosEliminados` (`lib/deshacer.ts`) muestra el aviso con Deshacer (`restaurarDepositos` reinserta con el mismo id).
- Estado de cuenta y WhatsApp en `features/asignacion/` (`EstadoCuentaDialog`: imagen con html-to-image) y `domain/whatsapp.ts` (número venezolano → wa.me). El plugin opener solo puede abrir `https://wa.me/*`.
- `src/features/*` — pantallas; las rutas se registran en `src/App.tsx` (hash router). La última campaña abierta se recuerda en `lib/campanaActual.ts` (localStorage) y `/` redirige a ella.
- `src/features/lote/` — subida en lote y revisión uno a uno (depósitos por campaña y tasas). La cola vive en `db/repos/cola.ts` (tablas `cola_depositos`/`cola_tasas`, borrador en JSON, autoguardado); "Hecho" en `db/operaciones/revision.ts` (guarda con los mismos repos y revierte si falla). Los formularios se comparten con el registro individual: `deposito/useDepositoForm.ts` + `DepositoCampos.tsx`, `tasas/TasaCampos.tsx`.
- `components/ZoomableImage.tsx` + `lib/zoom.ts` — zoom con la rueda hacia el cursor, arrastre y doble clic; lo usan `ImageDrop`, `ImageViewer` y la revisión.
- `src/platform/` — imágenes en AppData (plugin-fs) y respaldos (invoca comandos Rust).
- `src/extraction/` — OCR de comprobantes y tasas. `ocr/` = motor intercambiable (`OcrEngine`; hoy `windowsOcr.ts` → comando `ocr_imagen`), `filas.ts` agrupa líneas por altura, `formatos/` = un reconocedor por formato (registro en `formatos/index.ts`), `normalizar.ts` valida y asigna confianza, `autollenado.ts` decide qué campos llena (sin tocar / OCR / tocado), `extractor.ts` lo une.
- `src-tauri/src/backup.rs` — crear/restaurar/podar/listar zips, podar `antes-de-*` (30 días, quedan 5) y borrar imágenes huérfanas (`mantenimientoAlIniciar` en `platform/backup.ts`, siempre después del respaldo automático); `ocr.rs` — OCR de Windows (`Windows.Media.Ocr`, amplía la imagen a 2000 px); `lib.rs` — comandos y plugins.
- Datos en `%APPDATA%\com.controlpagos.app\`: `control-pagos.db` (modo WAL), `imagenes\`, `respaldos\`.

## Reglas del dominio (no romper)

- Montos como **texto decimal exacto**; nunca `number` para dinero. decimal.js con `ROUND_HALF_UP`; USD a 2 decimales por depósito (`toUsd`), y los totales suman esos valores redondeados.
- **No se guardan derivados** (USD, saldos, %): siempre se calculan con `buildCampanaView`.
- La cola de lote **no cuenta** en saldos, Excel ni totales: solo "Hecho" crea el depósito o la tasa. Si el OCR no lee la fecha, el borrador queda sin fecha (no la de hoy).
- Orden cronológico: `fecha`, luego `creado_en`, luego `id`.
- **Una tasa por fecha**, y la tasa de un depósito debe ser la de su misma fecha (lo valida `depositos.ts`). Sábado y domingo no llevan tasa propia: usan la del viernes (`fechaDeTasa` en `domain/dates.ts`, `getTasaParaFecha` en el repo); `createTasa` rechaza fines de semana.
- Campaña `cerrada` = solo lectura; los repos lanzan `DomainError('CAMPANA_CERRADA')`. Eliminar una campaña (`db/operaciones/eliminarCampana.ts`) exige que esté activa, borra asignaciones, depósitos y cola (no gerentes ni tasas) y la UI crea antes un respaldo `antes-de-eliminar-*`.
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

## Agregar un formato de comprobante (OCR)

1. Conseguir 2-3 capturas reales (claro/oscuro, recortada).
2. `cd src-tauri; cargo run --example ocr -- <imagen> > ../src/extraction/formatos/__fixtures__/<nombre>.json`; reemplazar nombres de personas por ficticios. Las imágenes no se suben.
3. Crear `src/extraction/formatos/<id>.ts` (`detecta` + `extrae`, por etiqueta con `valorDeEtiqueta` si el valor va al lado o `valorDebajo` si va debajo; utilidades en `formatos/comun.ts`) y sus pruebas en `formatos.test.ts`; comprobar que los demás fixtures no lo activan.
4. Agregarlo a `reconocedoresDeposito` o `reconocedoresTasa` en `formatos/index.ts`.

## Trampas conocidas

- shadcn está en estilo **Base UI** (no Radix): no existe `asChild` (usar `buttonVariants()` sobre `<Link>` o la prop `render`); `AlertDialogAction` **no cierra** el diálogo sola — `ConfirmDialog` delega el cierre en `onConfirm`.
- `cn` viene del paquete `cn` (ya combina clases de Tailwind).
- Ventana con `dragDropEnabled: false` para que el arrastrar/soltar HTML5 entregue `File`.
- Restaurar: JS cierra la BD con `closeDb({ strict: true })` antes de invocar `restore_backup`; Rust valida el zip (cabecera SQLite, rutas) y hace el cambio con renombres reversibles. Mantener esa garantía: o todo nuevo o todo como estaba.
- Los zips se escriben en `.part` y se renombran al terminar.
- El `onWheel` de React es pasivo: para `preventDefault` en la rueda usar `addEventListener("wheel", …, { passive: false })`.
- Un `<form>` dentro de un diálogo abierto desde otro formulario (p. ej. `TasaFormDialog` en el depósito) propaga `submit` por el árbol de React a través del portal: usar `stopPropagation`.
- Windows OCR no da confianza: se deduce en `normalizar.ts` (etiqueta 0,9, heurística 0,7, constante 0,95). Pierde etiquetas en gris y confunde caracteres ("15110/2026", "17.200.00"): los reconocedores los recuperan como heurística (ámbar).
- El OCR necesita el idioma español con reconocimiento de texto instalado en Windows; si falta, `ocr.rs` devuelve un error que lo explica.
- Al escribir archivos con barras invertidas (`̀`, `\0`, regex), usar la herramienta de escritura de archivos y no heredocs del shell: el shell de este entorno interpreta los escapes.

## Pendientes conocidos (menores)

`"0.500"` se acepta como 500; respaldo automático solo al abrir; Guardar habilitado mientras se busca la tasa; el aviso de duplicados no relaciona referencias sin ceros iniciales ni alias de banco ("BDV") de depósitos importados de Excel; en capturas borrosas el OCR puede leer mal el nombre y aun así marcarlo en verde. En la revisión en lote: cerrar la ventana menos de 0,5 s después de editar pierde esa última edición (el autoguardado no escucha el cierre); Ctrl+Enter da Hecho aunque haya un diálogo abierto; si falla Descartar, la edición en curso no se autoguarda.
