import { describe, expect, it } from "vitest";
import { formatBs, formatNumberVE, formatPct, formatTasa, formatUsd, parseMonto, parseTasa, toInputVE, toUsd } from "./money";

describe("parseMonto", () => {
  it.each([
    ["1.234.567,89", "1234567.89"],
    ["1234567,89", "1234567.89"],
    ["36,5", "36.5"],
    ["1.234", "1234"],
    ["1234.56", "1234.56"],
    ["36.5", "36.5"],
    ["1.234.567", "1234567"],
    ["500", "500"],
    ["  2.000,00 Bs ", "2000"],
    ["2.000,00 Bs.", "2000"],
    ["$ 150,25", "150.25"],
    ["0,00", "0"],
  ])("%j → %s", (input, expected) => {
    expect(parseMonto(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "1,2,3", "12,34.5", "-5", "1.23.4", ",5", "12.34.567,8x"])("rechaza %j", (input) => {
    expect(parseMonto(input)).toBeNull();
  });

  it.each(["0.500", "0.500,00", "00.500", "0.000.500"])("rechaza un primer grupo 0 con punto de miles: %j", (input) => {
    expect(parseMonto(input)).toBeNull();
  });

  it.each([
    ["0,50", "0.5"],
    ["0.5", "0.5"],
    ["1.500", "1500"],
  ])("sigue aceptando %j → %s", (input, expected) => {
    expect(parseMonto(input)).toBe(expected);
  });
});

describe("parseTasa", () => {
  it.each([
    ["36.500", "36.5"],
    ["36.5", "36.5"],
    ["245.1234", "245.1234"],
    ["36,50", "36.5"],
    ["1.234,56", "1234.56"],
    ["40", "40"],
  ])("%j → %s (un punto solo siempre es decimal)", (input, expected) => {
    expect(parseTasa(input)).toBe(expected);
  });

  it.each(["", "abc", "-1", "1,2,3"])("rechaza %j", (input) => {
    expect(parseTasa(input)).toBeNull();
  });
});

describe("formato", () => {
  it("formatNumberVE", () => {
    expect(formatNumberVE("1234567.891")).toBe("1.234.567,89");
    expect(formatNumberVE("0.005")).toBe("0,01");
    expect(formatNumberVE("-1500")).toBe("-1.500,00");
    expect(formatNumberVE("-0.001")).toBe("0,00");
    expect(formatNumberVE("999")).toBe("999,00");
    expect(formatNumberVE("12.5", 0)).toBe("13");
  });

  it("formatBs y formatUsd", () => {
    expect(formatBs("1234.5")).toBe("1.234,50 Bs");
    expect(formatUsd("1234.5")).toBe("$ 1.234,50");
    expect(formatUsd("-20")).toBe("-$ 20,00");
  });

  it("formatTasa usa entre 2 y 4 decimales", () => {
    expect(formatTasa("36.5")).toBe("36,50");
    expect(formatTasa("40.123")).toBe("40,123");
    expect(formatTasa("245.123456")).toBe("245,1235");
  });

  it("formatPct", () => {
    expect(formatPct(45.25)).toBe("45,3 %");
    expect(formatPct(100)).toBe("100,0 %");
  });

  it("toInputVE", () => {
    expect(toInputVE("1234.5")).toBe("1.234,50");
    expect(toInputVE("36.1234")).toBe("36,1234");
  });
});

describe("toUsd", () => {
  it("divide y redondea half-up a 2 decimales", () => {
    expect(toUsd("3650", "36.5")).toBe("100.00");
    expect(toUsd("1000", "36.5")).toBe("27.40");
    expect(toUsd("0.125", "1")).toBe("0.13");
    expect(toUsd("100", "3")).toBe("33.33");
  });
});
