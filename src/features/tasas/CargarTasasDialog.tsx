import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Aviso, Spinner } from "@/components/Feedback";
import { FechaInput } from "@/components/FechaInput";
import { getDb } from "@/db";
import { listTasas } from "@/db/repos/tasas";
import { feriadosSet } from "@/db/repos/feriados";
import { deshacerTasasLote, guardarTasasLote, type TasasGuardadas } from "@/db/operaciones/tasasLote";
import { formatFecha, isValidIsoDate, nombreDia, todayIso } from "@/domain/dates";
import { formatTasa, toInputVE } from "@/domain/money";
import { diasSinTasa, planTasasLote, type TasaExistente } from "@/domain/tasasLote";
import { invalidate, useData } from "@/hooks/useData";
import { useDialogoSinGuardar } from "@/hooks/useAvisoSinGuardar";
import { reportError } from "@/lib/reportError";
import { cn } from "@/lib/utils";

/** `fija` = día propuesto (sin tasa); las agregadas a mano llevan su campo de fecha. */
type Fila = { key: number; fecha: string; valor: string; fija: boolean };

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * Carga varias tasas a mano, sin captura: una fila por cada día hábil que falta (desde la última tasa hasta la que rige
 * hoy) y las fechas que se agreguen. Una fecha que ya tiene tasa se muestra con su valor y se puede corregir.
 */
export function CargarTasasDialog({ open, onOpenChange }: Props) {
  const { data } = useData(
    async (db) => {
      if (!open) return null;
      const tasas = await listTasas(db);
      const existentes = new Map<string, TasaExistente>(tasas.map((t) => [t.fecha, { id: t.id, valor: t.valor, usos: t.usos }]));
      return { existentes, feriados: await feriadosSet(db), ultima: tasas[0]?.fecha ?? null };
    },
    [open],
  );
  const [filas, setFilas] = useState<Fila[]>([]);
  const [saving, setSaving] = useState(false);
  const siguiente = useRef(0);
  const iniciado = useRef(false);

  // Las filas se arman una vez por apertura (otra escritura que recargue los datos no borra lo escrito).
  useEffect(() => {
    if (!open) {
      iniciado.current = false;
      return;
    }
    if (!data || iniciado.current) return;
    iniciado.current = true;
    const dias = diasSinTasa(todayIso(), data.ultima, new Set(data.existentes.keys()), data.feriados);
    setFilas(dias.map((fecha) => ({ key: siguiente.current++, fecha, valor: "", fija: true })));
  }, [open, data]);

  const plan = useMemo(() => (data ? planTasasLote(filas, data.existentes, data.feriados) : null), [filas, data]);
  const cambios = plan?.cambios.length ?? 0;
  const conErrores = !!plan?.errores.some(Boolean);
  const aviso = useDialogoSinGuardar(open && cambios > 0, onOpenChange);

  function cambiar(key: number, c: Partial<Fila>) {
    setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...c } : f)));
  }

  function cambiarFecha(f: Fila, fecha: string) {
    // Una fecha que ya tiene tasa trae su valor, para corregirlo.
    const actual = data?.existentes.get(fecha);
    cambiar(f.key, { fecha, valor: actual && !f.valor.trim() ? toInputVE(actual.valor) : f.valor });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!plan || cambios === 0 || conErrores) return;
    setSaving(true);
    try {
      const hecho = await guardarTasasLote(await getDb(), plan.cambios);
      avisarTasasGuardadas(hecho);
      invalidate();
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  }

  let agregada = 0;
  return (
    <Dialog open={open} onOpenChange={aviso.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Cargar varias tasas</DialogTitle>
            <DialogDescription>Sin captura. Los días hábiles que faltan hasta hoy ya están en la lista; las filas vacías no se guardan.</DialogDescription>
          </DialogHeader>
          {!data ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" />Cargando…</p>
          ) : (
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
              {filas.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground">No falta ninguna tasa hasta hoy. Agrega otra fecha para cargarla o corregirla.</p>
              )}
              {filas.map((f, i) => {
                const n = f.fija ? 0 : ++agregada;
                const valida = isValidIsoDate(f.fecha);
                const actual = valida ? data.existentes.get(f.fecha) : undefined;
                const error = plan?.errores[i];
                const cambio = plan?.cambios.find((c) => c.fecha === f.fecha);
                return (
                  <div key={f.key} className="grid grid-cols-[10rem_8rem_minmax(0,1fr)_auto] items-center gap-2">
                    {f.fija ? (
                      <span className="text-sm tabular-nums">
                        <span className="text-muted-foreground capitalize">{nombreDia(f.fecha).slice(0, 3)}</span> {formatFecha(f.fecha)}
                      </span>
                    ) : (
                      <FechaInput aria-label={`Fecha de la fila ${n}`} value={f.fecha} onChange={(v) => cambiarFecha(f, v)} />
                    )}
                    <Input
                      aria-label={valida ? `Tasa del ${formatFecha(f.fecha)}` : `Tasa de la fila ${n}`}
                      inputMode="decimal"
                      placeholder="Bs por USD"
                      className={cn("text-right tabular-nums", error && "border-destructive")}
                      value={f.valor}
                      onChange={(e) => cambiar(f.key, { valor: e.target.value })}
                    />
                    <span className={cn("text-xs", error ? "text-destructive" : cambio?.tipo === "corregir" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                      {error ??
                        (cambio?.tipo === "corregir"
                          ? `Corrige: antes ${formatTasa(cambio.antes)}${cambio.usos ? ` · ${cambio.usos} depósito(s)` : ""}`
                          : actual
                            ? "Ya registrada"
                            : "")}
                    </span>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="text-muted-foreground"
                      aria-label={valida ? `Quitar la fila del ${formatFecha(f.fecha)}` : `Quitar la fila ${n}`}
                      title="Quitar de la lista"
                      onClick={() => setFilas((fs) => fs.filter((x) => x.key !== f.key))}
                    >
                      <X />
                    </Button>
                  </div>
                );
              })}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFilas((fs) => [...fs, { key: siguiente.current++, fecha: "", valor: "", fija: false }])}
                >
                  <Plus />
                  Agregar fecha
                </Button>
              </div>
            </div>
          )}
          {!!plan?.afectados && (
            <Aviso tono="warning">Las tasas corregidas cambian el USD de {plan.afectados} depósito(s) ya registrados.</Aviso>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => aviso.onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || cambios === 0 || conErrores}>
              {saving ? "Guardando…" : cambios === 0 ? "Guardar" : cambios === 1 ? "Guardar 1 tasa" : `Guardar ${cambios} tasas`}
            </Button>
          </DialogFooter>
        </form>
        {aviso.dialogo}
      </DialogContent>
    </Dialog>
  );
}

/** Aviso con "Deshacer": borra las tasas creadas y repone el valor de las corregidas. */
function avisarTasasGuardadas(h: TasasGuardadas): void {
  const n = h.creadas.length + h.corregidas.length;
  toast.success(n === 1 ? "1 tasa guardada" : `${n} tasas guardadas`, {
    duration: 10_000,
    action: {
      label: "Deshacer",
      onClick: async () => {
        try {
          await deshacerTasasLote(await getDb(), h);
          toast.success("Tasas deshechas");
          invalidate();
        } catch (err) {
          reportError(err, "Deshacer");
        }
      },
    },
  });
}
