import { createHashRouter, Navigate } from "react-router";
import { AppLayout } from "@/components/AppLayout";
import { GerentesPage } from "@/features/gerentes/GerentesPage";
import { TasasPage } from "@/features/tasas/TasasPage";

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/campanas" replace /> },
      { path: "gerentes", element: <GerentesPage /> },
      { path: "tasas", element: <TasasPage /> },
      { path: "*", element: <Navigate to="/campanas" replace /> },
    ],
  },
]);
