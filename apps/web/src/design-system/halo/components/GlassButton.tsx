import type { ButtonHTMLAttributes, ReactNode } from "react";

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "ghost";
};

/* glass button primitive - verbatim from the original Halo component. */
export function GlassButton({ variant = "primary", children, ...rest }: GlassButtonProps) {
  return (
    <button className={`btn ${variant === "ghost" ? "ghost" : ""}`} {...rest}>
      {children}
    </button>
  );
}
