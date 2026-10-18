import { createHashRouter, Navigate } from "react-router";
import { AppLayout } from "@/components/AppLayout";
import { CampanasPage } from "@/features/campanas/CampanasPage";
import { Inicio } from "@/features/campanas/Inicio";
import { CampanaPage } from "@/features/campana/CampanaPage";
import { ImportarPage } from "@/features/importar/ImportarPage";
import { AsignacionPage } from "@/features/asignacion/AsignacionPage";
import { DepositoPage } from "@/features/deposito/DepositoPage";
import { ConfiguracionPage } from "@/features/configuracion/ConfiguracionPage";
import { GerentesPage } from "@/features/gerentes/GerentesPage";
import { TasasPage } from "@/features/tasas/TasasPage";
import { SubirLoteDepositosPage } from "@/features/lote/SubirLoteDepositosPage";
import { SubirLoteTasasPage } from "@/features/lote/SubirLoteTasasPage";
import { RevisionDepositosPage } from "@/features/lote/RevisionDepositosPage";
import { RevisionTasasPage } from "@/features/lote/RevisionTasasPage";

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Inicio /> },
      { path: "campanas", element: <CampanasPage /> },
      { path: "campanas/:campanaId", element: <CampanaPage /> },
      { path: "campanas/:campanaId/depositos/nuevo", element: <DepositoPage /> },
      { path: "campanas/:campanaId/importar", element: <ImportarPage /> },
      { path: "campanas/:campanaId/lote", element: <SubirLoteDepositosPage /> },
      { path: "campanas/:campanaId/revision", element: <RevisionDepositosPage /> },
      { path: "asignaciones/:asignacionId", element: <AsignacionPage /> },
      { path: "asignaciones/:asignacionId/depositos/nuevo", element: <DepositoPage /> },
      { path: "depositos/:depositoId", element: <DepositoPage /> },
      { path: "gerentes", element: <GerentesPage /> },
      { path: "tasas", element: <TasasPage /> },
      { path: "tasas/lote", element: <SubirLoteTasasPage /> },
      { path: "tasas/revision", element: <RevisionTasasPage /> },
      { path: "configuracion", element: <ConfiguracionPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
