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
