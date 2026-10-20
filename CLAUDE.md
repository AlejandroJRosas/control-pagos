# CLAUDE.md — control-pagos

App de escritorio local (Windows) para que una persona de gerencia registre depósitos/transferencias de gerentes por campaña, convierta Bs → USD con la tasa del día y siga saldos por gerente y por campaña. Diseño: `docs/superpowers/specs/2026-10-18-control-pagos-design.md`. Plan del MVP: `docs/superpowers/plans/2026-10-18-control-pagos-mvp.md`.

**Fases:** 1 = MVP (registro manual + imagen adjunta, Excel, respaldos). 2 = OCR local con el motor de Windows (`src/extraction/`, diseño en `docs/superpowers/specs/2026-10-18-ocr-comprobantes-design.md`). 3 = BD en línea multiusuario.

## Comandos

```powershell
pnpm tauri dev               # app en desarrollo (puerto 1420; si queda un vite colgado, matarlo). OJO: usa los datos reales de %APPDATA%
# Instancia aislada para probar (otros datos, puerto y target):
# CARGO_TARGET_DIR=<tmp> pnpm tauri dev --config '{"identifier":"com.controlpagos.dev","build":{"devUrl":"http://localhost:1431","beforeDevCommand":"pnpm vite --port 1431 --strictPort"}}' 
pnpm test                    # vitest: proyecto "logica" (dominio, BD sql.js, Excel, plataforma con mocks) y "ui" (*.ui.test.tsx en jsdom)
pnpm build                   # tsc + vite build — única verificación de tipos de la UI
cd src-tauri; cargo test --lib   # pruebas de respaldo/restauración y OCR en Rust
cd src-tauri; cargo run --example ocr -- <imagen>   # JSON del OCR de una imagen (para fixtures)
pnpm tauri build             # instalador NSIS en src-tauri/target/release/bundle/nsis/ (con TAURI_SIGNING_PRIVATE_KEY para el .sig del updater)
```

Requiere toolchain Rust `stable-x86_64-pc-windows-msvc` + VS Build Tools (C++). Gestor: **pnpm**.

## Arquitectura

