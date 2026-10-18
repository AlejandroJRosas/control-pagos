import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EstadoCampana } from "@/db/repos/campanas";

export function EstadoBadge({ estado }: { estado: EstadoCampana }) {
  return estado === "activa" ? (
    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Activa
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-muted-foreground">
      <Lock />
      Cerrada
    </Badge>
  );
}
