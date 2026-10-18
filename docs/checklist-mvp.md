# Checklist manual del MVP

Ejecutar con `pnpm tauri dev` (o con el instalador) partiendo de datos vacíos.

- [ ] Crear 3 gerentes; desactivar uno; no aparece al agregar gerentes a una campaña.
- [ ] Crear campaña; Campaña → "Agregar gerentes": buscar, marcar 3, "Mismo saldo para los marcados" y cambiar uno; saldo general = suma. Un saldo vacío o 0 marca el error en su fila y no agrega ninguno.
- [ ] Registrar tasa desde Tasas y otra desde el formulario de depósito.
- [ ] Registrar depósitos pegando (Ctrl+V), arrastrando y eligiendo archivo.
- [ ] USD = Bs ÷ tasa con 2 decimales; saldo del gerente y general bajan en cada depósito.
- [ ] Aviso de referencia duplicada (mismo banco, distinta capitalización).
- [ ] Aviso y saldo en rojo al pagar de más.
- [ ] Editar la tasa de un día avisa "afecta N depósitos" y recalcula los saldos.
- [ ] No se puede eliminar una tasa en uso.
- [ ] "Todos los depósitos": orden cronológico, filtros por gerente/banco/fechas y totales.
- [ ] Ordenar la pestaña "Por gerente" por % avance.
- [ ] Campaña → "Cerrar campaña" → todo de solo lectura ("Registrar depósito" y su menú deshabilitados); reabrir.
- [ ] Exportar campaña a Excel: Resumen, Todos los depósitos, una hoja por gerente; números sumables en Excel.
- [ ] Exportar tasas a Excel.
- [ ] Crear respaldo, restaurarlo; respaldo automático diario visible.
- [ ] Cerrar y volver a abrir la app: todos los datos siguen ahí.

## Campaña actual, depósito desde la campaña e importación de Excel

- [ ] Abrir una campaña, cerrar la app y volver a abrirla: entra directo a esa campaña; aparece en "Campaña actual" de la barra lateral.
- [ ] La campaña abre en "Todos los depósitos"; el filtro se mantiene al abrir un depósito y volver.
- [ ] "Registrar depósito" desde la campaña: con un gerente de la campaña, con otro gerente existente (pide saldo) y con uno nuevo (pide nombre y saldo).
- [ ] "Guardar y nuevo" desde la campaña deja seleccionado el gerente recién usado.
- [ ] Crear un gerente nuevo con el nombre de otro existente (otra capitalización) muestra el error y no crea nada.
- [ ] "Importar Excel" con una factura (hoja CUADRO DE PAGOS): detecta gerente y saldo inicial, lista los depósitos con USD.
- [ ] Una fecha sin tasa aparece como "Tasa nueva" y al importar queda en Tasas; una tasa distinta a la registrada sale desmarcada.
- [ ] Importar el mismo Excel dos veces: la segunda vez todas las filas salen como "Ya registrado" y desmarcadas.
- [ ] Varios Excel a la vez; importar uno actualiza la revisión de los demás.

## OCR de comprobantes y tasas

- [ ] Soltar una captura de transferencia BDV en un depósito nuevo: se llenan fecha, banco, referencia, monto y cuenta destino con borde de color, y la tasa de esa fecha se busca sola.
- [ ] Escribir el monto antes de soltar la imagen: el monto no se pisa.
- [ ] Reemplazar la captura por la imagen de tasa: los campos que había puesto el OCR se vacían (la fecha vuelve a la inicial) y sale el aviso "No se reconoció el formato del comprobante".
- [ ] "Guardar y nuevo" y soltar otra captura: la fecha la pone la nueva captura.
- [ ] Editar un depósito guardado y cambiar su imagen: solo se llenan los campos vacíos.
- [ ] Mientras se lee aparece "Leyendo comprobante…"; quitar la imagen antes de que termine no llena nada.
- [ ] Tasas → "Registrar tasa" y soltar la imagen "TASA DEL DÍA": fecha 16/10/2026 y valor 880,12.
- [ ] Desde el depósito (fecha fija distinta) soltar la imagen de tasa: se llena el valor, la fecha no cambia y aparece "La imagen es del dd/mm/aaaa".
- [ ] Sin el idioma español con OCR en Windows, el toast explica cómo instalarlo (mensaje en `src-tauri/src/ocr.rs`).

## Fines de semana, calendario de tasas y tablas

- [ ] Depósito con fecha sábado o domingo: toma la tasa del viernes y lo indica "(la del viernes dd/mm/aaaa)"; sin tasa del viernes, "Registrar tasa" abre con la fecha del viernes.
- [ ] Registrar una tasa con fecha sábado o domingo: aviso y error "Los sábados y domingos usan la tasa del viernes…".
- [ ] Importar un Excel con depósitos de sábado/domingo: se comparan con la tasa del viernes (o la crean en el viernes).
- [ ] Tasas → Calendario: verde = con tasa (clic para editar), ámbar = día hábil sin tasa (clic para registrar con esa fecha), gris = fin de semana con la tasa del viernes; contador de días pendientes; navegar meses y "Hoy".
- [ ] Todas las tablas: clic en el encabezado ordena ascendente → descendente → original; montos ordenan como número; filas alternadas con color.
- [ ] Rueda del ratón sobre cualquier imagen (formulario, diálogo de tasa, visor, revisión): acerca hacia el cursor sin desplazar la página; arrastrar mueve; doble clic ajusta; el visor conserva − / + / Ajustar / Tamaño real.
- [ ] Depósitos: botón de eliminar por fila con confirmación; marcar varios (o todos) y "Eliminar seleccionados"; en campaña cerrada no hay casillas ni botón.

## Subida en lote y revisión

- [ ] Campaña → "Subir lote": soltar 5 capturas y un PDF → aviso solo por el PDF; las 5 pasan por "Leyendo…" una a una y quedan "Leído (formato)" o "Formato no reconocido".
- [ ] Elegir "Gerente para todo el lote" antes de soltar: en la revisión aparecen con ese gerente.
- [ ] Salir de "Subir lote" mientras lee: las que faltaban quedan en la cola sin leer, para llenar a mano.
- [ ] La campaña muestra "Revisar (N)"; los saldos y el Excel no cambian hasta darle Hecho.
- [ ] Revisión: lista a la izquierda, imagen con zoom al centro, mismo formulario a la derecha (colores de confianza, tasa del día, saldos "después", "Registrar tasa").
- [ ] Hecho (o Ctrl+Enter) registra el depósito con la imagen y abre el siguiente pendiente; con errores de validación no avanza.
- [ ] Corregir un campo, cerrar la app y volver: la corrección sigue ahí.
- [ ] Saltar pasa al siguiente sin guardar; con un solo pendiente se queda en él.
- [ ] Marcar varios y "Asignar gerente a marcados", incluido el abierto: todos quedan con ese gerente.
- [ ] Dos comprobantes de la cola con el mismo banco y referencia: aviso "En la cola hay otro…".
- [ ] Descartar pide confirmación, quita el elemento y borra su imagen de `imagenes\`.
- [ ] Filtro Hechos: un hecho se ve en solo lectura con "Ver depósito"; "Quitar hechos" los saca de la lista.
- [ ] Campaña cerrada: "Subir lote" deshabilitado; la revisión es de solo lectura.
- [ ] Tasas → "Subir lote" y "Revisar (N)": Hecho registra la tasa con su imagen; fecha repetida o fin de semana → error y sigue pendiente; cambiar la fecha leída → "La imagen es del …".
