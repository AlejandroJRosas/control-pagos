import { useMemo } from "react";
import { Link } from "react-router";
import { Images, Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { FechaInput } from "@/components/FechaInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { DepositosTable } from "@/components/DepositosTable";
import { Vacio } from "@/components/Feedback";
import { filtrarDepositos, type CampanaView } from "@/domain/campanaView";
import { useFiltrosUrl } from "@/lib/filtrosUrl";

const FILTROS = ["q", "banco", "desde", "hasta"] as const;

type Props = { campanaId: number; campanaNombre: string; view: CampanaView; cerrada: boolean };

export function TodosDepositosTab({ campanaId, campanaNombre, view, cerrada }: Props) {
  const { valores: f, set, limpiar, activos } = useFiltrosUrl(`campana-${campanaId}`, FILTROS);
  const bancos = useMemo(
    () => Array.from(new Set(view.depositos.map((d) => d.banco.trim()))).sort((a, b) => a.localeCompare(b, "es")),
    [view],
  );
  const opcionesBanco = useMemo(() => [{ value: "", label: "Todos" }, ...bancos.map((b) => ({ value: b, label: b }))], [bancos]);
  const r = useMemo(
    () =>
      filtrarDepositos(view.depositos, {
        banco: f.banco || null,
        desde: f.desde || null,
        hasta: f.hasta || null,
        texto: f.q || null,
      }),
    [view, f.banco, f.desde, f.hasta, f.q],
  );

  const vacio =
    view.depositos.length > 0 ? (
      <Vacio texto="Ningún depósito coincide con la búsqueda o los filtros.">
        <Button variant="outline" onClick={limpiar}>
          Limpiar filtros
        </Button>
      </Vacio>
    ) : (
      <Vacio texto={cerrada ? "La campaña no tiene depósitos." : "Todavía no hay depósitos en esta campaña."}>
        {!cerrada && (
          <>
            <Link to={`/campanas/${campanaId}/depositos/nuevo`} className={buttonVariants()}>
              <Plus />
              Registrar depósito
            </Link>
            <Link to={`/campanas/${campanaId}/lote`} className={buttonVariants({ variant: "outline" })}>
              <Images />
              Subir lote de comprobantes
            </Link>
          </>
        )}
      </Vacio>
    );

  return (
    <div className="space-y-4">
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
      <DepositosTable
        filas={r.filas}
        mostrarGerente
        saldoLabel="Saldo general restante"
        totales={r}
        soloLectura={cerrada}
        vacio={vacio}
        volverLabel={campanaNombre}
      />
    </div>
  );
}
