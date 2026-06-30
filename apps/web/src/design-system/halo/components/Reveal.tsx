import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { useReveal } from "../hooks/useReveal";

type RevealProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/* reveal wrapper - verbatim from the original Halo component. */
export function Reveal({ className = "", style, children, ...rest }: RevealProps) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`reveal ${className}`} style={style} {...rest}>
      {children}
    </div>
  );
}
