import { expect, it } from "vitest";
import { extensionFor, mimeForPath } from "./images";

it("mapea tipos MIME y extensiones", () => {
  expect(extensionFor("image/jpeg")).toBe("jpg");
  expect(extensionFor("application/pdf")).toBeNull();
  expect(mimeForPath("imagenes/a.JPG")).toBe("image/jpeg");
  expect(mimeForPath("imagenes/a.bin")).toBe("application/octet-stream");
});
