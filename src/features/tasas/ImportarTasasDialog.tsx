import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Aviso, Spinner } from "@/components/Feedback";
import { Casilla } from "@/components/Casilla";
import { getDb } from "@/db";
import { listTasas } from "@/db/repos/tasas";
import { feriadosSet } from "@/db/repos/feriados";
import { deshacerImportarTasas, importarTasas, type TasasImportadas } from "@/db/operaciones/importarTasas";
import { cambiosImportarTasas, planImportarTasas, type ArchivoTasas, type TasaExistenteImportar } from "@/domain/archivoTasas";
import { formatFecha } from "@/domain/dates";
import { formatTasa } from "@/domain/money";
import { importarImagenRecibida } from "@/platform/paquete";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

type Props = { abierto: { carpeta: string; archivo: ArchivoTasas } | null; onClose: () => void };

/**
 * Importar un archivo de tasas: las nuevas entran, a las que no tienen captura se les pone la del archivo y las que tienen
 * otro valor se reemplazan solo si se marcan (cambian el USD de sus depósitos).
 */
export function ImportarTasasDialog({ abierto, onClose }: Props) {
  const { data } = useData(
    async (db) => {
      const tasas = await listTasas(db);
      const existentes = new Map<string, TasaExistenteImportar>(
        tasas.map((t) => [t.fecha, { id: t.id, valor: t.valor, notas: t.notas, imagenPath: t.imagenPath, usos: t.usos }]),
      );
      return { existentes, feriados: await feriadosSet(db) };
    },
    [abierto?.carpeta],
  );
  const plan = useMemo(() => (abierto && data ? planImportarTasas(abierto.archivo, data.existentes, data.feriados) : null), [abierto, data]);
  const [reemplazar, setReemplazar] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const cuenta = (tipo: string) => plan?.filter((f) => f.tipo === tipo).length ?? 0;
  const distintas = plan?.flatMap((f) => (f.tipo === "distinta" ? [f] : [])) ?? [];
  const invalidas = plan?.flatMap((f) => (f.tipo === "invalida" ? [f] : [])) ?? [];
  const cambios = plan ? cambiosImportarTasas(plan, reemplazar) : [];
  const afectados = distintas.filter((f) => reemplazar.has(f.fecha)).reduce((n, f) => n + f.actual.usos, 0);

  function alternar(fecha: string, si: boolean) {
    setReemplazar((r) => {
      const n = new Set(r);
      if (si) n.add(fecha);
      else n.delete(fecha);
      return n;
    });
  }

  function cerrar() {
    setReemplazar(new Set());
    onClose();
  }

  async function importar() {
    if (!abierto || cambios.length === 0) return;
    setSaving(true);
    try {
      const imagenes = new Map<string, string>();
      for (const c of cambios) {
        if (!c.imagen || imagenes.has(c.imagen)) continue;
        const ruta = await importarImagenRecibida(abierto.carpeta, c.imagen);
        if (ruta) imagenes.set(c.imagen, ruta);
      }
      const hecho = await importarTasas(await getDb(), cambios, imagenes);
      avisarImportadas(hecho);
      invalidate();
      cerrar();
    } catch (e) {
      reportError(e, "Importar tasas");
    } finally {
      setSaving(false);
    }
  }

  const resumen = [
    [cuenta("nueva"), "nueva(s)"],
    [cuenta("captura"), "ya registrada(s) sin captura: se les pone la del archivo"],
    [cuenta("igual"), "iguales (no cambian)"],
  ] as const;

  return (
    <Dialog open={abierto !== null} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar tasas</DialogTitle>
          <DialogDescription>{abierto ? `${abierto.archivo.tasas.length} tasa(s) en el archivo.` : ""}</DialogDescription>
        </DialogHeader>
        {!plan ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Cargando…
          </p>
        ) : (
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1 text-sm">
            <ul className="grid gap-1">
              {resumen.map(([n, texto]) => (n > 0 ? <li key={texto}>{n} {texto}</li> : null))}
            </ul>
            {distintas.length > 0 && (
              <section className="grid gap-2" aria-label="Tasas con otro valor">
                <label className="flex items-center gap-2 font-medium">
                  <Casilla
                    checked={reemplazar.size === distintas.length}
                    indeterminado={reemplazar.size > 0 && reemplazar.size < distintas.length}
                    onChange={(e) => setReemplazar(e.target.checked ? new Set(distintas.map((f) => f.fecha)) : new Set())}
                  />
                  {distintas.length} con otro valor: marca las que quieras reemplazar con la del archivo
                </label>
                <ul className="grid gap-1 pl-6">
                  {distintas.map((f) => (
                    <li key={f.fecha}>
                      <label className="flex items-center gap-2">
                        <Casilla
                          aria-label={`Reemplazar la tasa del ${formatFecha(f.fecha)}`}
                          checked={reemplazar.has(f.fecha)}
                          onChange={(e) => alternar(f.fecha, e.target.checked)}
                        />
                        <span className="tabular-nums">
                          {formatFecha(f.fecha)}: {formatTasa(f.actual.valor)} → {formatTasa(f.valor)}
                        </span>
                        {f.actual.usos > 0 && <span className="text-muted-foreground">· {f.actual.usos} depósito(s)</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {invalidas.length > 0 && (
              <section className="grid gap-1" aria-label="No se importan">
                <p className="font-medium">{invalidas.length} no se importan:</p>
                <ul className="grid gap-1 pl-6 text-muted-foreground">
                  {invalidas.map((f, i) => (
                    <li key={`${f.fecha}-${i}`}>
                      {formatFecha(f.fecha)} ({formatTasa(f.valor)}): {f.motivo}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {afectados > 0 && <Aviso tono="warning">Reemplazar las marcadas cambia el USD de {afectados} depósito(s) ya registrados.</Aviso>}
            {cambios.length === 0 && <Aviso>No hay nada que importar: ya tienes estas tasas.</Aviso>}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cerrar}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving || cambios.length === 0} onClick={() => void importar()}>
            {saving ? "Importando…" : cambios.length === 1 ? "Importar 1 tasa" : `Importar ${cambios.length} tasas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aviso con "Deshacer": borra las creadas y repone las actualizadas. */
function avisarImportadas(h: TasasImportadas): void {
  const n = h.creadas.length + h.actualizadas.length;
  toast.success(n === 1 ? "1 tasa importada" : `${n} tasas importadas`, {
    duration: 10_000,
    action: {
      label: "Deshacer",
      onClick: async () => {
        try {
          await deshacerImportarTasas(await getDb(), h);
          toast.success("Importación deshecha");
          invalidate();
        } catch (err) {
          reportError(err, "Deshacer");
        }
      },
    },
  });
}
