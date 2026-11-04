import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { REVISAR_HOY_MS, useHoy } from "./useHoy";

afterEach(() => vi.useRealTimers());

it("cambia de día aunque la ventana quede abierta sin tocarla", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-19T23:59:30"));
  const { result } = renderHook(() => useHoy());
  expect(result.current).toBe("2026-10-19");
  act(() => vi.advanceTimersByTime(REVISAR_HOY_MS));
  expect(result.current).toBe("2026-10-20");
});

it("revisa el día al volver a la ventana", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T12:00:00"));
  const { result } = renderHook(() => useHoy());
  vi.setSystemTime(new Date("2026-10-21T08:00:00"));
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
  expect(result.current).toBe("2026-10-21");
});
