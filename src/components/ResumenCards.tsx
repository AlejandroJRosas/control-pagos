import Decimal from "decimal.js";
import { CircleAlert, CircleCheck, Copy, Hourglass, Pencil, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { reportError } from "@/lib/reportError";
import type { Resumen } from "@/domain/campanaView";
import { formatPct, formatUsd } from "@/domain/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { BotonConMotivo } from "@/components/BotonConMotivo";
import { cn } from "@/lib/utils";
import type { MetaVista } from "@/domain/metas";
import { ESTILO_META, describirMeta } from "./estiloMeta";

/** Colores fijos por significado (no siguen el tema): saldo azul, pagado verde, restante ámbar, de más rojo.
    `icono` es el fondo del icono y `lengueta` la franja del borde izquierdo de la tarjeta. */
const TONOS = {
  asignado: { icono: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300", lengueta: "bg-sky-500" },
  pagado: { icono: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", lengueta: "bg-emerald-500" },
  restante: { icono: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300", lengueta: "bg-amber-500" },
  peligro: { icono: "bg-destructive/10 text-destructive", lengueta: "bg-destructive" },
  avance: { icono: "bg-primary/25 text-primary-intenso", lengueta: "bg-primary-intenso" },
};

type Tono = (typeof TONOS)[keyof typeof TONOS];

function Stat({
  label,
  value,
  icon: Icon,
  tono,
  hint,
  danger,
  accion,
  children,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tono: Tono;
  hint?: string;
  danger?: boolean;
  /** Botón junto al monto (p. ej. editar el saldo). */
  accion?: React.ReactNode;
  children?: React.ReactNode;
}) {
  async function copiar() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`, { description: value });
    } catch (e) {
      reportError(e, "No se pudo copiar");
    }
  }
  return (
    <Card className="group/stat relative gap-2 py-4 pl-1.5 transition-colors hover:bg-fila-hover">
      {/* Toda la tarjeta copia el valor; la acción (lápiz) queda por encima. */}
      <button
        type="button"
        onClick={() => void copiar()}
        aria-label={`Copiar ${label}: ${value}`}
        title="Clic para copiar"
        className="absolute inset-0 cursor-copy rounded-[inherit]"
      />
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-1.5", tono.lengueta)} />
      <CardHeader className="pointer-events-none px-4">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="flex items-center gap-1.5">
            {label}
            <Copy aria-hidden className="size-3 opacity-0 transition-opacity group-hover/stat:opacity-70" />
          </CardDescription>
          <span className={cn("flex size-7 items-center justify-center rounded-md", tono.icono)}>
            <Icon className="size-4" />
          </span>
        </div>
        <div className="flex items-center gap-1">
          <CardTitle className={cn("text-2xl tabular-nums", danger && "text-destructive")}>{value}</CardTitle>
          {accion && <span className="pointer-events-auto relative">{accion}</span>}
        </div>
      </CardHeader>
      {hint && <CardContent className="pointer-events-none px-4 text-xs text-destructive">{hint}</CardContent>}
      {children && <CardContent className="pointer-events-none px-4">{children}</CardContent>}
    </Card>
  );
}

/** Editar el saldo asignado desde su tarjeta; `motivo` lo deshabilita (p. ej. la campaña cerrada). */
export type EditarAsignado = { onClick: () => void; motivo?: string };

export function ResumenCards({
  resumen,
  etiquetaAsignado = "Saldo asignado",
  editarAsignado,
  sinAvance = false,
}: {
  resumen: Resumen;
  etiquetaAsignado?: string;
  editarAsignado?: EditarAsignado;
  /** Sin la tarjeta de Avance (la campaña lo muestra en grande, con sus metas). */
  sinAvance?: boolean;
}) {
  const pagoDeMas = new Decimal(resumen.restante).isNegative();
  const completo = resumen.pct >= 100;
  return (
    <div className={cn("grid gap-4", sinAvance ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4")}>
      <Stat
        label={etiquetaAsignado}
        value={formatUsd(resumen.asignado)}
        icon={Wallet}
        tono={TONOS.asignado}
        accion={
          editarAsignado && (
            <BotonConMotivo motivo={editarAsignado.motivo}>
              <Button
                size="icon-xs"
                variant="ghost"
                className="text-muted-foreground"
                aria-label="Editar el saldo asignado"
                title={editarAsignado.motivo ? undefined : "Editar el saldo asignado"}
                disabled={!!editarAsignado.motivo}
                onClick={editarAsignado.onClick}
              >
                <Pencil />
              </Button>
            </BotonConMotivo>
          )
        }
      />
      <Stat label="Pagado" value={formatUsd(resumen.pagado)} icon={CircleCheck} tono={TONOS.pagado} />
      <Stat
        label="Restante"
        value={formatUsd(resumen.restante)}
        icon={pagoDeMas ? CircleAlert : Hourglass}
        tono={pagoDeMas ? TONOS.peligro : TONOS.restante}
        danger={pagoDeMas}
        hint={pagoDeMas ? "Pagado de más" : undefined}
      />
      {!sinAvance && (
      <Stat label="Avance" value={formatPct(resumen.pct)} icon={TrendingUp} tono={completo ? TONOS.pagado : TONOS.avance}>
        <AvanceBar pct={resumen.pct} />
      </Stat>
      )}
    </div>
  );
}

/** Barra de avance: color del tema y verde al llegar al 100 %. Con `metas`, una marca fina por cada una (su color dice el estado). */
export function AvanceBar({ pct, metas }: { pct: number; metas?: MetaVista[] }) {
  const barra = <Progress value={pct} className={cn(pct >= 100 && "[&_[data-slot=progress-indicator]]:bg-emerald-500")} />;
  if (!metas?.length) return barra;
  return (
    <div className="relative w-full">
      {barra}
      {metas.map((m) => (
        <span
          key={m.id}
          role="img"
          aria-label={describirMeta(m)}
          title={describirMeta(m)}
          className={cn("absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2", ESTILO_META[m.estado].linea)}
          style={{ left: `${m.posicion}%` }}
        />
      ))}
    </div>
  );
}
