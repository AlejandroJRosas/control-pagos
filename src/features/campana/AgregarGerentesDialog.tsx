import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MontoInput } from "@/components/MontoInput";
import { getDb } from "@/db";
import { EtiquetaChip } from "@/components/EtiquetaChip";
import { listGerentesConCampanas } from "@/db/repos/gerentes";
import { listEtiquetas, type Etiqueta } from "@/db/repos/etiquetas";
import { claveComparacion } from "@/db/repos/depositos";
import { agregarGerentes } from "@/db/operaciones/agregarGerentes";
import { conEtiquetas } from "@/domain/etiquetas";
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
  const { data: gerentes } = useData(async (db) => (await listGerentesConCampanas(db)).filter((g) => g.activo), []);
  const { data: etiquetas } = useData((db) => listEtiquetas(db), []);
  const [filas, setFilas] = useState<Record<number, Fila>>({});
  const [buscar, setBuscar] = useState("");
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [saldoComun, setSaldoComun] = useState("");
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFilas({});
    setBuscar("");
    setElegidas([]);
    setSaldoComun("");
    setErrores({});
  }, [open]);

  const disponibles = (gerentes ?? []).filter((g) => !gerentesEnCampana.includes(g.id));
  const porId = new Map<number, Etiqueta>((etiquetas ?? []).map((e) => [e.id, e]));
  // Solo las etiquetas que tiene algún gerente disponible: las demás dejarían la lista vacía.
  const etiquetasUsadas = (etiquetas ?? []).filter((e) => disponibles.some((g) => g.etiquetas.includes(e.id)));
  const clave = claveComparacion(buscar);
  const coincide = (g: (typeof disponibles)[number]) =>
    !clave || claveComparacion(g.nombre).includes(clave) || g.etiquetas.some((id) => claveComparacion(porId.get(id)?.nombre ?? "").includes(clave));
  const visibles = disponibles.filter((g) => conEtiquetas(g.etiquetas, elegidas) && coincide(g));
  const filtrando = !!clave || elegidas.length > 0;
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
                <Input placeholder="Buscar gerente o etiqueta…" className="pl-8" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
              </div>

              {etiquetasUsadas.length > 0 && (
                <div role="group" aria-label="Filtrar por etiqueta" className="-mt-1 flex flex-wrap items-center gap-1.5">
                  {etiquetasUsadas.map((e) => (
                    <EtiquetaChip
                      key={e.id}
                      nombre={e.nombre}
                      color={e.color}
                      activo={elegidas.includes(e.id)}
                      onClick={() => setElegidas((l) => (l.includes(e.id) ? l.filter((x) => x !== e.id) : [...l, e.id]))}
                    />
                  ))}
                  {elegidas.length > 0 && (
                    <Button type="button" variant="link" size="sm" className="h-6 px-1 text-xs" onClick={() => setElegidas([])}>
                      Quitar filtro
                    </Button>
                  )}
                </div>
              )}

              <div className="max-h-80 overflow-y-auto rounded-lg border">
                <label className="sticky top-0 z-10 flex items-center gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={todosVisiblesMarcados}
                    disabled={visibles.length === 0}
                    onChange={(e) => marcarVisibles(e.target.checked)}
                  />
                  {filtrando ? "Marcar los encontrados" : "Marcar todos"}
                  <span className="ml-auto">Saldo (USD)</span>
                </label>
                {visibles.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Ningún gerente coincide con la búsqueda o las etiquetas.</p>}
                {visibles.map((g) => {
                  const f = fila(g.id);
                  return (
                    <div key={g.id} className="flex items-center gap-3 border-b px-3 py-1.5 last:border-b-0">
                      <label className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                        <input type="checkbox" aria-label={g.nombre} checked={f.marcado} onChange={(e) => cambiar(g.id, { marcado: e.target.checked })} />
                        <span className="truncate">{g.nombre}</span>
                        {g.etiquetas.map((id) => {
                          const e = porId.get(id);
                          return e && <EtiquetaChip key={id} nombre={e.nombre} color={e.color} className="h-5 px-2" />;
                        })}
                      </label>
                      <div className="w-36">
                        <MontoInput
                          aria-label={`Saldo de ${g.nombre}`}
                          aria-invalid={!!errores[g.id]}
                          placeholder="0,00"
                          className="h-7 text-right tabular-nums"
                          value={f.saldo}
                          onChange={(v) => cambiar(g.id, { saldo: v, marcado: f.marcado || v.trim() !== "" })}
                        />
                        {errores[g.id] && <p className="mt-0.5 text-xs text-destructive">{errores[g.id]}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Mismo saldo para los marcados:</span>
                <MontoInput
                  aria-label="Saldo para los marcados"
                  placeholder="Ej. 1.500,00"
                  className="w-36 text-right tabular-nums"
                  value={saldoComun}
                  onChange={setSaldoComun}
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
