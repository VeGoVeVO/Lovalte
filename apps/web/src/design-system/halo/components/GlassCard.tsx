import {
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  light?: boolean;
  style?: CSSProperties;
};

/* glass card primitive (pointer-tracked specular light) - verbatim from the original Halo component. */
export function GlassCard({
  className = "",
  hover = false,
  light = false,
  children,
  ...rest
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--mx", x + "%");
      el.style.setProperty("--my", y + "%");
      el.style.setProperty("--lop", "1");
    });
  };
  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.setProperty("--lop", "0");
  };

  return (
    <div
      ref={ref}
      onMouseMove={light ? onMove : undefined}
      onMouseLeave={light ? onLeave : undefined}
      className={`glass ${hover ? "glass-hover" : ""} ${light ? "glass-light" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
