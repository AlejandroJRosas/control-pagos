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
- [ ] Tasas → Calendario → clic en un día con tasa → "Eliminar": pide confirmar y la borra; con depósitos que la usan, el botón está deshabilitado y explica por qué.
- [ ] Gerentes → clic en una fila abre su ficha: totales de todas sus campañas y una fila por campaña (cerrada marcada); clic en una campaña abre su página y el volver regresa a la ficha. Editar y Activar/Desactivar funcionan desde la ficha. En la página del gerente en una campaña, el nombre lleva a la ficha. Ctrl+K con un gerente sin campañas abre su ficha.
- [ ] "Todos los depósitos": orden cronológico, filtros por gerente/banco/fechas y totales.
- [ ] Ordenar la pestaña "Por gerente" por % avance.
- [ ] Campaña → "Cerrar campaña" → todo de solo lectura ("Registrar depósito" y su menú deshabilitados); reabrir.
- [ ] Campaña → "Eliminar campaña": el primer aviso muestra cuántos depósitos, gerentes y pendientes se borran; "Continuar" pide escribir el nombre y "Eliminar definitivamente" solo se habilita si coincide. Al eliminar vuelve a Campañas, la campaña ya no está (ni en "Campaña actual"), los gerentes y tasas siguen, y hay un `antes-de-eliminar-*.zip` en Configuración → respaldos. Con la campaña cerrada la opción está deshabilitada.
- [ ] Menú "Exportar" → "Excel (.xlsx)": Resumen, Todos los depósitos, una hoja por gerente; números sumables en Excel. Franja azul con el título, cifras clave, filas alternadas, barra de datos en "% avance", saldos negativos en rojo; la vista previa de impresión sale horizontal en una página de ancho con el encabezado repetido.
- [ ] Menú "Exportar" → "PDF (.pdf)": página 1 con la barra general y el resumen por gerente; una página por gerente con sus depósitos (incluye cuenta destino). Probar un gerente que cobró de más ("Pagado de más" en rojo), uno sin depósitos ("Sin depósitos registrados") y uno con más de 40 depósitos (la tabla sigue en la página siguiente con su encabezado). El texto se puede seleccionar y los acentos se ven bien.
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
- [ ] Una fila sin tasa en el Excel cuya fecha ya tiene tasa en la app: sale marcada con "Tasa tomada de la app".
- [ ] Una fila con datos faltantes o inválidos muestra campos en rojo en esas celdas; al completarlos (salir del campo o Enter) se recalculan tasa, USD y duplicados, la fila se marca sola y dice "Editada". Una tasa escrita para una fecha sin tasa se registra al importar.

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

- [ ] Depósito con fecha sábado o domingo: toma la tasa del lunes y lo indica "(la del lunes dd/mm/aaaa)"; sin tasa del lunes, "Registrar tasa" abre con la fecha del lunes (si el lunes es feriado, la del martes).
- [ ] Registrar una tasa con fecha sábado o domingo: aviso y error "Los sábados y domingos usan la tasa del lunes…".
- [ ] Importar un Excel con depósitos de sábado/domingo: se comparan con la tasa del lunes (o la crean en el lunes).
- [ ] Tasas → Calendario: verde = con tasa (clic para editar), ámbar = día hábil sin tasa (clic para registrar con esa fecha), gris = fin de semana con la tasa del lunes; contador de días pendientes; navegar meses y "Hoy".
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

## Usabilidad (búsqueda, atajos, deshacer, WhatsApp)

