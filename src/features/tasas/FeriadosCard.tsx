import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FechaInput } from "@/components/FechaInput";
import { BuscadorSelect } from "@/components/BuscadorSelect";
import { Vacio } from "@/components/Feedback";
import { getDb } from "@/db";
import { createFeriado, deleteFeriado, type Feriado } from "@/db/repos/feriados";
import { formatFecha, isValidIsoDate, nombreDia, todayIso } from "@/domain/dates";
import { invalidate } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

/** Feriados bancarios: no llevan tasa propia y usan la del siguiente día hábil. */
export function FeriadosCard({ feriados }: { feriados: Feriado[] }) {
  const anioActual = todayIso().slice(0, 4);
  const [anio, setAnio] = useState(anioActual);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [borrar, setBorrar] = useState<Feriado | null>(null);
  const anios = useMemo(() => [...new Set([anioActual, ...feriados.map((f) => f.fecha.slice(0, 4))])].sort().reverse(), [feriados, anioActual]);
  const delAnio = feriados.filter((f) => f.fecha.startsWith(anio));

  async function agregar() {
    try {
      await createFeriado(await getDb(), { fecha, nombre: nombre.trim() || null });
      toast.success(`Feriado ${formatFecha(fecha)} agregado`);
      setAnio(fecha.slice(0, 4));
      setFecha("");
      setNombre("");
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  async function eliminar(f: Feriado) {
    try {
      await deleteFeriado(await getDb(), f.fecha);
      toast.success("Feriado eliminado");
      invalidate();
    } catch (e) {
      reportError(e);
    } finally {
      setBorrar(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feriados</CardTitle>
        <CardDescription>
          Un feriado no lleva tasa propia: sus depósitos usan la del siguiente día hábil. Los nacionales se cargan solos; agrega aquí los
          bancarios.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void agregar();
          }}
        >
          <FechaInput aria-label="Fecha del feriado" contenedorClassName="w-40" value={fecha} onChange={setFecha} />
          <Input aria-label="Nombre (opcional)" placeholder="Nombre (opcional)" className="w-64" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Button type="submit" disabled={!isValidIsoDate(fecha)}>
            <Plus />
            Agregar feriado
          </Button>
          <div className="ml-auto w-28">
            <BuscadorSelect value={anio} onChange={(a) => a && setAnio(a)} opciones={anios.map((a) => ({ value: a, label: a }))} placeholder="Año" />
          </div>
        </form>
        {delAnio.length === 0 ? (
          <Vacio texto={`No hay feriados registrados en ${anio}.`} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Día</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {delAnio.map((f) => (
                <TableRow key={f.fecha}>
                  <TableCell>{formatFecha(f.fecha)}</TableCell>
                  <TableCell className="capitalize">{nombreDia(f.fecha)}</TableCell>
                  <TableCell>{f.nombre ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" aria-label={`Eliminar el feriado del ${formatFecha(f.fecha)}`} onClick={() => setBorrar(f)}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ConfirmDialog
        open={borrar !== null}
        onOpenChange={(o) => !o && setBorrar(null)}
        title="Eliminar feriado"
        description={borrar ? `El ${formatFecha(borrar.fecha)} volverá a ser día hábil y necesitará su propia tasa.` : ""}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => (borrar ? eliminar(borrar) : undefined)}
      />
    </Card>
  );
}
