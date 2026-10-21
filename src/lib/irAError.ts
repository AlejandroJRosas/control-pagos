/** Marca de los campos con error (la pone `Field`) y del bloque de duplicado. */
export const SELECTOR_ERROR = "[data-error]";
export const SELECTOR_DUPLICADO = "[data-duplicado]";

/**
 * Lleva a la vista el primer elemento de `raiz` que cumple `selector` (en pantallas chicas puede quedar fuera),
 * le da el foco a su primer control y lo resalta un momento. Devuelve si lo encontró.
 */
export function irA(raiz: ParentNode | null, selector: string): boolean {
  const el = raiz?.querySelector<HTMLElement>(selector);
  if (!el) return false;
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  el.querySelector<HTMLElement>("input:not([type=hidden]), textarea, button, [tabindex]")?.focus({ preventScroll: true });
  el.classList.remove("resaltar-error");
  // Forzar el reflujo para que la animación vuelva a empezar si ya estaba puesta.
  void el.offsetWidth;
  el.classList.add("resaltar-error");
  el.addEventListener("animationend", () => el.classList.remove("resaltar-error"), { once: true });
  return true;
}
