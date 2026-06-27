/* glass button primitive - verbatim from the original Halo component. */
export function GlassButton({ variant = "primary", children, ...rest }) {
  return (
    <button className={`btn ${variant === "ghost" ? "ghost" : ""}`} {...rest}>
      {children}
    </button>
  );
}
