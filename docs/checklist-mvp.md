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
