import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/NativeSelect";
import { DepositosTable } from "@/components/DepositosTable";
import { filtrarDepositos, type CampanaView } from "@/domain/campanaView";

type Filtro = { gerenteId: string; banco: string; desde: string; hasta: string };
const VACIO: Filtro = { gerenteId: "", banco: "", desde: "", hasta: "" };
/** Filtros por campaña durante la sesión, para no perderlos al abrir un depósito y volver. */
const recordados = new Map<number, Filtro>();

export function TodosDepositosTab({ campanaId, view }: { campanaId: number; view: CampanaView }) {
  const [f, setFiltro] = useState<Filtro>(() => recordados.get(campanaId) ?? VACIO);
  const setF = (next: Filtro) => {
    recordados.set(campanaId, next);
    setFiltro(next);
  };
  const bancos = useMemo(
    () => Array.from(new Set(view.depositos.map((d) => d.banco.trim()))).sort((a, b) => a.localeCompare(b, "es")),
    [view],
  );
  const r = useMemo(
    () =>
      filtrarDepositos(view.depositos, {
        gerenteId: f.gerenteId ? Number(f.gerenteId) : null,
        banco: f.banco || null,
        desde: f.desde || null,
        hasta: f.hasta || null,
      }),
    [view, f],
  );
  const porGerente = f.gerenteId !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid w-52 gap-1.5">
          <Label htmlFor="f-gerente">Gerente</Label>
          <NativeSelect id="f-gerente" value={f.gerenteId} onChange={(e) => setF({ ...f, gerenteId: e.target.value })}>
            <option value="">Todos</option>
            {view.gerentes.map((g) => (
              <option key={g.gerenteId} value={g.gerenteId}>
                {g.gerenteNombre}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid w-44 gap-1.5">
          <Label htmlFor="f-banco">Banco</Label>
          <NativeSelect id="f-banco" value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })}>
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
          <Input id="f-desde" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-hasta">Hasta</Label>
          <Input id="f-hasta" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
        </div>
        <Button variant="ghost" onClick={() => setF(VACIO)}>
          Limpiar
        </Button>
      </div>
      <DepositosTable filas={r.filas} mostrarGerente saldoLabel={porGerente ? "Saldo del gerente" : "Saldo general restante"} totales={r} />
    </div>
  );
}
