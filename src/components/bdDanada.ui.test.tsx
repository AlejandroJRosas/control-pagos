import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { tauri } from "@/testing/tauri";
import { BdDanada } from "./BdDanada";

it("ofrece restaurar los respaldos disponibles", async () => {
  tauri.invoke.mockImplementation(async (cmd: string) =>
    cmd === "list_backups" ? [{ name: "auto-2026-10-18.zip", path: "r/auto-2026-10-18.zip", sizeBytes: 10, modifiedMs: 1 }] : null,
  );
  render(<BdDanada detalle={["asignaciones fila 1 → campanas"]} onContinuar={() => {}} />);
  expect(screen.getByText("La base de datos parece dañada")).toBeInTheDocument();
  expect(await screen.findByText("auto-2026-10-18.zip")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Restaurar este respaldo" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continuar de todos modos" })).toBeInTheDocument();
});
