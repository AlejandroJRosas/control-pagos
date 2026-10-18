import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db";
import { listGerentes } from "@/db/repos/gerentes";
import { claveComparacion } from "@/db/repos/depositos";
import { agregarGerentes } from "@/db/operaciones/agregarGerentes";
import { validateSaldo } from "@/domain/validation";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = {
  campanaId: number;
  gerentesEnCampana: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Saldo escrito por gerente; la fila cuenta como elegida si está marcada. */
type Fila = { marcado: boolean; saldo: string };

export function AgregarGerentesDialog({ campanaId, gerentesEnCampana, open, onOpenChange }: Props) {
  const { data: gerentes } = useData((db) => listGerentes(db, { soloActivos: true }), []);
  const [filas, setFilas] = useState<Record<number, Fila>>({});
  const [buscar, setBuscar] = useState("");
  const [saldoComun, setSaldoComun] = useState("");
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFilas({});
    setBuscar("");
    setSaldoComun("");
    setErrores({});
  }, [open]);

  const disponibles = (gerentes ?? []).filter((g) => !gerentesEnCampana.includes(g.id));
  const clave = claveComparacion(buscar);
  const visibles = clave ? disponibles.filter((g) => claveComparacion(g.nombre).includes(clave)) : disponibles;
  const fila = (id: number): Fila => filas[id] ?? { marcado: false, saldo: "" };
  const elegidos = disponibles.filter((g) => fila(g.id).marcado);
  const todosVisiblesMarcados = visibles.length > 0 && visibles.every((g) => fila(g.id).marcado);

  function cambiar(id: number, cambio: Partial<Fila>) {
    setFilas((f) => ({ ...f, [id]: { ...(f[id] ?? { marcado: false, saldo: "" }), ...cambio } }));
    setErrores(({ [id]: _, ...resto }) => resto);
  }

  function marcarVisibles(marcado: boolean) {
    setFilas((f) => {
      const n = { ...f };
      for (const g of visibles) n[g.id] = { ...(n[g.id] ?? { marcado: false, saldo: "" }), marcado };
      return n;
    });
  }

  function aplicarSaldoComun() {
    setFilas((f) => {
      const n = { ...f };
      for (const g of elegidos) n[g.id] = { ...n[g.id], saldo: saldoComun };
      return n;
    });
    setErrores({});
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<number, string> = {};
    const items = elegidos.map((g) => {
      const r = validateSaldo(fila(g.id).saldo);
      if (!r.ok) errs[g.id] = r.errors.saldoUsd ?? "Saldo inválido";
      return { gerenteId: g.id, saldoUsd: r.ok ? r.value : "" };
    });
    if (Object.keys(errs).length) return setErrores(errs);
    setSaving(true);
    try {
      await agregarGerentes(await getDb(), campanaId, items);
      toast.success(items.length === 1 ? "Gerente agregado a la campaña" : `${items.length} gerentes agregados a la campaña`);
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Agregar gerentes a la campaña</DialogTitle>
            <DialogDescription>Marca los gerentes y escribe el saldo a pagar (USD) de cada uno.</DialogDescription>
          </DialogHeader>

          {disponibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {gerentes === undefined ? "Cargando…" : "No hay gerentes disponibles: todos están en la campaña o hay que crearlos en Gerentes."}
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Buscar gerente…" className="pl-8" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
              </div>

              <div className="max-h-80 overflow-y-auto rounded-lg border">
                <label className="sticky top-0 z-10 flex items-center gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={todosVisiblesMarcados}
                    disabled={visibles.length === 0}
                    onChange={(e) => marcarVisibles(e.target.checked)}
                  />
                  {clave ? "Marcar los encontrados" : "Marcar todos"}
                  <span className="ml-auto">Saldo (USD)</span>
                </label>
                {visibles.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Ningún gerente coincide con la búsqueda.</p>}
                {visibles.map((g) => {
                  const f = fila(g.id);
                  return (
                    <div key={g.id} className="flex items-center gap-3 border-b px-3 py-1.5 last:border-b-0">
                      <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                        <input type="checkbox" checked={f.marcado} onChange={(e) => cambiar(g.id, { marcado: e.target.checked })} />
                        <span className="truncate">{g.nombre}</span>
                      </label>
                      <div className="w-36">
                        <Input
                          aria-label={`Saldo de ${g.nombre}`}
                          aria-invalid={!!errores[g.id]}
                          inputMode="decimal"
                          placeholder="0,00"
                          className="h-7 text-right tabular-nums"
                          value={f.saldo}
                          onChange={(e) => cambiar(g.id, { saldo: e.target.value, marcado: f.marcado || e.target.value.trim() !== "" })}
                        />
                        {errores[g.id] && <p className="mt-0.5 text-xs text-destructive">{errores[g.id]}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Mismo saldo para los marcados:</span>
                <Input
                  aria-label="Saldo para los marcados"
                  inputMode="decimal"
                  placeholder="Ej. 1.500,00"
                  className="w-36 text-right tabular-nums"
                  value={saldoComun}
                  onChange={(e) => setSaldoComun(e.target.value)}
                />
                <Button type="button" variant="outline" disabled={elegidos.length === 0 || !saldoComun.trim()} onClick={aplicarSaldoComun}>
                  Aplicar
                </Button>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || elegidos.length === 0}>
              {elegidos.length > 1 ? `Agregar ${elegidos.length} gerentes` : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
