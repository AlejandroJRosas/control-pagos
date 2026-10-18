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
pnpm tauri build    # instalador .msi
```

## Datos

Todo se guarda localmente en `%APPDATA%\com.controlpagos.app\`:
`control-pagos.db`, `imagenes\` y `respaldos\` (los respaldos automáticos se conservan 7 días).

## Fases

1. **MVP (actual):** registro manual con imagen adjunta, saldos, Excel y respaldos.
2. OCR local para autorrellenar el formulario (`src/extraction/`).
3. Base de datos en línea con varios usuarios.
