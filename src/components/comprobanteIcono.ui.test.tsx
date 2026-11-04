import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComprobanteIcono } from "./ComprobanteIcono";

it("muestra la vista previa al pasar el mouse (y al llegar con Tab), la quita al salir y con un clic abre el visor", async () => {
  const user = userEvent.setup();
  render(<ComprobanteIcono path="img/a.png" />);
  const boton = screen.getByRole("button", { name: "Ver comprobante" });
  expect(screen.queryByTestId("vista-previa-comprobante")).not.toBeInTheDocument();

  await user.hover(boton);
  expect(await screen.findByTestId("vista-previa-comprobante")).toBeInTheDocument();
  await user.unhover(boton);
  expect(screen.queryByTestId("vista-previa-comprobante")).not.toBeInTheDocument();

  await user.tab();
  expect(boton).toHaveFocus();
  expect(await screen.findByTestId("vista-previa-comprobante")).toBeInTheDocument();
  await user.tab();
  expect(screen.queryByTestId("vista-previa-comprobante")).not.toBeInTheDocument();

  await user.click(boton);
  expect(await screen.findByRole("dialog", { name: "Comprobante" })).toBeInTheDocument();
});
