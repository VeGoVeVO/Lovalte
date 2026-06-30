/* smooth-scroll helper - verbatim from the original Halo component. */
export function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}
