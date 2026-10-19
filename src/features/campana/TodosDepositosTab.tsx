import { useMemo } from "react";
import { Link } from "react-router";
import { Images, Plus, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/NativeSelect";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { DepositosTable } from "@/components/DepositosTable";
import { Vacio } from "@/components/Feedback";
import { filtrarDepositos, type CampanaView } from "@/domain/campanaView";
import { useFiltrosUrl } from "@/lib/filtrosUrl";

const FILTROS = ["q", "gerente", "banco", "desde", "hasta"] as const;

export function TodosDepositosTab({ campanaId, view, cerrada }: { campanaId: number; view: CampanaView; cerrada: boolean }) {
  const { valores: f, set, limpiar, activos } = useFiltrosUrl(`campana-${campanaId}`, FILTROS);
  const bancos = useMemo(
    () => Array.from(new Set(view.depositos.map((d) => d.banco.trim()))).sort((a, b) => a.localeCompare(b, "es")),
    [view],
  );
  const gerentes = useMemo(
    () => [{ value: "", label: "Todos" }, ...view.gerentes.map((g) => ({ value: String(g.gerenteId), label: g.gerenteNombre }))],
    [view],
  );
  const r = useMemo(
    () =>
      filtrarDepositos(view.depositos, {
        gerenteId: f.gerente ? Number(f.gerente) : null,
        banco: f.banco || null,
        desde: f.desde || null,
        hasta: f.hasta || null,
        texto: f.q || null,
      }),
    [view, f.gerente, f.banco, f.desde, f.hasta, f.q],
  );
  const porGerente = f.gerente !== "";

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
        <div className="grid w-52 gap-1.5">
          <Label htmlFor="f-gerente">Gerente</Label>
          <BuscadorSelect id="f-gerente" value={f.gerente} onChange={(gerente) => set({ gerente })} opciones={gerentes} placeholder="Todos" />
        </div>
        <div className="grid w-44 gap-1.5">
          <Label htmlFor="f-banco">Banco</Label>
          <NativeSelect id="f-banco" value={f.banco} onChange={(e) => set({ banco: e.target.value })}>
            <option value="">Todos</option>
            {bancos.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-desde">Desde</Label>
          <Input id="f-desde" type="date" value={f.desde} onChange={(e) => set({ desde: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-hasta">Hasta</Label>
          <Input id="f-hasta" type="date" value={f.hasta} onChange={(e) => set({ hasta: e.target.value })} />
        </div>
        <Button variant="ghost" disabled={!activos} onClick={limpiar}>
          Limpiar
        </Button>
      </div>
      <DepositosTable
        filas={r.filas}
        mostrarGerente
        saldoLabel={porGerente ? "Saldo del gerente" : "Saldo general restante"}
        totales={r}
        soloLectura={cerrada}
        vacio={vacio}
      />
    </div>
  );
}
