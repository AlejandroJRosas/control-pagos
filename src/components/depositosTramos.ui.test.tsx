import { afterEach, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DepositosTable } from "./DepositosTable";
import type { FilaDeposito } from "@/domain/campanaView";

function filas(n: number): FilaDeposito[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    asignacionId: 1,
    // Unos 8 depósitos por día.
    fecha: `2026-${String(Math.floor(i / 200) + 1).padStart(2, "0")}-${String((Math.floor(i / 8) % 25) + 1).padStart(2, "0")}`,
    creadoEn: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
    banco: "Banco de Venezuela",
    referencia: String(100000 + i),
    cuentaDestino: "Cuenta X",
    montoBs: "100",
    tasaId: 1,
    tasaValor: "40",
    observaciones: null,
    imagenPath: `img/${i}.png`,
    tasaImagenPath: null,
    gerenteId: 1,
    gerenteNombre: "Ana",
    usd: "2.50",
    saldoGerenteRestante: "0",
    saldoGeneralRestante: "0",
    saldoMostrado: "0",
  }));
}

type Aviso = (entradas: { isIntersecting: boolean }[]) => void;
let avisos: Aviso[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  avisos = [];
});

function conObservador() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: Aviso) {
        avisos.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
}

const tabla = (f: FilaDeposito[]) => (
  <MemoryRouter>
    <DepositosTable filas={f} mostrarGerente saldoLabel="Saldo" contexto={{ campana: "C", vista: "Todos", saldo: "0" }} totalDe="campaña" volverLabel="C" clave="tramos" asignaciones={[]} />
  </MemoryRouter>
);
const dibujadas = () => screen.getAllByRole("checkbox", { name: /^Seleccionar depósito / }).length;

it("dibuja los depósitos por tramos al bajar; seleccionar todos y Mostrar todos abarcan la lista entera", async () => {
  conObservador();
  const user = userEvent.setup();
  render(tabla(filas(400)));
  expect(dibujadas()).toBe(150);
  expect(screen.getByText("Mostrando 150 de 400 depósitos")).toBeInTheDocument();

  // Al acercarse al final llega el siguiente tramo.
  act(() => avisos[avisos.length - 1]([{ isIntersecting: true }]));
  expect(dibujadas()).toBe(300);

  await user.click(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
  expect(screen.getByText("400 seleccionado(s)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Mostrar todos" }));
  expect(dibujadas()).toBe(400);
  expect(screen.queryByText(/^Mostrando/)).not.toBeInTheDocument();
}, 20000);

it("los días plegados no ocupan el tramo", async () => {
  conObservador();
  const user = userEvent.setup();
  render(tabla(filas(400)));
  await user.click(screen.getByRole("button", { name: "Plegar todos" }));
  expect(screen.queryAllByRole("checkbox", { name: /^Seleccionar depósito / })).toHaveLength(0);
  expect(screen.queryByText(/^Mostrando/)).not.toBeInTheDocument();
  // Todas las filas de día siguen a la vista.
  expect(screen.getAllByRole("checkbox", { name: /^Seleccionar los depósitos del / })).toHaveLength(50);
});

it("sin IntersectionObserver se dibuja todo", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  render(tabla(filas(200)));
  expect(dibujadas()).toBe(200);
});
