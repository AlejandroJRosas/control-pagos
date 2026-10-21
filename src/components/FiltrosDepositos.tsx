import { useMemo } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { FechaInput } from "@/components/FechaInput";
import { filtrarDepositos, type DepositoCalculado } from "@/domain/campanaView";
import { useFiltrosUrl } from "@/lib/filtrosUrl";

const FILTROS = ["q", "banco", "desde", "hasta"] as const;

/**
 * Búsqueda y filtros de una tabla de depósitos, en la URL y recordados por `clave`. Con `gerenteId` quedan solo los suyos
 * (y el saldo mostrado es el del gerente).
 */
export function useFiltrosDepositos(clave: string, depositos: DepositoCalculado[], gerenteId?: number) {
  const filtros = useFiltrosUrl(clave, FILTROS);
  const f = filtros.valores;
  const propios = useMemo(() => (gerenteId == null ? depositos : depositos.filter((d) => d.gerenteId === gerenteId)), [depositos, gerenteId]);
  const opcionesBanco = useMemo(() => {
    const bancos = Array.from(new Set(propios.map((d) => d.banco.trim()))).sort((a, b) => a.localeCompare(b, "es"));
    return [{ value: "", label: "Todos" }, ...bancos.map((b) => ({ value: b, label: b }))];
  }, [propios]);
  const r = useMemo(
    () => filtrarDepositos(depositos, { gerenteId, banco: f.banco || null, desde: f.desde || null, hasta: f.hasta || null, texto: f.q || null }),
    [depositos, gerenteId, f.banco, f.desde, f.hasta, f.q],
  );
  return { ...filtros, r, opcionesBanco, hayDepositos: propios.length > 0 };
}

type Props = { filtros: ReturnType<typeof useFiltrosDepositos> };

/** Barra de búsqueda, banco y fechas sobre una tabla de depósitos. */
export function FiltrosDepositos({ filtros }: Props) {
  const { valores: f, set, limpiar, activos, opcionesBanco } = filtros;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-72 gap-1.5">
        <Label htmlFor="f-q">Buscar</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="f-q"
            data-buscar-tabla
            type="search"
            className="pl-8"
            placeholder="Referencia, monto, banco…"
            value={f.q}
            onChange={(e) => set({ q: e.target.value })}
          />
        </div>
      </div>
      <div className="grid w-44 gap-1.5">
        <Label htmlFor="f-banco">Banco</Label>
        <BuscadorSelect id="f-banco" value={f.banco} onChange={(banco) => set({ banco })} opciones={opcionesBanco} placeholder="Todos" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-desde">Desde</Label>
        <FechaInput id="f-desde" contenedorClassName="w-36" value={f.desde} onChange={(desde) => set({ desde })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-hasta">Hasta</Label>
        <FechaInput id="f-hasta" contenedorClassName="w-36" value={f.hasta} onChange={(hasta) => set({ hasta })} />
      </div>
      <Button variant="ghost" disabled={!activos} onClick={limpiar}>
        Limpiar
      </Button>
    </div>
  );
}
