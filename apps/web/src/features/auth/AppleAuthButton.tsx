import type { ButtonHTMLAttributes } from "react";

type AppleAuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
};

export function AppleAuthButton({ label, disabled, ...props }: AppleAuthButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      style={{
        width: "100%",
        minHeight: 46,
        border: "1px solid rgba(0,0,0,.88)",
        borderRadius: 999,
        background: disabled ? "rgba(0,0,0,.55)" : "#050505",
        color: "#fff",
        font: "inherit",
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: ".55rem",
        opacity: disabled ? 0.72 : 1,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: "1.1rem", lineHeight: 1 }}>
        
      </span>
      <span>{label}</span>
    </button>
  );
}
