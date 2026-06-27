import { useEffect, useRef, useState } from "react";
import { GlassCard, GlassButton } from "../../design-system/halo";
import { publicEnroll, type PublicEnrollDto } from "./useEnroll";

type State =
  | { phase: "loading" }
  | { phase: "done"; pass: PublicEnrollDto }
  | { phase: "error"; message: string };

/**
 * Public landing page reached by scanning a merchant's enrollment QR
 * (`/enroll#<token>`). Auto-creates a unique member + pass — no login, no typing.
 */
export function EnrollPage() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const ran = useRef(false); // guard StrictMode double-invoke → avoid double enrollment

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = window.location.hash.replace(/^#/, "").trim();
    if (!token) {
      setState({ phase: "error", message: "This enrollment link is missing its code." });
      return;
    }
    publicEnroll(token)
      .then((pass) => setState({ phase: "done", pass }))
      .catch((e: { message?: string }) =>
        setState({ phase: "error", message: e?.message ?? "This enrollment link is invalid or expired." }),
      );
  }, []);

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "1.5rem", background: "var(--bg, #FCFCFD)" }}>
      <GlassCard light className="waitlist" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <h1 className="cardt" style={{ marginTop: 0 }}>Your loyalty card</h1>

        {state.phase === "loading" && (
          <p className="body" role="status" aria-live="polite">Setting up your card…</p>
        )}

        {state.phase === "error" && (
          <p className="body" role="alert" style={{ color: "#c0392b" }}>{state.message}</p>
        )}

        {state.phase === "done" && (
          <>
            <p className="body" style={{ marginBottom: "1.5rem" }}>
              You're enrolled. Add your card to Apple Wallet:
            </p>
            <a
              href={`/api/v1/public/passes/${state.pass.passId}/pkpass?t=${encodeURIComponent(state.pass.downloadToken)}`}
              className="btn"
              style={{ display: "inline-block", textDecoration: "none" }}
              aria-label="Add to Apple Wallet — downloads your pass"
            >
              Add to Apple Wallet
            </a>
            <p className="meta" style={{ marginTop: "1.25rem", fontSize: "0.75rem" }}>
              On iPhone this opens directly in Wallet. Open this page in Safari if the button does nothing.
            </p>
          </>
        )}

        {state.phase === "error" && (
          <div style={{ marginTop: "1.25rem" }}>
            <GlassButton type="button" variant="ghost" onClick={() => window.location.reload()}>
              Try again
            </GlassButton>
          </div>
        )}
      </GlassCard>
    </main>
  );
}
