import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { FileSpreadsheet, Images, ListChecks, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { ComprobanteIcono } from "@/components/ComprobanteIcono";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BotonConMotivo, motivoTasaEnUso } from "@/components/BotonConMotivo";
import { BotonEliminarFila } from "@/components/BotonEliminarFila";
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
import { useReceptorArchivos } from "@/lib/soltarArchivos";
import { receptorLoteTasas } from "@/components/SoltarImagenes";
import { reportError } from "@/lib/reportError";
import { usePestanaUrl } from "@/lib/pestanaUrl";
import { ordenar, type Columnas } from "@/lib/orden";
import { TasaFormDialog } from "./TasaFormDialog";
import { CalendarioTasas } from "./CalendarioTasas";
import { FeriadosCard } from "./FeriadosCard";
import { listFeriados } from "@/db/repos/feriados";

type Col = "fecha" | "valor" | "notas" | "usos";
const COLUMNAS: Columnas<TasaConUsos, Col> = {
  fecha: { tipo: "texto", valor: (t) => t.fecha },
  valor: { tipo: "decimal", valor: (t) => t.valor },
  notas: { tipo: "texto", valor: (t) => t.notas },
  usos: { tipo: "numero", valor: (t) => t.usos },
};

const PESTANAS = ["calendario", "lista", "feriados"] as const;

export function TasasPage() {
  const { data, error } = useData((db) => listTasas(db), []);
  const { data: pendientes } = useData((db) => contarPendientesTasas(db), []);
  const { data: feriados } = useData((db) => listFeriados(db), []);
  // fecha: tasa nueva de un día elegido en el calendario; imagen: captura soltada sobre la pantalla.
  const [dialog, setDialog] = useState<{ open: boolean; tasa: TasaConUsos | null; fecha?: string; imagen?: File }>({ open: false, tasa: null });
  const [borrar, setBorrar] = useState<TasaConUsos | null>(null);
  const [vista, setVista] = usePestanaUrl(PESTANAS);
  const navigate = useNavigate();
  useAtajo("n", () => setDialog({ open: true, tasa: null }));
  useAtajo("l", () => navigate("/tasas/lote"));
  // Una captura soltada abre la tasa nueva con ella; varias van al lote de tasas.
  const lote = receptorLoteTasas(navigate);
  useReceptorArchivos({
    destino: (n) => (n === 1 ? "Suelta para registrar una tasa con esta captura" : lote.destino(n)),
    recibir: (files) => (files.length === 1 ? setDialog({ open: true, tasa: null, imagen: files[0] }) : lote.recibir?.(files)),
  });
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
              <Link to="/tasas/revision" className={buttonVariants({ variant: "secondary" })}>
                <ListChecks />
                Revisar pendientes ({pendientes})
              </Link>
            )}
            <Link to="/tasas/lote" title="L · también puedes soltar las capturas en cualquier parte" className={buttonVariants({ variant: "outline" })}>
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
            <TabsTrigger value="feriados">Feriados</TabsTrigger>
          </TabsList>
          <TabsContent value="calendario">
            <CalendarioTasas
              tasas={data}
              feriados={feriados ?? []}
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
                      <TableCell>{t.imagenPath ? <ComprobanteIcono path={t.imagenPath} label={`Ver la captura de la tasa del ${formatFecha(t.fecha)}`} /> : <span className="pl-2.5 text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="max-w-64 truncate" title={t.notas ?? ""}>
                        {t.notas ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{t.usos}</TableCell>
                      <TableCell className="py-0 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, tasa: t })}>
                            Editar
                          </Button>
                          <BotonConMotivo motivo={t.usos > 0 ? motivoTasaEnUso(t.usos) : undefined}>
                            <BotonEliminarFila label={`Eliminar la tasa del ${formatFecha(t.fecha)}`} disabled={t.usos > 0} onClick={() => setBorrar(t)} />
                          </BotonConMotivo>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
          <TabsContent value="feriados">
            <FeriadosCard feriados={feriados ?? []} />
          </TabsContent>
        </Tabs>
      )}
      <TasaFormDialog
        tasa={dialog.tasa}
        fechaFija={dialog.fecha}
        imagenInicial={dialog.imagen}
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
