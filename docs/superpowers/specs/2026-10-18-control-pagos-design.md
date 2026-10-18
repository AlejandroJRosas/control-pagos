# Control de Pagos — Diseño (MVP)

Fecha: 2026-10-18
Estado: aprobado para planificación

## 1. Propósito

App de escritorio para que una persona de gerencia registre los depósitos y transferencias
que hacen los gerentes para pagar el saldo que tienen asignado en cada campaña, y pueda ver
en todo momento cuánto se ha pagado y cuánto falta: por gerente y en total por campaña.

### Criterios de éxito

- Registrar un depósito (con su comprobante adjunto) en menos de un minuto.
- Ver en cualquier momento el saldo general de la campaña, el saldo de cada gerente y el % de avance.
- Exportar a Excel un reporte de la campaña listo para compartir.
- Respaldar y restaurar todos los datos (incluidas las imágenes) en otra computadora.

### Fuera del MVP (fases futuras)

- **Fase 2:** OCR local (RapidOCR/PaddleOCR) que autorrellena el formulario desde la imagen.
- **Fase 3:** base de datos en línea, varios usuarios y roles.
- Importar datos históricos desde Excel.

## 2. Usuarios y contexto

- Una sola persona de gerencia carga todo, en una sola computadora con Windows.
- Recibe los comprobantes (capturas de apps bancarias o fotos de tickets) por otros medios, como WhatsApp.
- Moneda: los depósitos se hacen en bolívares (Bs). Los saldos se manejan en dólares (USD) y se convierten con la tasa del día.
- Sin login ni roles en el MVP.

## 3. Stack

| Pieza | Tecnología |
|---|---|
| Shell de escritorio | Tauri 2 (instalador `.msi` para Windows) |
| UI | React + TypeScript + Vite |
| Estilos / componentes | Tailwind CSS + shadcn/ui |
| Base de datos | SQLite local vía `tauri-plugin-sql`, con migraciones versionadas |
| Aritmética de dinero | decimal.js |
| Exportación a Excel | ExcelJS |
| Tests | Vitest |

## 4. Estructura del código

```
src/
  domain/      cálculos puros (USD, saldos acumulados, %, formato y parseo de montos), sin UI ni BD
  db/          repositorios por tabla y migraciones
  extraction/  interfaz Extractor (imagen → campos + confianza); en el MVP no hace nada
  features/    pantallas: campañas, campaña (general), gerente-en-campaña, depósito, gerentes, tasas, configuración
  export/      Excel y respaldos
src-tauri/     Rust mínimo: plugins, copiar imágenes a la carpeta de datos, armar y restaurar el zip de respaldo, log
```

Regla: `domain/` no depende de nada más del proyecto. Todo cálculo de dinero vive ahí.

## 5. Modelo de datos

### `gerentes`
| Campo | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| nombre | TEXT NOT NULL | |
| telefono | TEXT NULL | |
| activo | INTEGER (0/1) | default 1 |
| creado_en | TEXT (ISO) | |

### `campanas`
| Campo | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| nombre | TEXT NOT NULL | |
| fecha_inicio | TEXT (YYYY-MM-DD) | |
| fecha_fin | TEXT NULL | |
| estado | TEXT | `activa` \| `cerrada` |
| notas | TEXT NULL | |
| creado_en | TEXT (ISO) | |

### `asignaciones` (un gerente dentro de una campaña)
| Campo | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| campana_id | FK → campanas | |
| gerente_id | FK → gerentes | |
| saldo_usd | TEXT (decimal) | > 0 |

Restricción: `UNIQUE(campana_id, gerente_id)`.

### `tasas` (histórico, una tasa por día)
| Campo | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| fecha | TEXT (YYYY-MM-DD) UNIQUE | |
| valor | TEXT (decimal) | Bs por 1 USD, > 0 |
| imagen_path | TEXT NULL | captura de la tasa, relativa a la carpeta de datos |
| notas | TEXT NULL | |

### `depositos`
| Campo | Tipo | Notas |
|---|---|---|
| id | INTEGER PK | |
| asignacion_id | FK → asignaciones | |
| tasa_id | FK → tasas | `ON DELETE RESTRICT` |
| fecha | TEXT (YYYY-MM-DD) | |
| banco | TEXT NOT NULL | banco desde el que se hizo el depósito (lista sugerida + texto libre) |
| referencia | TEXT NOT NULL | referencia bancaria |
| cuenta_destino | TEXT NOT NULL | |
| monto_bs | TEXT (decimal) | > 0 |
| observaciones | TEXT NULL | |
| imagen_path | TEXT NULL | comprobante, relativo a la carpeta de datos |
| creado_en | TEXT (ISO) | |
| actualizado_en | TEXT (ISO) | |

### Reglas de datos

- Los montos se guardan como **texto decimal exacto**, nunca como flotantes.
- **No se guardan valores derivados.** USD, saldos restantes y porcentajes siempre se calculan.
  - `usd = monto_bs / tasa.valor`, redondeado a 2 decimales (half-up).
  - Orden de los depósitos: `fecha` ascendente y luego `creado_en` ascendente.
  - Saldo restante por gerente = `saldo_usd` de la asignación − USD acumulados de sus depósitos.
  - Saldo general restante de la campaña = Σ `saldo_usd` de todas las asignaciones − USD acumulados de todos los depósitos de la campaña.
  - % avance = pagado / asignado, limitado a 0–100% para mostrarlo, aunque el valor real puede superar el 100%.
