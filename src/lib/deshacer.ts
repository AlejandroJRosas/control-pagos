import { toast } from "sonner";
import { getDb } from "@/db";
import { restaurarDepositos, type Eliminados } from "@/db/repos/depositos";
import { invalidate } from "@/hooks/useData";
import { reportError } from "./reportError";

/** Aviso de eliminación con "Deshacer", que vuelve a insertar los depósitos tal como estaban. */
export function avisarDepositosEliminados(e: Eliminados): void {
  const n = e.depositos.length;
  toast.success(n === 1 ? "Depósito eliminado" : `${n} depósitos eliminados`, {
    duration: 10_000,
    action: {
      label: "Deshacer",
      onClick: async () => {
        try {
          await restaurarDepositos(await getDb(), e);
          toast.success(n === 1 ? "Depósito restaurado" : `${n} depósitos restaurados`);
          invalidate();
        } catch (err) {
          reportError(err, "Deshacer");
        }
      },
    },
  });
}
