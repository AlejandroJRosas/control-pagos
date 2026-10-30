import { useMemo } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { FechaInput } from "@/components/FechaInput";
import { filtrarDepositos, type DepositoCalculado } from "@/domain/campanaView";
import { useFiltrosUrl } from "@/lib/filtrosUrl";

const FILTROS = ["q", "banco", "cuenta", "desde", "hasta"] as const;

/**
 * Búsqueda y filtros de una tabla de depósitos, en la URL y recordados por `clave`. Con `gerenteId` quedan solo los suyos
 * (y el saldo mostrado es el del gerente).
 */
export function useFiltrosDepositos(clave: string, depositos: DepositoCalculado[], gerenteId?: number) {
  const filtros = useFiltrosUrl(clave, FILTROS);
  const f = filtros.valores;
  const propios = useMemo(() => (gerenteId == null ? depositos : depositos.filter((d) => d.gerenteId === gerenteId)), [depositos, gerenteId]);
  const opciones = (valores: string[], todas: string) => {
    const unicos = Array.from(new Set(valores.map((v) => v.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
    return [{ value: "", label: todas }, ...unicos.map((v) => ({ value: v, label: v }))];
  };
  const opcionesBanco = useMemo(() => opciones(propios.map((d) => d.banco), "Todos"), [propios]);
  const opcionesCuenta = useMemo(() => opciones(propios.map((d) => d.cuentaDestino), "Todas"), [propios]);
  const r = useMemo(
    () =>
      filtrarDepositos(depositos, {
        gerenteId,
        banco: f.banco || null,
        cuenta: f.cuenta || null,
        desde: f.desde || null,
        hasta: f.hasta || null,
        texto: f.q || null,
      }),
    [depositos, gerenteId, f.banco, f.cuenta, f.desde, f.hasta, f.q],
  );
  return { ...filtros, r, opcionesBanco, opcionesCuenta, hayDepositos: propios.length > 0 };
}

type Props = { filtros: ReturnType<typeof useFiltrosDepositos> };

/** Barra de búsqueda, banco, cuenta destino y fechas sobre una tabla de depósitos. */
export function FiltrosDepositos({ filtros }: Props) {
  const { valores: f, set, limpiar, activos, opcionesBanco, opcionesCuenta } = filtros;
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
      <div className="grid w-52 gap-1.5">
        <Label htmlFor="f-cuenta">Cuenta destino</Label>
        <BuscadorSelect id="f-cuenta" value={f.cuenta} onChange={(cuenta) => set({ cuenta })} opciones={opcionesCuenta} placeholder="Todas" />
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
