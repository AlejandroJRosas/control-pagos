import { useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Archive, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { getDb } from "@/db";
import { createBackup, getDataPaths, listBackups, restoreBackup, type BackupInfo } from "@/platform/backup";
import { todayIso } from "@/domain/dates";
import { formatNumberVE } from "@/domain/money";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { ordenar, type Columnas } from "@/lib/orden";
import { TEMAS, setTema, useTema } from "@/lib/tema";
import { cn } from "@/lib/utils";

const tamano = (bytes: number) =>
  bytes < 1024 * 1024 ? `${formatNumberVE(bytes / 1024, 0)} KB` : `${formatNumberVE(bytes / 1024 / 1024, 1)} MB`;

type Col = "archivo" | "fecha" | "tamano";
const COLUMNAS: Columnas<BackupInfo, Col> = {
  archivo: { tipo: "texto", valor: (b) => b.name },
  fecha: { tipo: "numero", valor: (b) => b.modifiedMs },
  tamano: { tipo: "numero", valor: (b) => b.sizeBytes },
};

export function ConfiguracionPage() {
  const { data, error } = useData(async () => ({ paths: await getDataPaths(), backups: await listBackups() }), []);
  const [restaurar, setRestaurar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { orden, alternar } = useOrden<Col>();
  const backups = useMemo(() => ordenar(data?.backups ?? [], COLUMNAS, orden), [data, orden]);

  async function respaldar() {
    const dest = await save({ defaultPath: `control-pagos-respaldo-${todayIso()}.zip`, filters: [{ name: "Respaldo", extensions: ["zip"] }] });
    if (!dest) return;
    setBusy(true);
    try {
      await createBackup(await getDb(), dest);
      toast.success("Respaldo creado");
      invalidate();
    } catch (e) {
      reportError(e, "Respaldo");
    } finally {
      setBusy(false);
    }
  }

  async function elegirArchivo() {
    const p = await open({ multiple: false, directory: false, filters: [{ name: "Respaldo", extensions: ["zip"] }] });
    if (typeof p === "string") setRestaurar(p);
  }

  async function confirmarRestaurar() {
    if (!restaurar) return;
    setBusy(true);
    try {
      await restoreBackup(restaurar);
      window.location.reload();
    } catch (e) {
      reportError(e, "Restaurar");
      setBusy(false);
      setRestaurar(null);
      invalidate();
    }
  }

  if (!data) return <Cargando error={error} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" />
      <Apariencia />
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
          <CardDescription>Todo se guarda en esta computadora.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <div>
            <span className="text-muted-foreground">Base de datos: </span>
            <code>{data.paths.dbPath}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Imágenes: </span>
            <code>{data.paths.imagesDir}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Respaldos: </span>
            <code>{data.paths.backupsDir}</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Respaldos</CardTitle>
          <CardDescription>
            Un respaldo (.zip) incluye la base de datos y todas las imágenes. Cada día se crea uno automático y se conservan los últimos 7.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={respaldar} disabled={busy}>
              <Archive />
              Crear respaldo…
            </Button>
            <Button variant="outline" onClick={elegirArchivo} disabled={busy}>
              <RotateCcw />
              Restaurar desde archivo…
            </Button>
          </div>
          {data.backups.length === 0 ? (
            <Vacio texto="Aún no hay respaldos en la carpeta de respaldos." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead col="archivo" orden={orden} onOrden={alternar}>
                    Archivo
                  </SortableHead>
                  <SortableHead col="fecha" orden={orden} onOrden={alternar}>
                    Fecha
                  </SortableHead>
                  <SortableHead col="tamano" orden={orden} onOrden={alternar} className="text-right">
                    Tamaño
                  </SortableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.path}>
                    <TableCell className="font-mono text-xs">{b.name}</TableCell>
                    <TableCell>{new Date(b.modifiedMs).toLocaleString("es-VE")}</TableCell>
                    <TableCell className="text-right tabular-nums">{tamano(b.sizeBytes)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setRestaurar(b.path)}>
                        Restaurar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={restaurar !== null}
        onOpenChange={(o) => {
          if (!o && !busy) setRestaurar(null);
        }}
        title="Restaurar respaldo"
        description="Se reemplazarán TODOS los datos actuales (depósitos, tasas, imágenes) por los del respaldo. Antes se guardará automáticamente una copia de los datos actuales en la carpeta de respaldos."
        confirmLabel="Restaurar"
        destructive
        onConfirm={confirmarRestaurar}
      />
    </div>
  );
}

function Apariencia() {
  const tema = useTema();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Apariencia</CardTitle>
        <CardDescription>Color principal de botones, barra lateral y barras de avance.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        {TEMAS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTema(t.id)}
            aria-pressed={tema === t.id}
            className={cn(
              "flex w-20 flex-col items-center gap-1.5 rounded-lg p-2 text-xs transition-colors hover:bg-accent",
              tema === t.id && "bg-muted font-medium",
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full ring-1 ring-foreground/10",
                tema === t.id && "ring-2 ring-foreground/60 ring-offset-2 ring-offset-background",
              )}
              style={{ background: t.muestra }}
            >
              {tema === t.id && <Check className={cn("size-4", t.id === "neutro" ? "text-white" : "text-foreground/70")} />}
            </span>
            {t.nombre}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