- `src/domain/` — lógica pura, sin dependencias del proyecto. **Todo cálculo de dinero vive aquí** (`money.ts`, `campanaView.ts`, `validation.ts`).
- `src/db/` — `SqlDriver` mínimo (`driver.ts`); en producción `tauriDriver.ts` (tauri-plugin-sql), en pruebas `testing/sqljsDriver.ts`. Repos en `db/repos/`, consulta agregada en `db/queries/campanaData.ts`.
- `src/db/operaciones/` — escrituras de varios pasos con reversión manual (el plugin SQL no da transacciones entre llamadas): `destino.ts` (gerente/asignación al registrar desde la campaña), `importarPagos.ts` (plan + importación).
- `src/import/cuadroPagos.ts` — lee la hoja "CUADRO DE PAGOS" de las facturas por gerente (busca el encabezado por texto, no por celda fija).
- Tablas ordenables con `SortableHead` + `useOrden` y `ordenar` (`lib/orden.ts`: montos como `decimal`, nunca como texto).
- Columnas ocultables y reordenables con `useColumnas(clave, todas)` (`lib/columnas.ts`, en localStorage) + `components/ColumnasMenu.tsx`; hoy en `DepositosTable` y `PorGerenteTab`. El pie de totales se arma con `agruparPie`.
- Campos de fecha con `components/FechaInput.tsx` (texto dd/mm/aaaa con `mascaraFecha`/`parseFechaVE` + calendario nativo con `showPicker`), nunca `<input type="date">` a la vista: este sigue el idioma de Windows. `lib.rs` arranca el WebView2 con `--lang=es`.
- Zoom de la app (Ctrl + rueda / + / − / 0) en `lib/zoomApp.ts` con `setZoom` del webview; respeta el `preventDefault` de `ZoomableImage`.
- Filtros de tablas en la URL con `useFiltrosUrl(clave, keys)` (`lib/filtrosUrl.ts`): se recuerdan por pantalla/campaña en localStorage. La búsqueda libre usa `coincideBusqueda` (`domain/busqueda.ts`: sin acentos y montos con o sin separadores). El campo de búsqueda de cada tabla lleva `data-buscar-tabla` (lo enfoca la tecla `/`).
- Etiquetas de gerentes (nombre + color de la paleta fija `COLORES_ETIQUETA` en `domain/etiquetas.ts`; clases por color en `components/EtiquetaChip.tsx`): tablas `etiquetas` y `gerente_etiquetas` (`db/repos/etiquetas.ts`, nombre único sin mayúsculas ni acentos). Se gestionan en `features/gerentes/EtiquetasDialog.tsx`, se asignan en `GerenteFormDialog` y filtran la lista de Gerentes con chips (`?etiquetas=1,4`, basta una) y la de `AgregarGerentesDialog` (sin URL; solo las etiquetas de gerentes disponibles). Una campaña activa sin gerentes muestra `InicioCampana` en vez del resumen y las pestañas.
- Resumen general `/resumen` (`features/resumen/ResumenPage.tsx` + `db/queries/resumenGeneral.ts` + `domain/resumenGeneral.ts`): campañas activas sumadas, últimos 7 días, cola pendiente y gerentes que más deben (lo pagado de más en una campaña no descuenta otra). `/` sigue entrando a la última campaña.
- Ficha del gerente `/gerentes/:id` (`features/gerentes/GerentePage.tsx` + `db/queries/gerenteData.ts`): todas sus campañas resumidas con `buildCampanaView` sobre sus asignaciones.
- Volver a la lista de origen: quien abre un detalle pasa `state: conVolver(location, etiqueta)` (`lib/volver.ts`; `DepositosTable` lo hace con `volverLabel`) y el depósito lo lee con `leerVolver`; sin él vuelve al gerente o a la campaña.
- Barra lateral colapsable (`lib/barraLateral.ts`): automática según el ancho (≤ 1100 px) salvo que el usuario la cierre (se recuerda en localStorage); Ctrl+B.
- Búsqueda global Ctrl+K: `components/BusquedaGlobal.tsx` + `db/queries/busqueda.ts`. Atajos con `useAtajo` (`hooks/useAtajo.ts`; la lista de la ayuda `?` está en `ATAJOS`). `PageHeader` con `back` vuelve con Esc.
- Selector con buscador: `components/BuscadorSelect.tsx` (combobox de Base UI, `ui/combobox.tsx`) para todo desplegable (filtros, año…); no usar `<select>`. Texto libre con sugerencias (p. ej. el banco de origen): `components/BuscadorTexto.tsx` (Autocomplete de Base UI, mismo aspecto).
- Formularios con cambios sin guardar: `useAvisoSinGuardar(sucio)` (bloquea la navegación y el cierre de ventana; llamar `permitirSalida()` antes de navegar tras guardar).
- Cierre de la ventana en un solo lugar: `lib/cierre.ts` (`registrarBloqueador` + `pedirCierre`, puro) y `lib/instalarCierre.ts` (Tauri). Bloqueadores: `useAvisoSinGuardar` (diálogo) y `useAutoguardado` (guarda lo pendiente). Luego el respaldo de cierre (`respaldoDeCierre` en `platform/backup.ts`): espera a que termine el mantenimiento de apertura, no corre si la BD no pasó la verificación (`marcarArranque` en `main.tsx`) y solo si hubo escrituras (contador en `db/tauriDriver.ts`, se reinicia justo antes de cada respaldo automático), con tope de 20 s (`OverlayCierre`); si falla se avisa al abrir. No registrar otro `onCloseRequested`.
- Arranque (`main.tsx`): abre la BD, `verificarIntegridad` (`db/integridad.ts`: `quick_check` + `foreign_key_check`) y recién entonces muestra la app y corre `mantenimientoAlIniciar`; si falla, `components/BdDanada.tsx` (restaurar respaldo, sin respaldo automático ni limpieza).
- Copia espejo (Google Drive): `platform/espejo.ts` + comando `mirror_backup` (`backup::mirror`, solo `auto-*.zip`, en la subcarpeta de la instalación `subcarpeta_espejo`: nombre del equipo, más el identificador si no es la app normal; ahí poda a 7 y borra los `.part` viejos, nunca fuera). `runAutoBackup` copia cada respaldo automático; nunca lanza por el espejo, guarda el resultado en `ajustes` y `components/AvisoEspejo.tsx` avisa (error o más de 3 días sin copia, `domain/espejo.ts`). Tarjeta `CopiaDrive` en Configuración.
- Ajustes que viajan en los respaldos: tabla `ajustes` (`db/repos/ajustes.ts`; clave → texto).
- Feriados: `domain/feriados.ts` (Pascua y feriados nacionales), `db/repos/feriados.ts` (CRUD y `precargarFeriados`, una vez por año, en `mantenimientoAlIniciar`), `hooks/useFeriados.ts`, pestaña Feriados en Tasas (`FeriadosCard`).
- Aviso de tasa faltante arriba de cada pantalla: `components/AvisoTasaFaltante.tsx` + `db/queries/tasaFaltante.ts` + `domain/tasaFaltante.ts` (hoy si es hábil; días anteriores solo si los necesita la cola).
- Duplicados de la campaña `/campanas/:id/duplicados` (`features/campana/DuplicadosPage.tsx` + `db/queries/duplicados.ts` + `domain/duplicados.ts`): grupos por `claveDuplicado` que tocan la campaña (pueden incluir depósitos de otras), uno a la vez y lado a lado; "Quedarse con este" (o 1/2, ←/→) elimina los demás con Deshacer. Mientras haya duplicados, `CampanaPage` muestra el aviso y deshabilita Exportar.
- Eliminar depósitos devuelve `Eliminados`; `avisarDepositosEliminados` (`lib/deshacer.ts`) muestra el aviso con Deshacer (`restaurarDepositos` reinserta con el mismo id).
- Exportación de la campaña en `src/export/`: `campanaWorkbook.ts` (Excel con ExcelJS), `campanaPdf.ts` (definición de pdfmake, pura y probada) + `savePdf.ts` (pdfmake con import dinámico; pesa ~1,6 MB con las fuentes) y colores/reglas comunes en `estilo.ts`.
- Estado de cuenta y WhatsApp en `features/asignacion/` (`HojaEstadoCuenta` + `imagenDeHoja`/`copiarImagen` con html-to-image; `EstadoCuentaDialog`) y `domain/whatsapp.ts` (número venezolano → wa.me; plantillas con `{campo}`, `aplicarPlantilla`, `mensajeEstadoCuenta(e, plantillas)`). Plantillas editables en Configuración (`MensajesWhatsApp`, guardadas con `db/repos/plantillas.ts`). Envío en lote: menú Campaña → `features/campana/EnvioLoteDialog.tsx` (`domain/envioLote.ts`). El plugin opener solo puede abrir `https://wa.me/*` y rutas de `$APPDATA`.
- `src/features/*` — pantallas; las rutas se registran en `src/App.tsx` (hash router). La última campaña abierta se recuerda en `lib/campanaActual.ts` (localStorage) y `/` redirige a ella.
- `src/features/lote/` — subida en lote y revisión uno a uno (depósitos por campaña y tasas). La cola vive en `db/repos/cola.ts` (tablas `cola_depositos`/`cola_tasas`, borrador en JSON, autoguardado); "Hecho" en `db/operaciones/revision.ts` (guarda con los mismos repos y revierte si falla). La lista de la cola marca varios como en Windows (clic, Ctrl/Shift+clic, Ctrl+A) con `domain/seleccion.ts` para asignar gerente en bloque. Los formularios se comparten con el registro individual: `deposito/useDepositoForm.ts` + `DepositoCampos.tsx`, `tasas/TasaCampos.tsx`.
- `components/ZoomableImage.tsx` + `lib/zoom.ts` — zoom con la rueda hacia el cursor, arrastre y doble clic; lo usan `ImageDrop`, `ImageViewer` y la revisión.
- `src/platform/` — imágenes en AppData (plugin-fs) y respaldos (invoca comandos Rust).
- `src/extraction/` — OCR de comprobantes y tasas. `ocr/` = motor intercambiable (`OcrEngine`; hoy `windowsOcr.ts` → comando `ocr_imagen`), `filas.ts` agrupa líneas por altura, `formatos/` = un reconocedor por formato (registro en `formatos/index.ts`), `normalizar.ts` valida y asigna confianza, `autollenado.ts` decide qué campos llena (sin tocar / OCR / tocado), `extractor.ts` lo une.
- `src-tauri/src/backup.rs` — crear/restaurar/podar/listar zips, podar `antes-de-*` (30 días, quedan 5) y borrar imágenes huérfanas (`mantenimientoAlIniciar` en `platform/backup.ts`, siempre después del respaldo automático); `ocr.rs` — OCR de Windows (`Windows.Media.Ocr`, amplía la imagen a 2000 px); `lib.rs` — comandos y plugins.
- Actualizaciones: `platform/actualizacion.ts` (tauri-plugin-updater; busca al abrir, salvo en dev) + `components/AvisoActualizacion.tsx` y la tarjeta en Configuración. Respalda `antes-de-actualizar-*` y cierra la BD antes de instalar. Publicar = subir la versión en `package.json` + etiqueta anotada `vX.Y.Z` (el mensaje son las notas); `.github/workflows/release.yml` publica el release con `latest.json`. Instalador NSIS por usuario; clave privada en `%USERPROFILE%\.tauri\control-pagos.key` y en el secreto del repo.
- Datos en `%APPDATA%\com.controlpagos.app\`: `control-pagos.db` (modo WAL), `imagenes\`, `respaldos\`.

## Reglas del dominio (no romper)

- Montos como **texto decimal exacto**; nunca `number` para dinero. decimal.js con `ROUND_HALF_UP`; USD a 2 decimales por depósito (`toUsd`), y los totales suman esos valores redondeados.
- **No se guardan derivados** (USD, saldos, %): siempre se calculan con `buildCampanaView`.
- La cola de lote **no cuenta** en saldos, Excel ni totales: solo "Hecho" crea el depósito o la tasa. Si el OCR no lee la fecha, el borrador queda sin fecha (no la de hoy).
- Orden cronológico: `fecha`, luego `creado_en`, luego `id`.
- **Una tasa por fecha**, y la tasa de un depósito debe ser la de su misma fecha (lo valida `depositos.ts`). Sábado, domingo y feriados no llevan tasa propia: usan la del último día hábil anterior (`fechaDeTasa(fecha, feriados)` en `domain/dates.ts`, `getTasaParaFecha` en el repo); `createTasa` rechaza fines de semana y feriados. No se puede marcar feriado un día con tasa propia ni quitar uno con depósitos (cambiaría la tasa de lo registrado).
- Cada registro (`gerentes`, `campanas`, `asignaciones`, `tasas`, `depositos`) lleva `uuid` v4 y `actualizado_en`, que ponen los repos (`crypto.randomUUID()`, `nowIso()`): preparación para la fase 3 (`docs/superpowers/specs/2026-10-19-fase-3-notas.md`).
- Campaña `cerrada` = solo lectura; los repos lanzan `DomainError('CAMPANA_CERRADA')`. Eliminar una campaña (`db/operaciones/eliminarCampana.ts`) exige que esté activa, borra asignaciones, depósitos y cola (no gerentes ni tasas) y la UI crea antes un respaldo `antes-de-eliminar-*`.
- Formato venezolano: `parseMonto` para montos ("1.234" = mil); `parseTasa` para tasas (un único punto es decimal: "36.500" = 36,5).
- Duplicados: mismo banco + referencia con `claveDuplicado` (`domain/bancos.ts`: sin mayúsculas, acentos ni espacios, referencia sin ceros iniciales y alias de banco como "BDV" → Banco de Venezuela). **Bloqueo**: `createDeposito` y `updateDeposito` (si cambia banco o referencia) lanzan `DomainError('DUPLICADO')`; los que quedaron de antes se resuelven en la pantalla de duplicados. Al registrar (individual o revisión) `DuplicadoBloqueo` ofrece actualizar el existente (`actualizarDuplicado` / `completarConDuplicado` en `db/operaciones/revision.ts`) o descartar (Ctrl+D); la importación de Excel no deja marcar filas duplicadas. En pruebas, `crearDuplicado` (fixtures) los inserta saltándose la regla.
- `parseMonto` rechaza un grupo de miles que empieza en 0 ("0.500").
- Errores de negocio con `DomainError` (mensaje en español, se muestra tal cual en el toast).

## Convenciones

- UI y mensajes en **español**; fechas `dd/mm/aaaa` en pantalla, `YYYY-MM-DD` en BD.
- SQL solo con parámetros posicionales `?`. Columnas snake_case, alias camelCase en el SELECT.
- Migraciones en `db/migrations.ts`: **agregar** una nueva versión (no editar las existentes), una sentencia por elemento, con `IF NOT EXISTS`; se controla con `PRAGMA user_version`. `ADD COLUMN` no tiene `IF NOT EXISTS`: `migrate` ignora "duplicate column" para que una migración a medias se pueda volver a correr. `migrate(db, hasta)` sirve para probar sobre una versión anterior.
- Datos en la UI: `useData(load, deps)`; después de cualquier escritura llamar `invalidate()`. Errores: `reportError(e)`.
- TDD: la lógica nueva va en `domain/` o `db/` con su prueba primero. Flujos de la UI: `*.ui.test.tsx` con `renderApp(ruta, { db, hoy })` (`src/testing/`: BD sql.js, `@/db` y Tauri simulados en `setupUi.ts`, respuestas de `invoke` en `tauri.invoke`). Lo que no cubren, con `pnpm build` y `docs/checklist-mvp.md`.
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
- Al escribir archivos con barras invertidas (`̀`, `\0`, regex), usar la herramienta de escritura de archivos y no heredocs del shell ni `node -e`: el shell de este entorno interpreta los escapes (`\\` → `\`, `\b` → retroceso).

## Pendientes conocidos (menores)

Los alias de banco son una lista fija en `domain/bancos.ts` (agregar ahí los nuevos). La cuenta destino del OCR solo baja a ámbar si nunca se usó: una mal leída igual a una ya usada no se detecta. Los feriados bancarios adicionales (SUDEBAN) se cargan a mano. El respaldo al cerrar no corre si la app termina por la actualización (ya hay `antes-de-actualizar-*`).
