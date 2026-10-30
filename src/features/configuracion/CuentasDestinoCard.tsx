import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BotonEliminarFila } from "@/components/BotonEliminarFila";
import { Cargando, Vacio } from "@/components/Feedback";
import { getDb } from "@/db";
import { eliminarAliasCuenta, listAliasCuentas, restaurarAliasCuentas, type AliasCuenta } from "@/db/repos/cuentasAlias";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";

/** Variantes de cuenta destino recordadas al unificar (Editar seleccionados…): se ven y se pueden olvidar. */
export function CuentasDestinoCard() {
  const { data: alias } = useData(listAliasCuentas, []);

  async function olvidar(a: AliasCuenta) {
    try {
      const previos = await eliminarAliasCuenta(await getDb(), a.alias);
      invalidate();
      toast.success(`«${a.variante}» ya no se corrige sola`, {
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await restaurarAliasCuentas(await getDb(), previos);
              invalidate();
            } catch (err) {
              reportError(err, "Deshacer");
            }
          },
        },
      });
    } catch (err) {
      reportError(err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuentas destino</CardTitle>
        <CardDescription>
          Las variantes que se recordaron al cambiar la cuenta destino con «Editar seleccionados…». Al registrar, leer un comprobante, importar o consolidar,
          cada variante se guarda con su nombre unificado. Quitar una no cambia lo ya guardado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!alias ? (
          <Cargando />
        ) : alias.length === 0 ? (
          <Vacio texto="Todavía no hay variantes recordadas." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variante</TableHead>
                <TableHead>Se guarda como</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {alias.map((a) => (
                <TableRow key={a.alias}>
                  <TableCell className="font-mono">{a.variante}</TableCell>
                  <TableCell className="font-mono">{a.cuenta}</TableCell>
                  <TableCell>
                    <BotonEliminarFila label={`Olvidar «${a.variante}»`} onClick={() => void olvidar(a)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
