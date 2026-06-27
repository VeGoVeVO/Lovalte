import type { CSSProperties, ReactNode, HTMLAttributes } from "react";

interface ScrollbarProps extends HTMLAttributes<HTMLDivElement> {
  maxHeight?: number | string;
  children: ReactNode;
}

/**
 * Scroll container with the app's custom scrollbar. The bar itself is styled
 * globally (global-css `*::-webkit-scrollbar`); this wrapper just standardises
 * how scrollable regions opt in (consistent overflow + max-height + a hook
 * class) so every scroll area looks the same.
 */
export function Scrollbar({ maxHeight, className = "", style, children, ...rest }: ScrollbarProps) {
  const merged: CSSProperties = { overflowY: "auto", overflowX: "hidden", maxHeight, ...style };
  return (
    <div className={`lvt-scroll ${className}`.trim()} style={merged} {...rest}>
      {children}
    </div>
  );
}
