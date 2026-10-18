import { Badge } from "@/components/ui/badge";
import type { EstadoCampana } from "@/db/repos/campanas";

export function EstadoBadge({ estado }: { estado: EstadoCampana }) {
  return estado === "activa" ? <Badge>Activa</Badge> : <Badge variant="secondary">Cerrada</Badge>;
}
