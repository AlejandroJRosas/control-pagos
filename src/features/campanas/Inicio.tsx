import { useEffect } from "react";
import { Navigate } from "react-router";
import { getCampana } from "@/db/repos/campanas";
import { useData } from "@/hooks/useData";
import { getCampanaActual, setCampanaActual } from "@/lib/campanaActual";

/** Al abrir la app se entra directo a la última campaña abierta. */
export function Inicio() {
  const id = getCampanaActual();
  const { data, loading } = useData(async (db) => (id ? await getCampana(db, id) : null), [id]);
  const inexistente = !loading && id !== null && !data;
  useEffect(() => {
    if (inexistente) setCampanaActual(null);
  }, [inexistente]);
  if (loading) return null;
  return <Navigate to={data ? `/campanas/${data.id}` : "/campanas"} replace />;
}
