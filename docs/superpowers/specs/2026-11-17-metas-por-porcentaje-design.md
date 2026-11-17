# Metas por porcentaje — diseño corto

## Por qué

Gerencia quiere poner metas de la campaña como **porcentaje de avance** (p. ej. "60 % para el 30/11"), además del monto fijo de
hoy, y **revisar en la app qué gerentes la alcanzaron** sobre su propio saldo. No se exporta ni se envía: es para mirar.

## Qué se construye

- **Tipo de meta** al crearla/editarla (`MetaFormDialog`): *Monto* (USD, como hoy) o *Porcentaje* (0 < p ≤ 100).
- **Meta por monto**: igual que ahora, solo para la campaña.
- **Meta por porcentaje en la campaña**: se mide contra lo pagado de toda la campaña; su marca va en `p` % de la barra y
  "falta" = `p % × asignado − pagado` (si el asignado cambia, la meta lo sigue). Se ve igual en `AvanceCampana`, Campañas,
  Resumen y la lista de metas del Excel/PDF.
- **El porcentaje siempre con su monto equivalente**: donde se muestre una meta de porcentaje va también el monto en USD
  al que equivale hoy, p. ej. "60 % ($30.000,00)" — en la campaña sobre su asignado y en un gerente sobre el suyo
  (columna de "Por gerente", su página). Incluye el formulario (al escribir el %, muestra a cuánto equivale), la casilla de
  la barra, Campañas, Resumen y el Excel/PDF. El equivalente se calcula al momento (no se guarda) y redondea a 2 decimales.
- **Meta por porcentaje en cada gerente**: un gerente la cumple cuando lo pagado **hasta hoy** ≥ `p %` de su asignado
  (regla B: pagar tarde también cumple; no se mira la fecha de los depósitos). Un gerente con asignado 0 no cuenta
  (ni cumplió ni no cumplió).

## Dónde se revisa (opción 3)

1. **Pestaña "Por gerente"**: arriba un selector de meta (solo las de porcentaje; por defecto la próxima sin cumplir de la
   campaña, si no hay, la última) con chips "Cumplieron N" / "No cumplieron M" que filtran la tabla (como los chips de
   estado), y una columna "Meta p %" con "Cumplida" o lo que le falta en USD. La meta elegida y el chip van en la URL
   (`useFiltrosUrl`). Sin metas de porcentaje no aparece nada de esto.
2. **Atajo desde la barra**: la casilla de una meta de porcentaje en `AvanceCampana` dice "12 de 20 gerentes la cumplen"; un
   clic lleva a "Por gerente" con esa meta elegida (el clic en la marca sigue editando la meta).
3. **Página del gerente en la campaña** (`AsignacionPage`): su barra de avance lleva las marcas de las metas de porcentaje
   con su estado para ese gerente.

## Enfoques considerados

- Solo en "Por gerente": completo, pero hay que ir a buscarlo.
- Solo una ventana desde la marca: rápida, pero una tabla aparte sin orden, búsqueda ni árbol.
- **Elegido: "Por gerente" + atajo desde la marca** — la revisión usa la tabla que ya existe y el atajo cuesta poco.

## No entra

- Metas propias por gerente o montos repartidos; cumplimiento "a tiempo" según la fecha de los depósitos (regla A/C, quizá
  más adelante); exportar o enviar el cumplimiento por gerente.

## Datos

- Migración nueva (v12): columna `porcentaje TEXT` en `metas` (nulo = meta por monto). Cómo convive con `monto_usd NOT NULL`
  (rehacer la tabla o guardar un valor fijo) lo decide el plan. Las metas siguen sin viajar en el `.cpagos`.
- Nada derivado se guarda: cumplimiento y "falta" se calculan en `domain/metas.ts` (extender `vistaMetas` y una función pura
  para el cumplimiento por gerente), con sus pruebas primero.
