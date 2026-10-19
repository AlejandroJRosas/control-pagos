import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FileSpreadsheet, Images, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { ComprobanteThumb } from "@/components/ComprobanteThumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { getDb } from "@/db";
import { deleteTasa, listTasas, type TasaConUsos } from "@/db/repos/tasas";
import { contarPendientesTasas } from "@/db/repos/cola";
import { formatFecha, todayIso } from "@/domain/dates";
import { formatTasa } from "@/domain/money";
import { buildTasasWorkbook } from "@/export/tasasWorkbook";
import { archivoExcel } from "@/export/fileName";
import { saveWorkbook } from "@/export/saveWorkbook";
import { invalidate, useData } from "@/hooks/useData";
import { useAtajo } from "@/hooks/useAtajo";
import { reportError } from "@/lib/reportError";
import { ordenar, type Columnas } from "@/lib/orden";
import { TasaFormDialog } from "./TasaFormDialog";
import { CalendarioTasas } from "./CalendarioTasas";

type Col = "fecha" | "valor" | "notas" | "usos";
const COLUMNAS: Columnas<TasaConUsos, Col> = {
  fecha: { tipo: "texto", valor: (t) => t.fecha },
  valor: { tipo: "decimal", valor: (t) => t.valor },
  notas: { tipo: "texto", valor: (t) => t.notas },
  usos: { tipo: "numero", valor: (t) => t.usos },
};

/** Pestaña vista durante la sesión. */
let vistaRecordada = "calendario";

export function TasasPage() {
  const { data, error } = useData((db) => listTasas(db), []);
  const { data: pendientes } = useData((db) => contarPendientesTasas(db), []);
  // fecha: tasa nueva de un día elegido en el calendario.
  const [dialog, setDialog] = useState<{ open: boolean; tasa: TasaConUsos | null; fecha?: string }>({ open: false, tasa: null });
  const [borrar, setBorrar] = useState<TasaConUsos | null>(null);
  const [vista, setVistaState] = useState(vistaRecordada);
  const setVista = (v: string) => {
    vistaRecordada = v;
    setVistaState(v);
  };
  useAtajo("n", () => setDialog({ open: true, tasa: null }));
  const { orden, alternar } = useOrden<Col>();
  const filas = useMemo(() => ordenar(data ?? [], COLUMNAS, orden), [data, orden]);

  async function exportar() {
    try {
      if (await saveWorkbook(buildTasasWorkbook(data ?? []), archivoExcel("tasas", todayIso()))) toast.success("Excel guardado");
    } catch (e) {
      reportError(e, "Exportar");
    }
  }

  async function eliminar(t: TasaConUsos) {
    try {
      await deleteTasa(await getDb(), t.id);
      toast.success("Tasa eliminada");
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setBorrar(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasas"
        subtitle="Histórico de la tasa del día (Bs por USD)"
        actions={
          <>
            <Button variant="outline" onClick={exportar} disabled={!data?.length}>
              <FileSpreadsheet />
              Exportar a Excel
            </Button>
            {!!pendientes && (
              <Link to="/tasas/revision" className={buttonVariants({ variant: "outline" })}>
                <ListChecks />
                Revisar ({pendientes})
              </Link>
            )}
            <Link to="/tasas/lote" className={buttonVariants({ variant: "outline" })}>
              <Images />
              Subir lote
            </Link>
            <Button title="N" onClick={() => setDialog({ open: true, tasa: null })}>
              <Plus />
              Nueva tasa
            </Button>
          </>
        }
      />
      {!data ? (
        <Cargando error={error} />
      ) : (
        <Tabs value={vista} onValueChange={(v) => setVista(String(v))}>
          <TabsList>
            <TabsTrigger value="calendario">Calendario</TabsTrigger>
            <TabsTrigger value="lista">Lista ({data.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="calendario">
            <CalendarioTasas
              tasas={data}
              onRegistrar={(fecha) => setDialog({ open: true, tasa: null, fecha })}
              onEditar={(tasa) => setDialog({ open: true, tasa })}
            />
          </TabsContent>
          <TabsContent value="lista">
            {data.length === 0 ? (
              <Vacio texto="Todavía no hay tasas registradas.">
                <Button onClick={() => setDialog({ open: true, tasa: null })}>
                  <Plus />
                  Nueva tasa
                </Button>
                <Link to="/tasas/lote" className={buttonVariants({ variant: "outline" })}>
                  <Images />
                  Subir lote
                </Link>
              </Vacio>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead col="fecha" orden={orden} onOrden={alternar}>
                      Fecha
                    </SortableHead>
                    <SortableHead col="valor" orden={orden} onOrden={alternar} className="text-right">
                      Bs por USD
                    </SortableHead>
                    <TableHead>Captura</TableHead>
                    <SortableHead col="notas" orden={orden} onOrden={alternar}>
                      Notas
                    </SortableHead>
                    <SortableHead col="usos" orden={orden} onOrden={alternar} className="text-right">
                      Depósitos
                    </SortableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{formatFecha(t.fecha)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatTasa(t.valor)}</TableCell>
                      <TableCell>{t.imagenPath ? <ComprobanteThumb path={t.imagenPath} /> : "—"}</TableCell>
                      <TableCell className="max-w-64 truncate" title={t.notas ?? ""}>
                        {t.notas ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.usos}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, tasa: t })}>
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={t.usos > 0}
                          title={t.usos > 0 ? "En uso: no se puede eliminar" : undefined}
                          onClick={() => setBorrar(t)}
                        >
                          Eliminar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      )}
      <TasaFormDialog
        tasa={dialog.tasa}
        fechaFija={dialog.fecha}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
      <ConfirmDialog
        open={borrar !== null}
        onOpenChange={(o) => !o && setBorrar(null)}
        title="Eliminar tasa"
        description={borrar ? `Se eliminará la tasa del ${formatFecha(borrar.fecha)}.` : ""}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => (borrar ? eliminar(borrar) : undefined)}
      />
    </div>
  );
}
