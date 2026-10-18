import { expect, it } from "vitest";
import Decimal from "decimal.js";

it("vitest y decimal.js funcionan", () => {
  expect(new Decimal("0.1").plus("0.2").toString()).toBe("0.3");
});
