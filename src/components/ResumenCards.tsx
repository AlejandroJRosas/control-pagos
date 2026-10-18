import Decimal from "decimal.js";
import { CircleAlert, CircleCheck, Hourglass, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { Resumen } from "@/domain/campanaView";
import { formatPct, formatUsd } from "@/domain/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** Colores fijos por significado (no siguen el tema): saldo azul, pagado verde, restante ámbar, de más rojo.
    `icono` es el fondo del icono y `lengueta` la franja del borde izquierdo de la tarjeta. */
const TONOS = {
  asignado: { icono: "bg-sky-100 text-sky-700", lengueta: "bg-sky-500" },
  pagado: { icono: "bg-emerald-100 text-emerald-700", lengueta: "bg-emerald-500" },
  restante: { icono: "bg-amber-100 text-amber-700", lengueta: "bg-amber-500" },
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
  children,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tono: Tono;
  hint?: string;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card className="relative gap-2 py-4 pl-1.5">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", tono.lengueta)} />
      <CardHeader className="px-4">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          <span className={cn("flex size-7 items-center justify-center rounded-md", tono.icono)}>
            <Icon className="size-4" />
          </span>
        </div>
        <CardTitle className={cn("text-2xl tabular-nums", danger && "text-destructive")}>{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="px-4 text-xs text-destructive">{hint}</CardContent>}
      {children && <CardContent className="px-4">{children}</CardContent>}
    </Card>
  );
}

export function ResumenCards({ resumen, etiquetaAsignado = "Saldo asignado" }: { resumen: Resumen; etiquetaAsignado?: string }) {
  const pagoDeMas = new Decimal(resumen.restante).isNegative();
  const completo = resumen.pct >= 100;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label={etiquetaAsignado} value={formatUsd(resumen.asignado)} icon={Wallet} tono={TONOS.asignado} />
      <Stat label="Pagado" value={formatUsd(resumen.pagado)} icon={CircleCheck} tono={TONOS.pagado} />
      <Stat
        label="Restante"
        value={formatUsd(resumen.restante)}
        icon={pagoDeMas ? CircleAlert : Hourglass}
        tono={pagoDeMas ? TONOS.peligro : TONOS.restante}
        danger={pagoDeMas}
        hint={pagoDeMas ? "Pagado de más" : undefined}
      />
      <Stat label="Avance" value={formatPct(resumen.pct)} icon={TrendingUp} tono={completo ? TONOS.pagado : TONOS.avance}>
        <AvanceBar pct={resumen.pct} />
      </Stat>
    </div>
  );
}

/** Barra de avance: color del tema y verde al llegar al 100 %. */
export function AvanceBar({ pct }: { pct: number }) {
  return <Progress value={pct} className={cn(pct >= 100 && "[&_[data-slot=progress-indicator]]:bg-emerald-500")} />;
}