- [ ] Editar un depósito y hacer clic en la barra lateral o pulsar Esc: pide "Cambios sin guardar"; Cancelar se queda, "Salir sin guardar" sale. Cerrar la ventana con cambios también pregunta. Guardar no pregunta.
- [ ] Borrar un depósito con la papelera: sin confirmación, aviso con "Deshacer" que lo devuelve con los mismos datos y saldos. Varios seleccionados: pide confirmación y también se pueden deshacer.
- [ ] Campaña → Todos los depósitos: buscar por referencia, por monto ("1.234" y "1234") y por gerente; cambiar de pestaña, abrir un depósito, volver y reiniciar la app: los filtros siguen.
- [ ] Abrir un depósito desde Campaña → Todos los depósitos (con un filtro puesto): el botón de volver, Esc, Guardar y Eliminar regresan a la campaña con el filtro, no al gerente. Abierto desde la página del gerente, regresan al gerente; desde "Ver depósito" en la revisión, a la revisión.
- [ ] Barra lateral: al angostar la ventana (≤ 1100 px) se colapsa a íconos y al ensancharla se expande sola. El botón de arriba (o Ctrl+B) la colapsa con cualquier ancho y queda así al reiniciar; volver a expandirla devuelve el modo automático. Colapsada, cada ícono muestra su nombre al pasar el ratón.
- [ ] Filtro de gerente y gerente del depósito: se puede escribir para buscar (sin acentos); el depósito muestra "En la campaña" / "Agregar a la campaña".
- [ ] Por gerente: chips Sin pagos / En curso / Completo / Pagado de más con conteos; filtran la tabla.
- [ ] Estados vacíos: campaña sin depósitos ofrece Registrar / Subir lote; sin gerentes, Agregar gerentes; filtros sin resultados, Limpiar filtros.
- [ ] Ctrl+K: buscar una referencia de otra campaña y abrirla con Enter; buscar un gerente lleva a su página en cada campaña.
- [ ] Atajos: `/` enfoca el buscador de la tabla, `N` abre el nuevo registro de la pantalla, Ctrl+Enter guarda el depósito, `?` muestra la ayuda. No se disparan mientras se escribe en un campo.
- [ ] Gerente sin teléfono: "Agregar teléfono…" abre su ficha. Con teléfono "0414-1234567": "Recordatorio por WhatsApp" abre el chat con el resumen.
- [ ] Estado de cuenta: Copiar imagen y pegarla en otro programa; Guardar imagen… crea el PNG; "Copiar y abrir WhatsApp" abre el chat con la imagen lista para Ctrl+V.
- [ ] Al abrir la app: los `antes-de-*.zip` de más de 30 días se borran (quedan al menos 5) y las imágenes sin registro de más de un día desaparecen de `imagenes\`, después del respaldo del día.

## Columnas, fechas y zoom (0.2.0)

- [ ] Campaña → Todos los depósitos: "Columnas" oculta y reordena columnas (flechas); el pie de totales sigue bajo Monto Bs y USD aunque se muevan; no deja ocultar la última; Restablecer vuelve al orden original. Se recuerda al reiniciar, aparte para la campaña, la página del gerente y Por gerente.
- [ ] Campos de fecha (depósito, tasa, campaña, filtros Desde/Hasta): se ven como dd/mm/aaaa; al escribir "18102026" se ponen las barras; el ícono abre el calendario en español; una fecha inválida ("31/02/2026") queda en rojo y no se guarda.
- [ ] Ctrl + rueda agranda o achica toda la app (aviso con el %); Ctrl + / Ctrl − también; Ctrl 0 vuelve al 100 %. Sobre un comprobante, Ctrl + rueda sigue haciendo zoom de la imagen. El zoom se mantiene al reiniciar.

## Respaldos en Drive, feriados, aviso de tasa y WhatsApp en lote (0.3.0)

- [ ] Configuración → Copia en Google Drive → "Elegir carpeta…" (una carpeta de `G:\Mi unidad`): copia el último `auto-*.zip` y muestra "Última copia". Quedan como mucho 7 `auto-*.zip` allí; otros archivos de la carpeta no se tocan.
- [ ] Con Google Drive cerrado (o la carpeta borrada), "Copiar ahora": error claro; el respaldo local existe igual y arriba aparece la franja roja con "Reintentar". Con más de 3 días sin copia exitosa, franja ámbar.
- [ ] Hacer un cambio y cerrar la ventana: "Respaldando antes de cerrar…" y `auto-<hoy>.zip` queda con la hora del cierre (y en Drive). Cerrar sin cambios: cierra al instante. Formulario sin guardar + cerrar: primero el diálogo; Cancelar deja la app abierta.
- [ ] En la revisión en lote, editar un campo y cerrar la ventana enseguida: al volver la edición sigue ahí. Abrir "Descartar" y pulsar Ctrl+Enter: no se da Hecho.
- [ ] Tasas → Feriados: aparecen los nacionales del año (Carnaval y Semana Santa en sus fechas); agregar uno bancario; no deja marcar un día con tasa ni quitar uno con depósitos. En el calendario el feriado sale en gris con su nombre y la tasa del siguiente día hábil.
- [ ] Depósito con fecha de un feriado: toma la tasa del siguiente día hábil ("Feriado: la del …"); registrar una tasa en un feriado da error.
- [ ] Abrir la app un día hábil sin tasa: franja "Falta la tasa de hoy"; "Registrar tasa" la guarda y la franja se va; "Hoy es feriado" la marca como feriado. Un pendiente de la cola con fecha sin tasa: "Faltan tasas de N día(s)…".
- [ ] Copiar un `control-pagos.db` dañado (o con una referencia rota) en la instancia aislada: al abrir aparece "La base de datos parece dañada" con los respaldos para restaurar, sin hacer el respaldo automático.
- [ ] Configuración → Mensajes de WhatsApp: editar, ver la vista previa, un `{campo}` mal escrito avisa; Guardar; el estado de cuenta individual usa el texto nuevo; "Restaurar el texto original".
- [ ] Campaña → menú Campaña → "Enviar estados de cuenta": marcados por defecto los que deben y tienen teléfono; "Agregar teléfono…" en los que no; Empezar recorre uno a uno ("N de M") con "Copiar y abrir WhatsApp", Siguiente/Omitir y el resumen final.
- [ ] Monto "0.500" en un depósito: "Monto inválido". Referencia "000123" de "BDV" avisa como duplicada de "123" de "Banco de Venezuela".
- [ ] Copia en Drive: los respaldos quedan en una subcarpeta con el nombre del equipo (la instancia de prueba usa otra); un `auto-*.zip.part` viejo de esa subcarpeta desaparece en la siguiente copia y no se tocan las de otros equipos.
- [ ] Filtro Banco (Campaña → Todos los depósitos), año en Tasas → Feriados y "Banco de origen" del depósito: mismo buscador desplegable que los demás filtros. En "Banco de origen" se puede escribir un banco que no está en la lista.
- [ ] Calendario de tasas: un día con captura muestra el ícono de imagen arriba a la derecha y abre la captura; el resto del cuadro sigue editando la tasa.
- [ ] Con una versión nueva disponible, "Más tarde" cierra el aviso y aparece "Actualizar a X.Y.Z" en la barra lateral, encima de "Atajos de teclado" (colapsada, solo el ícono); al pulsarlo vuelve el aviso.
- [ ] Con la app abierta desde antes de publicar una versión, a más tardar en 10 minutos sale abajo el mensaje "Hay una versión nueva (X.Y.Z)" (sin abrir el aviso) y el botón de la barra lateral; "Actualizar" en el mensaje abre el aviso.

## Consolidar campañas entre instalaciones

Usar la instancia aislada de `CLAUDE.md` como segunda app (otros datos y puerto), con la misma campaña en ambas.

- [ ] Campaña → menú Campaña → "Compartir para consolidar": elegir gerentes, "Copiar para WhatsApp" (solo copia el archivo y avisa "Copiado: pégalo en el chat de WhatsApp con Ctrl+V"; no abre WhatsApp); en el chat, Ctrl+V pega el `.cpagos` como archivo. "Guardar como…" crea el archivo. Deshabilitado si la campaña no tiene gerentes.
- [ ] En la otra app, soltar el `.cpagos` en cualquier pantalla: abre Consolidar con la campaña sugerida. También por menú Campaña → "Consolidar desde archivo…". Un archivo que no es paquete (renombrado) da "El archivo no es un paquete de Control de Pagos válido".
- [ ] Emparejamiento: campaña y gerentes se reconocen por lo recordado o por nombre; dos gerentes del archivo no se dejan emparejar con el mismo local (aplicar queda bloqueado con el motivo).
- [ ] Ida y vuelta: registrar depósitos distintos en cada app, enviar A → B y aplicar (nuevos con su comprobante, tasas creadas si faltan); luego B → A. Ambas quedan con los mismos depósitos y saldos. Volver a enviar sin cambios: todo "sin cambios".
- [ ] Corregir un depósito en A y enviar con "Solo lo que cambió desde mi último envío": en B aparece como corrección con el antes/después. Corregirlo en ambas apps: sale como conflicto; con "Quedarse con la mía" se conserva y el siguiente archivo vuelve a marcarlo conflicto; con "Usar la del archivo" se reemplaza.
- [ ] Eliminar un depósito en A (y probar Deshacer): el envío siguiente lo elimina en B solo si no se deshizo; la eliminación aparece en su sección con casillas; solo se eliminan las marcadas.
- [ ] Un depósito duplicado, con tasa distinta o con saldo distinto: aparece en su sección con botones para elegir (una tasa distinta hay que elegirla para poder consolidar). Campaña cerrada: no deja consolidar.
- [ ] "No se incluyen" (p. ej. falta la tasa o el gerente no está emparejado): dice "Para recibirlos más adelante, pide que te manden la campaña con «Solo lo que cambió desde mi último envío» desmarcado." (un envío incremental no los vuelve a traer si no cambiaron).
- [ ] Mismo depósito registrado en las dos (vinculado): editarlo, cambiarle la referencia o eliminarlo en B y enviar a A: A lo corrige o lo ofrece eliminar (no agrega otro ni lo trata como duplicado); al volver A → B la edición de B no se revierte.
- [ ] Duplicado limpiado en A (pantalla de duplicados, quedarse con el nuevo) y enviado a B, que tenía el viejo: B elimina el viejo y agrega el que quedó; desmarcando esa eliminación no deja consolidar.
- [ ] Tras aplicar: antes de aplicar, resumen antes → después por gerente; al aplicar se crea un respaldo `antes-de-consolidar-*` y sale un aviso con lo consolidado; si algo falla a mitad, se revierte todo.

## Árbol de gerentes

- [ ] Campaña → Estructura con unos 40 gerentes en 4 niveles: el organigrama se lee, hay scroll horizontal y el arrastre funciona en la app real (soltar sobre otro lo pone debajo; la punta y «Sin estructura» quitan el jefe). Arrastrar a una rama propia no resalta ni se deja.
- [ ] Soltar una imagen de comprobante sobre Estructura sigue abriendo el registro (el arrastre de archivos no se traga). Por gerente muestra el árbol, se pliega por rama. En Compartir para consolidar, marcar un jefe marca su rama (y si la rama está a medias avisa "(él no)" cuando el jefe no va).
- [ ] Ida y vuelta real con dos instancias (la aislada de `CLAUDE.md`): compartir una rama, "Agregar a mi campaña" para los gerentes que faltan, "Jefe distinto" con «mía» por defecto y un ciclo bloqueado; luego B → A deja ambos árboles iguales.
