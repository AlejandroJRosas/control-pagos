import { expect, it } from "vitest";
import { extractor, nullExtractor } from "./extractor";

it("en el MVP el extractor activo es el nulo y no devuelve campos", async () => {
  expect(extractor).toBe(nullExtractor);
  await expect(extractor.extract(new Blob(["x"], { type: "image/png" }))).resolves.toEqual({ fields: {} });
});
