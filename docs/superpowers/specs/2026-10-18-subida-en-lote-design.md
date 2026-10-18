# Subida en lote y revisión de depósitos y tasas

Fecha: 18/10/2026. Se apoya en el MVP (`2026-10-18-control-pagos-design.md`) y en el OCR (`2026-10-18-ocr-comprobantes-design.md`).

## 1. Intención

Hoy cada comprobante se registra por separado: se abre "Registrar depósito", se suelta la imagen, el OCR llena los campos y se guarda. Lo mismo con las tasas en su diálogo. Cuando llegan muchas capturas juntas, abrir el formulario una vez por imagen se vuelve lento.

El usuario quiere **lo mismo que el registro individual, pero en lote**: subir varias imágenes de una vez y luego revisarlas **una a una** en una vista de revisión. Cada una se marca como **hecha** al terminar de revisarla, y **es ahí cuando se guarda**. Antes de eso no afecta los saldos.

## 2. Objetivos, no-objetivos, anti-objetivos

**Objetivos**
- Depósitos: desde la campaña, subir varias imágenes, leerlas con el OCR actual y dejarlas en una **cola de revisión** de esa campaña.
- Tasas: lo mismo desde la página de Tasas, con una cola de tasas.
- Vista de revisión: lista de la cola a la izquierda, imagen grande al centro y a la derecha **el mismo formulario** del registro individual. Botones **Hecho** (guarda y pasa al siguiente pendiente), **Saltar** y **Descartar**.
- **La cola sobrevive al cierre de la app.** Si se revisan 12 de 30 y se cierra, al volver están los 18 pendientes con lo que ya se había corregido.
- Gerente: los comprobantes pueden venir mezclados. Se puede (a) elegir un gerente para todo el lote al subirlo y (b) marcar varios en la cola y asignarles un gerente de una vez. Además se puede cambiar el gerente de cada uno al revisarlo.

**No-objetivos**
- Guardar sin revisar ("guardar todos"). Cada uno pasa por **Hecho**.
- Reconocer al gerente desde la imagen.
- Formatos nuevos de comprobante (eso sigue el procedimiento de CLAUDE.md).
- Subir PDF o carpetas completas; solo imágenes PNG, JPG o WEBP, como hoy.

**Anti-objetivos (sería un fracaso aunque "funcione")**
- Que algo de la cola cuente en los saldos, el Excel o los totales antes de darle **Hecho**.
- Que **Hecho** guarde con reglas distintas a las del formulario individual (tasa de la misma fecha, campaña cerrada, validaciones, aviso de duplicados). Se reutiliza la misma lógica, sin una copia paralela.
- Perder correcciones ya hechas en la cola por cerrar la app o cambiar de elemento.
- Que el OCR pise lo que la usuaria corrigió (las mismas reglas de `autollenado.ts`).
- Que un fallo en la lectura de una imagen detenga el lote. Esa imagen queda en la cola "sin leer" para llenarla a mano.

## 3. Lo que decidió el usuario

- El depósito o la tasa **se guarda al darle Hecho**, no antes.
- La cola **persiste** entre sesiones.
- El gerente se asigna para todo el lote al subirlo, o marcando varios en la cola. Aprobó la maqueta de las dos pantallas (subir lote y revisión) tal como se describe en §5.

## 4. Datos

Migración nueva (versión siguiente en `db/migrations.ts`) con dos tablas.

`cola_depositos`
| columna | tipo | notas |
|---|---|---|
| id | INTEGER PK | |
| campana_id | INTEGER NOT NULL → campanas(id) | una cola por campaña |
| imagen_path | TEXT NOT NULL | ya guardada en `imagenes/` al subir |
| nombre_archivo | TEXT | nombre original, para mostrar |
| estado | TEXT NOT NULL | `'pendiente'` \| `'hecho'` |
| borrador | TEXT NOT NULL | JSON: `{ draft: DepositoDraft sin tasaId, destino: DestinoDraft, auto: Autollenado }` |
| formato | TEXT | id del reconocedor, o null si no se reconoció o no se leyó |
| deposito_id | INTEGER → depositos(id) ON DELETE SET NULL | se llena al darle Hecho |
| orden | INTEGER NOT NULL | orden de subida |
| creado_en / actualizado_en | TEXT NOT NULL | |

