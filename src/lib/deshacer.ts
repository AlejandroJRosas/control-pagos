import { toast } from "sonner";
import { getDb } from "@/db";
import { restaurarDepositos, type Eliminados } from "@/db/repos/depositos";
import { restaurarMovidos, type Movidos } from "@/db/operaciones/moverDepositos";
import { restaurarEditados, type Editados } from "@/db/operaciones/editarDepositos";
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

/** Aviso de depósitos pasados a otro gerente, con "Deshacer", que los devuelve a quien los tenía. */
export function avisarDepositosMovidos(m: Movidos, gerente: string): void {
  const n = m.length;
  toast.success(n === 1 ? `Depósito movido a ${gerente}` : `${n} depósitos movidos a ${gerente}`, {
    duration: 10_000,
    action: {
      label: "Deshacer",
      onClick: async () => {
        try {
          await restaurarMovidos(await getDb(), m);
          toast.success(n === 1 ? "Depósito devuelto" : `${n} depósitos devueltos`);
          invalidate();
        } catch (err) {
          reportError(err, "Deshacer");
        }
      },
    },
  });
}

/** Aviso de depósitos editados en lote, con "Deshacer", que les devuelve los valores de antes. */
export function avisarDepositosEditados(e: Editados): void {
  const n = e.depositos.length;
  toast.success(n === 1 ? "Depósito actualizado" : `${n} depósitos actualizados`, {
    duration: 10_000,
    action: {
      label: "Deshacer",
      onClick: async () => {
        try {
          await restaurarEditados(await getDb(), e);
          toast.success(n === 1 ? "Cambio deshecho" : `Cambios deshechos en ${n} depósitos`);
          invalidate();
        } catch (err) {
          reportError(err, "Deshacer");
        }
      },
    },
  });
}