- Las imágenes se copian a `<carpeta de datos>/imagenes/` con nombre UUID. La BD guarda solo la ruta relativa.
- Si ya existe un depósito con el mismo `banco` + `referencia`, se muestra una **advertencia**, pero se permite guardar.

## 6. Pantallas

Barra lateral: **Campañas · Gerentes · Tasas · Configuración**. Toda la interfaz está en español.
Montos con formato venezolano (`1.234.567,89 Bs`, `$ 1.234,56`) y fechas `dd/mm/aaaa`.

1. **Campañas:** tarjetas con nombre, fechas, estado, pagado/asignado y barra de %. Crear campaña y cerrar campaña. Una campaña cerrada es de solo lectura.
2. **Vista general de una campaña**
   - Indicadores fijos arriba: saldo general · pagado USD · restante · % global.
   - Pestaña **Por gerente**: una fila por gerente con asignado, pagado, restante, %, cantidad de depósitos y fecha del último depósito. Se puede ordenar por cualquier columna.
   - Pestaña **Todos los depósitos**: todos los depósitos de la campaña en orden por fecha. Columnas: Fecha · Gerente · Banco · Referencia · Cuenta destino · Monto Bs · Tasa · USD · Saldo general restante · Observaciones · Comprobante. Filtros por gerente, banco y rango de fechas. Con un gerente filtrado, la columna de saldo muestra el saldo de ese gerente. Abajo se muestran los totales de lo filtrado (Bs, USD, cantidad). Al hacer clic en una fila se abre el depósito.
   - Acciones: agregar gerente a la campaña (con su saldo) y exportar a Excel.
3. **Gerente en la campaña:** encabezado con asignado, pagado, restante y %. Tabla de depósitos en orden por fecha con su saldo restante y miniatura del comprobante. Al hacer clic en la miniatura, la imagen se ve con zoom.
4. **Formulario de depósito:** pantalla dividida.
   - Izquierda: imagen. Se puede arrastrar, pegar con Ctrl+V o elegir un archivo.
   - Derecha: formulario. Al cambiar la fecha se busca la tasa de ese día. Si no existe, se crea ahí mismo.
   - USD y saldo restante se calculan en vivo. Hay advertencias de referencia duplicada y de pago que supera el saldo.
   - Botones: "Guardar" y "Guardar y nuevo".
   - Aquí se conecta el `Extractor`. En el MVP no hace nada.
5. **Gerentes:** crear, editar y desactivar. Muestra las campañas en las que participa cada gerente.
6. **Tasas:** histórico por fecha con su imagen. Se pueden crear y editar tasas. Al editar, la app avisa "Esto afecta N depósitos". No se puede borrar una tasa que esté en uso.
7. **Configuración:** carpeta de datos, respaldo y restauración, y lista de respaldos automáticos.

## 7. Punto de extensión para el OCR (fase 2)

```ts
interface Extractor {
  extract(imagePath: string): Promise<ExtractionResult>;
}
type ExtractionResult = {
  fields: Partial<Record<'fecha' | 'banco' | 'referencia' | 'cuentaDestino' | 'montoBs', {
    value: string;
    confidence: number; // 0..1
  }>>;
};
```

En el MVP se usa `NullExtractor`, que devuelve `{ fields: {} }`. El formulario ya sabe pintar los
campos según su nivel de confianza, así que en la fase 2 solo cambia la implementación del `Extractor`.

## 8. Exportación e importación

- **Excel por campaña (`.xlsx`):**
  - Hoja **Resumen**: totales de la campaña y una fila por gerente.
  - Hoja **Todos los depósitos**: en orden por fecha, con el saldo general restante.
  - Una hoja por gerente, con sus depósitos y su saldo restante.
  - Montos como números reales con formato, encabezados con estilo, autofiltros y primera fila fija.
  - Las imágenes no se incluyen. Cada depósito muestra el nombre de archivo de su comprobante.
- **Excel de tasas:** fecha y valor.
- **Respaldo `.zip`:** contiene el archivo SQLite y la carpeta `imagenes/`.
  - **Restaurar** reemplaza todos los datos. Antes pide confirmación y hace un respaldo automático de los datos actuales.
- **Respaldo automático diario** al abrir la app. Se guardan los últimos 7.

## 9. Manejo de errores

- Validación por campo antes de guardar: montos > 0, fecha válida, tasa obligatoria, saldo asignado > 0, campos de texto obligatorios no vacíos.
- Un pago que supera el saldo muestra una advertencia, pero se permite guardar. El saldo negativo se resalta.
- Mensajes de error claros y en español, y un archivo de log local para diagnóstico.
- Las operaciones que modifican varias filas (por ejemplo, restaurar) se hacen dentro de una transacción.

## 10. Pruebas

- `domain/`: Vitest con cobertura de 100%. Cubre conversión a USD, redondeo, saldos acumulados (por gerente y general), porcentajes, pagos de más, formato y parseo de montos venezolanos (`1.234,56`).
- `db/`: repositorios probados contra una SQLite temporal. Cubre migraciones, `UNIQUE(campana, gerente)`, `UNIQUE(tasas.fecha)` y el `RESTRICT` sobre tasas en uso.
- `export/`: se genera un `.xlsx` y se comprueba que tenga las hojas y los totales esperados.
- UI: lista de comprobación manual para el MVP.
