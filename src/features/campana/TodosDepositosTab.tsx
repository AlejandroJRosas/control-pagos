import { Link } from "react-router";
import { Images, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DepositosTable } from "@/components/DepositosTable";
import { FiltrosDepositos, useFiltrosDepositos } from "@/components/FiltrosDepositos";
import { Vacio } from "@/components/Feedback";
import type { CampanaView } from "@/domain/campanaView";

type Props = { campanaId: number; campanaNombre: string; view: CampanaView; cerrada: boolean };

export function TodosDepositosTab({ campanaId, campanaNombre, view, cerrada }: Props) {
  const filtros = useFiltrosDepositos(`campana-${campanaId}`, view.depositos);
  const { r, limpiar } = filtros;

  const vacio =
    view.depositos.length > 0 ? (
      <Vacio texto="Ningún depósito coincide con la búsqueda o los filtros.">
        <Button variant="outline" onClick={limpiar}>
          Limpiar filtros
        </Button>
      </Vacio>
    ) : (
      <Vacio texto={cerrada ? "La campaña no tiene depósitos." : "Todavía no hay depósitos en esta campaña."}>
        {!cerrada && (
          <>
            <Link to={`/campanas/${campanaId}/depositos/nuevo`} className={buttonVariants()}>
              <Plus />
              Registrar depósito
            </Link>
            <Link to={`/campanas/${campanaId}/lote`} className={buttonVariants({ variant: "outline" })}>
              <Images />
              Subir lote de comprobantes
            </Link>
          </>
        )}
      </Vacio>
    );

  return (
    <div className="space-y-4">
      <FiltrosDepositos filtros={filtros} />
      <DepositosTable
        filas={r.filas}
        mostrarGerente
        saldoLabel="Saldo general restante"
        totales={r}
        soloLectura={cerrada}
        vacio={vacio}
        volverLabel={campanaNombre}
      />
    </div>
  );
}
