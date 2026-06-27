/* smooth-scroll helper - verbatim from the original Halo component. */
export function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}
