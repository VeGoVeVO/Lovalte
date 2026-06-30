import type { InputHTMLAttributes } from "react";

/* glass input primitive - verbatim from the original Halo component. */
export function GlassInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}
