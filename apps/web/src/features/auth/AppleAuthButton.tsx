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
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        focusable="false"
        style={{ display: "block", flex: "0 0 auto", fill: "currentColor" }}
      >
        <path d="M17.05 12.58c-.03-3.11 2.54-4.62 2.66-4.69-1.45-2.12-3.7-2.41-4.5-2.44-1.9-.19-3.74 1.13-4.7 1.13-.98 0-2.45-1.1-4.04-1.07-2.07.03-4.01 1.23-5.07 3.1-2.19 3.79-.56 9.36 1.54 12.43 1.05 1.5 2.27 3.18 3.88 3.12 1.57-.06 2.15-1 4.04-1 1.87 0 2.42 1 4.06.96 1.69-.03 2.75-1.5 3.76-3.02 1.21-1.72 1.7-3.42 1.72-3.51-.04-.01-3.32-1.27-3.35-5.01ZM13.97 3.43c.84-1.05 1.42-2.47 1.25-3.91-1.22.05-2.74.84-3.61 1.86-.78.9-1.48 2.38-1.29 3.76 1.37.11 2.77-.69 3.65-1.71Z" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
