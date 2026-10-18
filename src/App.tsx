import { createHashRouter, Navigate } from "react-router";
import { AppLayout } from "@/components/AppLayout";
import { CampanasPage } from "@/features/campanas/CampanasPage";
import { CampanaPage } from "@/features/campana/CampanaPage";
import { AsignacionPage } from "@/features/asignacion/AsignacionPage";
import { DepositoPage } from "@/features/deposito/DepositoPage";
import { GerentesPage } from "@/features/gerentes/GerentesPage";
import { TasasPage } from "@/features/tasas/TasasPage";

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/campanas" replace /> },
      { path: "campanas", element: <CampanasPage /> },
      { path: "campanas/:campanaId", element: <CampanaPage /> },
      { path: "asignaciones/:asignacionId", element: <AsignacionPage /> },
      { path: "asignaciones/:asignacionId/depositos/nuevo", element: <DepositoPage /> },
      { path: "depositos/:depositoId", element: <DepositoPage /> },
      { path: "gerentes", element: <GerentesPage /> },
      { path: "tasas", element: <TasasPage /> },
      { path: "*", element: <Navigate to="/campanas" replace /> },
    ],
  },
]);
