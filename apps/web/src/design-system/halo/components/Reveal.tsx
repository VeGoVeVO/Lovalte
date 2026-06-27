import { useReveal } from "../hooks/useReveal";

/* reveal wrapper - verbatim from the original Halo component. */
export function Reveal({ as: Tag = "div", className = "", style, children }) {
  const ref = useReveal();
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={style}>
      {children}
    </Tag>
  );
}
