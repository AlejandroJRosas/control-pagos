import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Cargando, Vacio } from "@/components/Feedback";
import { SortableHead, useOrden } from "@/components/SortableHead";
import { getDb } from "@/db";
import { listGerentesConCampanas, setGerenteActivo, type Gerente, type GerenteConCampanas } from "@/db/repos/gerentes";
import { invalidate, useData } from "@/hooks/useData";
import { reportError } from "@/lib/reportError";
import { ordenar, type Columnas } from "@/lib/orden";
import { GerenteFormDialog } from "./GerenteFormDialog";

type Col = "nombre" | "telefono" | "campanas" | "estado";
const COLUMNAS: Columnas<GerenteConCampanas, Col> = {
  nombre: { tipo: "texto", valor: (g) => g.nombre },
  telefono: { tipo: "texto", valor: (g) => g.telefono },
  campanas: { tipo: "numero", valor: (g) => g.campanas.length },
  estado: { tipo: "numero", valor: (g) => (g.activo ? 0 : 1) },
};

export function GerentesPage() {
  const { data, error } = useData((db) => listGerentesConCampanas(db), []);
  const [dialog, setDialog] = useState<{ open: boolean; gerente: Gerente | null }>({ open: false, gerente: null });
  const [verInactivos, setVerInactivos] = useState(false);

  async function toggleActivo(g: Gerente) {
    try {
      await setGerenteActivo(await getDb(), g.id, !g.activo);
      invalidate();
    } catch (e) {
      reportError(e);
    }
  }

  const { orden, alternar } = useOrden<Col>();
  const filas = useMemo(
    () => ordenar((data ?? []).filter((g) => verInactivos || g.activo), COLUMNAS, orden),
    [data, verInactivos, orden],
  );

  return (
    <div>
      <PageHeader
        title="Gerentes"
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
              Ver inactivos
            </label>
            <Button onClick={() => setDialog({ open: true, gerente: null })}>
              <Plus />
              Nuevo gerente
            </Button>
          </>
        }
      />
      {!data ? (
        <Cargando error={error} />
      ) : filas.length === 0 ? (
        <Vacio texto="Todavía no hay gerentes." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead col="nombre" orden={orden} onOrden={alternar}>
                Nombre
              </SortableHead>
              <SortableHead col="telefono" orden={orden} onOrden={alternar}>
                Teléfono
              </SortableHead>
              <SortableHead col="campanas" orden={orden} onOrden={alternar}>
                Campañas
              </SortableHead>
              <SortableHead col="estado" orden={orden} onOrden={alternar}>
                Estado
              </SortableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.nombre}</TableCell>
                <TableCell>{g.telefono ?? "—"}</TableCell>
                <TableCell className="max-w-80">
                  <div className="flex flex-wrap gap-1">
                    {g.campanas.length === 0
                      ? "—"
                      : g.campanas.map((c) => (
                          <Badge key={c} variant="outline">
                            {c}
                          </Badge>
                        ))}
                  </div>
                </TableCell>
                <TableCell>{g.activo ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                <TableCell className="space-x-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, gerente: g })}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActivo(g)}>
                    {g.activo ? "Desactivar" : "Activar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <GerenteFormDialog gerente={dialog.gerente} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}
