import { expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { pedirCierre } from "@/lib/cierre";
import { useAvisoSinGuardar } from "./useAvisoSinGuardar";

function Formulario() {
  const aviso = useAvisoSinGuardar(true);
  return <div>formulario{aviso.dialogo}</div>;
}

it("si el formulario se desmonta con el diálogo de cierre abierto, la ventana igual se puede cerrar", async () => {
  const router = createMemoryRouter([{ path: "/", element: <Formulario /> }]);
  const { unmount } = render(<RouterProvider router={router} />);
  const destruir = vi.fn(async () => {});
  const cierre = pedirCierre({ respaldar: async () => {}, destruir, guardarError: async () => {} });
  expect(await screen.findByText("Cambios sin guardar")).toBeInTheDocument();
  act(() => unmount());
  await expect(Promise.race([cierre, new Promise((r) => setTimeout(() => r("colgado"), 500))])).resolves.toBe("cerrado");
  expect(destruir).toHaveBeenCalled();
});
