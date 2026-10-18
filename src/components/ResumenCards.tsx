import Decimal from "decimal.js";
import type { Resumen } from "@/domain/campanaView";
import { formatPct, formatUsd } from "@/domain/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

function Stat({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", danger && "text-destructive")}>{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="px-4 text-xs text-destructive">{hint}</CardContent>}
    </Card>
  );
}

export function ResumenCards({ resumen, etiquetaAsignado = "Saldo asignado" }: { resumen: Resumen; etiquetaAsignado?: string }) {
  const pagoDeMas = new Decimal(resumen.restante).isNegative();
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label={etiquetaAsignado} value={formatUsd(resumen.asignado)} />
      <Stat label="Pagado" value={formatUsd(resumen.pagado)} />
      <Stat label="Restante" value={formatUsd(resumen.restante)} danger={pagoDeMas} hint={pagoDeMas ? "Pagado de más" : undefined} />
      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardDescription>Avance</CardDescription>
          <CardTitle className="text-2xl tabular-nums">{formatPct(resumen.pct)}</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <Progress value={resumen.pct} />
        </CardContent>
      </Card>
    </div>
  );
}
