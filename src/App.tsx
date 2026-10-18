import { createHashRouter, Navigate } from "react-router";
import { AppLayout } from "@/components/AppLayout";

export const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/campanas" replace /> },
      { path: "*", element: <Navigate to="/campanas" replace /> },
    ],
  },
]);
