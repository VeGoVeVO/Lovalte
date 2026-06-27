import { useEffect, useRef, useState } from "react";
import { GlassCard, GlassButton, haloCss } from "../../design-system/halo";
import { publicEnroll, type PublicEnrollDto } from "./useEnroll";
import { useT } from "@/lib/i18n";

type State =
  | { phase: "loading" }
  | { phase: "done"; pass: PublicEnrollDto }
  | { phase: "error"; message: string };

const css = `
.enroll-spin{ width:40px; height:40px; border-radius:50%; margin:0 auto;
  border:3px solid rgba(20,24,32,.12); border-top-color:#5BA7C9; animation:enrollspin .8s linear infinite; }
@keyframes enrollspin{ to { transform:rotate(360deg); } }
.enroll-badge{ width:64px; height:64px; border-radius:50%; margin:0 auto 1rem; display:grid; place-items:center;
  background:rgba(0,170,110,.12); border:1px solid rgba(0,170,110,.34); color:rgb(0,150,95); }
.enroll-badge.err{ background:rgba(192,57,43,.10); border-color:rgba(192,57,43,.3); color:#c0392b; }
.enroll-wallet{ display:inline-flex; align-items:center; gap:.55rem; text-decoration:none;
  background:#111418; color:#fff; border:0; border-radius:14px; padding:.95rem 1.5rem;
  font:inherit; font-size:1rem; font-weight:600; box-shadow:0 12px 26px -12px rgba(0,0,0,.5);
  transition:transform .12s ease, box-shadow .2s ease; }
.enroll-wallet:hover{ transform:translateY(-2px); box-shadow:0 18px 34px -14px rgba(0,0,0,.55); }
.enroll-wallet:active{ transform:translateY(0); }
.enroll-wallet:focus-visible{ outline:none; box-shadow:0 0 0 3px rgba(91,167,201,.5); }
@media (prefers-reduced-motion: reduce){ .enroll-spin{ animation:none; } .enroll-wallet{ transition:none; } }
`;

/**
 * Public landing page reached by scanning a merchant's enrollment QR
 * (`/enroll#<token>`). Auto-creates a unique member + pass - no login, no typing.
 * Branded with the Halo theme (injects haloCss + wraps in `.halo`) since it
 * renders outside the authenticated AppShell.
 */
export function EnrollPage() {
  const { t } = useT();
  const [state, setState] = useState<State>({ phase: "loading" });
  const ran = useRef(false); // guard StrictMode double-invoke → avoid double enrollment

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = window.location.hash.replace(/^#/, "").trim();
    if (!token) {
      setState({ phase: "error", message: t("This enrollment link is missing its code.") });
      return;
    }
    publicEnroll(token)
      .then((pass) => setState({ phase: "done", pass }))
      .catch((e: { message?: string }) =>
        setState({ phase: "error", message: e?.message ?? t("This enrollment link is invalid or expired.") }),
      );
  }, [t]);

  return (
    <div className="halo">
      <style>{haloCss}</style>
      <style>{css}</style>
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "radial-gradient(1100px 560px at 50% -8%, rgba(169,245,255,.20), transparent 62%), var(--bg, #FCFCFD)",
        }}
      >
        <div className="lvt-rise" style={{ width: "100%", maxWidth: 420 }}>
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: ".55rem", marginBottom: "1.25rem" }}>
            <span aria-hidden="true" style={{ width: 13, height: 13, borderRadius: "50%", background: "linear-gradient(135deg,#A9F5FF,#5BA7C9)", boxShadow: "0 0 0 3px rgba(169,245,255,.28)" }} />
            <span style={{ fontWeight: 600, fontSize: "1.1rem", color: "var(--text, #20242A)", letterSpacing: "-.01em" }}>Lovalte</span>
          </div>

          <GlassCard light className="feature" style={{ textAlign: "center", padding: "2rem 1.5rem" }}>
            {state.phase === "loading" && (
              <div role="status" aria-live="polite">
                <div className="enroll-spin" aria-hidden="true" />
                <p className="body" style={{ margin: "1.1rem 0 0" }}>{t("Setting up your loyalty card…")}</p>
              </div>
            )}

            {state.phase === "done" && (
              <div role="status" aria-live="polite">
                <div className="enroll-badge" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <h1 className="cardt" style={{ margin: "0 0 .4rem", fontSize: "clamp(1.3rem,5vw,1.6rem)" }}>{t("You're in! 🎉")}</h1>
                <p className="body" style={{ margin: "0 0 1.5rem", color: "var(--muted, #6F7684)" }}>
                  {t("Your loyalty card is ready. Add it to Apple Wallet:")}
                </p>
                <a
                  className="enroll-wallet"
                  href={`/api/v1/public/passes/${state.pass.passId}/pkpass?t=${encodeURIComponent(state.pass.downloadToken)}`}
                  aria-label={t("Add to Apple Wallet - downloads your pass")}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="2.5" y="5.5" width="19" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="17.5" cy="14.5" r="1.4" fill="currentColor" />
                  </svg>
                  {t("Add to Apple Wallet")}
                </a>
                <p className="meta" style={{ marginTop: "1.25rem", fontSize: ".75rem", color: "var(--muted, #6F7684)" }}>
                  {t("On iPhone this opens straight in Wallet. If nothing happens, open this page in Safari.")}
                </p>
              </div>
            )}

            {state.phase === "error" && (
              <div role="alert">
                <div className="enroll-badge err" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /></svg>
                </div>
                <h1 className="cardt" style={{ margin: "0 0 .4rem", fontSize: "clamp(1.2rem,5vw,1.5rem)" }}>{t("Couldn't set up your card")}</h1>
                <p className="body" style={{ margin: "0 0 1.25rem", color: "var(--muted, #6F7684)" }}>{state.message}</p>
                <GlassButton type="button" onClick={() => window.location.reload()}>{t("Try again")}</GlassButton>
              </div>
            )}
          </GlassCard>

          <p className="meta" style={{ textAlign: "center", marginTop: "1rem", fontSize: ".72rem", color: "var(--muted, #6F7684)" }}>
            {t("Loyalty cards in Apple Wallet · lovalte.com")}
          </p>
        </div>
      </main>
    </div>
  );
}
