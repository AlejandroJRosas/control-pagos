/** Borde (y fondo) según la confianza de un campo propuesto por el OCR. */
export function confClass(c: number | undefined): string {
  if (c === undefined) return "";
  if (c >= 0.9) return "border-green-500";
  if (c >= 0.6) return "border-amber-500 bg-amber-50 dark:bg-amber-950/40";
  return "border-red-500 bg-red-50 dark:bg-red-950/40";
}
