# control-pagos

App de escritorio (Tauri + React + TypeScript + SQLite) para registrar los depósitos y transferencias
de los gerentes por campaña, controlar los saldos en USD con la tasa del día y exportar reportes a Excel.

- Diseño: [`docs/superpowers/specs/2026-10-18-control-pagos-design.md`](docs/superpowers/specs/2026-10-18-control-pagos-design.md)
- Plan: [`docs/superpowers/plans/2026-10-18-control-pagos-mvp.md`](docs/superpowers/plans/2026-10-18-control-pagos-mvp.md)
- Checklist manual: [`docs/checklist-mvp.md`](docs/checklist-mvp.md)

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
pnpm tauri build    # instalador NSIS (.exe) en src-tauri/target/release/bundle/nsis/
```

## Publicar una versión (actualizaciones)

Las apps instaladas revisan al abrir el `latest.json` del último release de GitHub y ofrecen instalar la versión nueva
(con un respaldo `antes-de-actualizar-*` antes). El instalador va firmado con la clave del updater; la pública está en
`src-tauri/tauri.conf.json` y la privada fuera del repo (`%USERPROFILE%\.tauri\control-pagos.key`, y como secreto
`TAURI_SIGNING_PRIVATE_KEY` del repo). **Si se pierde la clave privada, las instalaciones existentes ya no pueden actualizarse.**

1. Cambiar `version` en `package.json` (es la única: `tauri.conf.json` la toma de ahí) y hacer commit.
2. Crear la etiqueta anotada; su mensaje son las notas que ve el usuario en el aviso:
   `git tag -a v0.2.0 -m "Novedades: ..."` y `git push origin main --follow-tags`.
3. El workflow `.github/workflows/release.yml` corre las pruebas, compila, firma y publica el release con `latest.json`.

El instalador es para el usuario actual (no pide administrador) y no toca `%APPDATA%\com.controlpagos.app\`.

## Datos

Todo se guarda localmente en `%APPDATA%\com.controlpagos.app\`:
`control-pagos.db`, `imagenes\` y `respaldos\` (los respaldos automáticos se conservan 7 días).

## Fases

1. **MVP (actual):** registro manual con imagen adjunta, saldos, Excel y respaldos.
2. OCR local para autorrellenar el formulario (`src/extraction/`).
3. Base de datos en línea con varios usuarios.