`cola_tasas`: lo mismo sin `campana_id`, con `borrador` = `{ draft: TasaDraft, auto }` y `tasa_id` en vez de `deposito_id`.

- Que el borrador sea JSON es decisión mía: es estado de la UI y no se consulta por columnas. Los derivados (USD, saldos) siguen sin guardarse.
- La tasa del depósito **no** se guarda en el borrador. Se resuelve al revisar con `getTasaParaFecha`, igual que hoy.
- Los elementos hechos se quedan en la cola (como "hecho", con enlace al depósito) hasta que se usa "Quitar hechos". Así se ve el avance ("12 de 30 hechos").
- La imagen se guarda una sola vez. Al darle Hecho, el depósito usa el mismo `imagen_path`, sin copiarla. **Descartar** borra la fila y también su imagen. Quitar hechos solo borra las filas.
- Los respaldos ya incluyen `imagenes\` y la BD, así que la cola se respalda y se restaura con todo lo demás.

## 5. Pantallas

### 5.1 Subir lote (depósitos)
- Acceso: botón **"Subir lote"** en la cabecera de la campaña, junto a "Registrar depósito". Ruta `campanas/:campanaId/lote`. Deshabilitado si la campaña está cerrada.
- Zona para soltar o pegar varias imágenes, más "Elegir archivos…" (input con `multiple`).
- Selector opcional **"Gerente para todo el lote"**. Solo ofrece los gerentes que ya están en la campaña (decisión mía: agregar un gerente nuevo con saldo se hace al revisar, con `DestinoGerente`).
- Al soltarlas, cada imagen se guarda en `imagenes/` y se crea su fila en la cola de inmediato, con el borrador vacío y el gerente del lote. Luego se leen **una por una** con el extractor (el OCR de Windows es pesado, así que no se lanzan en paralelo) y el borrador se actualiza con `aplicarExtraccion` sobre `autollenadoNuevo()`. La tabla muestra el estado de cada una: leyendo, leído (formato) o no reconocido / error.
- Botón **"Ir a revisar"**. No hace falta esperar a que terminen las lecturas para irse. Si se sale de la pantalla a mitad del lote, las que faltaban por leer quedan en la cola sin leer, con borrador vacío, y se llenan a mano (decisión mía: no hay reintento automático del OCR en segundo plano).

### 5.2 Revisión (depósitos)
- Ruta `campanas/:campanaId/revision`. En la campaña, el botón **"Revisar (N)"** aparece cuando hay pendientes.
- Encabezado con el avance: "12 de 30 hechos".
- **Lista izquierda**: cada elemento muestra estado (✔ hecho, ▶ actual, ○ pendiente), banco, monto y gerente (o "sin gerente"). Tiene casillas para seleccionar varios y la acción **"Asignar gerente a marcados…"** (gerentes de la campaña). Filtro Pendientes / Hechos / Todos; por defecto, Pendientes.
- **Centro**: la imagen grande.
- **Derecha**: el formulario de depósito (gerente con `DestinoGerente`, fecha, tasa del día con "Registrar tasa", banco, referencia, monto, cuenta destino y observaciones), los colores de confianza, la tarjeta de dólares y saldos "después", el aviso de duplicado y el aviso de pago de más. Hay que **extraer el formulario de `DepositoPage.tsx` a un componente compartido** para que el registro individual y la revisión usen el mismo. La imagen ya no se cambia desde este formulario en la revisión.
- **Autoguardado del borrador**: cada cambio se guarda en la fila de la cola (con un retraso de unos 500 ms y al cambiar de elemento).
- **Hecho**: valida igual que "Guardar" y guarda con `createDeposito` o `registrarDepositoEnCampana`. Si sale bien, marca la fila como hecha, le pone `deposito_id`, avisa con un toast y abre el siguiente pendiente. Si falla, muestra el error y la fila sigue pendiente. Para no dejar un depósito sin marcar, primero se guarda el depósito y después se marca la fila; si marcar la fila falla, se borra el depósito recién creado (reversión manual, como en `db/operaciones/`).
- **Saltar**: pasa al siguiente pendiente sin guardar (el borrador ya quedó autoguardado).
- **Descartar**: pide confirmación y borra la fila y su imagen.
- Un elemento **hecho** se ve en solo lectura, con un enlace "Ver depósito" que lleva a la edición normal.
- **Duplicados dentro de la cola**: además del aviso contra los depósitos guardados, se avisa si otro elemento pendiente de la cola tiene el mismo banco + referencia (`claveComparacion`). Es un aviso, no bloquea.
- Con la campaña cerrada, la revisión es de solo lectura. Hecho, Descartar y Asignar se deshabilitan.

### 5.3 Tasas
- En la página de Tasas, botones **"Subir lote"** (ruta `tasas/lote`) y **"Revisar (N)"** (ruta `tasas/revision`), con el mismo esquema.
- El formulario de la derecha tiene fecha, Bs por USD y notas, igual que `TasaFormDialog`, con el aviso de fin de semana y el de "la imagen es del …". Habría que extraer el cuerpo del diálogo a un componente compartido.
- Hecho llama a `createTasa`. Si ya hay tasa para esa fecha o la fecha cae en fin de semana, se muestra el error de siempre y la fila sigue pendiente para corregir la fecha o descartarla.
- Sugerencia en la UI: si la cola de depósitos tiene elementos sin tasa para su fecha, el formulario lo dice como hoy y ofrece "Registrar tasa". No se enlaza automáticamente con la cola de tasas.

### 5.4 Zoom con la rueda del ratón (pedido del usuario, aplica en toda la app)
- Un componente compartido `ZoomableImage` para mostrar imágenes:
  - La rueda del ratón **sobre la imagen** acerca o aleja **hacia el punto del cursor**, entre "ajustada" y 400 %.
  - Con zoom, se arrastra con el ratón para moverse por la imagen.
  - Doble clic vuelve a "ajustada".
  - Muestra un indicador con el porcentaje.
- Se usa en:
  - la imagen central de la revisión (depósitos y tasas);
  - la vista previa de `ImageDrop`, es decir, el formulario de depósito y el diálogo de tasa (los "modales");
  - el visor `ImageViewer`, que hoy solo tiene los botones + / −. Los botones se mantienen y la rueda se suma.
- Con la rueda sobre la imagen no se desplaza la página ni el modal (`preventDefault`). Fuera de la imagen, el scroll funciona como siempre.
- En `ImageDrop` el zoom no debe interferir con soltar, pegar ni "Cambiar/Quitar". Con la imagen ya puesta, el clic no abre el selector de archivo (como hoy) y el arrastre sirve para mover la imagen.

## 6. Dónde va la lógica (TDD)

- `db/repos/colaDepositos.ts` y `db/repos/colaTasas.ts`: crear, listar por campaña, actualizar borrador, asignar gerente a varios, marcar hecho, descartar, quitar hechos, contar pendientes. Con pruebas en sql.js como los demás repos.
- `db/operaciones/revision.ts`: "Hecho" para depósito y para tasa (guardar, marcar y revertir si falla), con pruebas, incluida la de campaña cerrada.
- Funciones puras para el siguiente pendiente y los duplicados dentro de la cola, en `domain/` con pruebas.
- La UI se verifica con `pnpm build` y agregando casos a `docs/checklist-mvp.md`.

## 7. Detalles que decidí yo (revisables)

- Si el OCR no lee la fecha, el borrador queda **sin fecha** y no con la de hoy. Así un comprobante viejo no se guarda con la fecha equivocada.
- "Asignar gerente a marcados" **reemplaza** el gerente de los elementos marcados que están pendientes. Los hechos no se tocan.
- **Descartar** solo se permite en los pendientes. La imagen de un hecho ya pertenece a su depósito.
- `cola_depositos.campana_id` lleva `ON DELETE CASCADE` y `deposito_id` / `tasa_id` llevan `ON DELETE SET NULL`. Si se borra el depósito, la fila sigue como hecha pero sin enlace.
- No se detecta la misma imagen subida dos veces. El aviso de banco + referencia repetidos dentro de la cola ya lo cubre.
- Después de Hecho, Descartar o Asignar se llama a `invalidate()`, como en cualquier escritura.

## 8. Lo que queda a criterio de quien construya

- Diseño visual exacto, siempre con los componentes existentes (shadcn Base UI, `Field`, `Aviso`, `SortableHead` si ayuda).
- Atajos de teclado (por ejemplo Ctrl+Enter = Hecho).
- Si la cola de tasas y la de depósitos comparten un componente genérico de revisión o son dos pantallas parecidas.
