import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton, GlassInput } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import { useBarcodeScanner } from "./useBarcodeScanner";

/* ── Types ──────────────────────────────────────────────────────────────── */

/** Shape returned by POST /api/v1/scan/redeem (no { data } wrapper on this route). */
type RedeemResult = {
  eventId: string;
  passId: string;
  action: string;
  delta: number;
};

type ScanPreview = {
  passId: string;
  cardName: string;
  cardType: string;
  member: {
    id: string;
    displayName: string | null;
    email: string | null;
    balance: number;
    tier: string;
    status: string;
    enrolledAt: string;
  };
};

const scanCss = `
.scan-view { position: relative; margin-top: .75rem; border-radius: var(--r-card,24px); overflow: hidden; background:#0b0d12; min-height:280px;
  display:grid; place-items:center; isolation:isolate; }
.scan-view video { width:100%; max-height:340px; object-fit:cover; display:block; }
.scan-view.is-captured {
  background:
    radial-gradient(120% 90% at 0% 0%, rgba(169,245,255,.22), transparent 58%),
    radial-gradient(120% 90% at 100% 100%, rgba(255,221,244,.24), transparent 58%),
    rgba(255,255,255,.48);
}
.scan-frame { position:absolute; inset:14%; border-radius:14px; border:2px solid rgba(255,255,255,.85);
  box-shadow: 0 0 0 1000px rgba(8,10,16,.30); pointer-events:none; }
.scan-line { position:absolute; left:14%; right:14%; height:2px; border-radius:2px;
  background:linear-gradient(90deg,transparent,var(--cyan),transparent); box-shadow:0 0 10px var(--cyan);
  animation: scanline 2.1s ease-in-out infinite; }
@keyframes scanline { 0%,100%{ top:16%; } 50%{ top:82%; } }
.scan-capture-stage { position:relative; display:grid; place-items:center; width:min(72vw, 210px); aspect-ratio:1; }
.scan-capture-stage::before, .scan-capture-stage::after {
  content:""; position:absolute; inset:-16px; border-radius:28px; pointer-events:none;
  border:2px solid rgba(49,95,118,.24); animation: scanhold 1.15s cubic-bezier(.22,1,.36,1) both;
}
.scan-capture-stage::after { inset:-28px; opacity:.6; animation-delay:.08s; }
.scan-crop { width:100%; height:100%; border-radius:22px; object-fit:cover; background:var(--bg,#FCFCFD);
  box-shadow:0 1px 0 rgba(255,255,255,.88) inset, 0 22px 44px -24px rgba(46,62,92,.62);
  animation: scancapture .58s cubic-bezier(.2,.8,.3,1.12) both; }
.scan-check { position:absolute; right:-12px; bottom:-12px; width:42px; height:42px; border-radius:50%;
  background:linear-gradient(135deg, #77dcbf, #5ba7c9); color:#fff; display:grid; place-items:center;
  box-shadow:0 10px 22px -10px rgba(49,95,118,.72); animation: scanpop .38s .22s cubic-bezier(.2,.8,.3,1.4) both; }
.scan-info-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.7rem; }
.scan-info-pill { padding:.72rem .82rem; border-radius:18px; background:rgba(255,255,255,.40); border:1px solid rgba(255,255,255,.62); min-width:0; }
.scan-info-pill strong { display:block; color:var(--muted); font-size:.72rem; line-height:1.1; margin-bottom:.22rem; }
.scan-info-pill span { display:block; color:var(--text); font-weight:700; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.scan-member-card { display:flex; flex-direction:column; gap:.75rem; }
@keyframes scancapture { 0%{ opacity:.15; transform:scale(.78) rotate(-2deg); filter:blur(4px); } 55%{ opacity:1; transform:scale(1.05); filter:blur(0); } 100%{ opacity:1; transform:scale(1); filter:none; } }
@keyframes scanpop { from{ opacity:0; transform:scale(.6); } to{ opacity:1; transform:scale(1); } }
@keyframes scanhold { from{ opacity:.65; transform:scale(.72); } to{ opacity:0; transform:scale(1.18);} }
@media (max-width:520px){
  .scan-view { min-height:248px; }
  .scan-info-grid { grid-template-columns:1fr 1fr; gap:.55rem; }
  .scan-info-pill { padding:.62rem .68rem; border-radius:16px; }
}
@media (prefers-reduced-motion: reduce){ .scan-line,.scan-crop,.scan-check,.scan-capture-stage::before,.scan-capture-stage::after{ animation:none !important; } }
`;

/* ── Page ────────────────────────────────────────────────────────────────── */

/**
 * Staff QR-scan surface. Camera scanning via nimiq qr-scanner (works on all
 * browsers over HTTPS); falls back to a manual paste input only if there is no
 * camera or permission is denied. Calls POST /api/v1/scan/redeem with a
 * per-request Idempotency-Key header.
 */
export function ScanPage() {
  const { t } = useT();
  const { videoRef, status, detectedToken, capturedImage, startCamera, clearToken } =
    useBarcodeScanner();
  const [manualToken, setManualToken] = useState("");
  const autoStartedRef = useRef(false);

  const mutation = useMutation({
    mutationFn: ({ qrToken, action }: { qrToken: string; action: "award" | "redeem" }) =>
      api.post<RedeemResult>(
        "/api/v1/scan/redeem",
        { qrToken, action, amount: 1 },
        { "Idempotency-Key": crypto.randomUUID() },
      ),
  });

  /* Derived state */
  const showManualFallback = status === "denied" || status === "unsupported";
  const activeToken = detectedToken ?? (manualToken.trim() || null);
  const previewQuery = useQuery({
    queryKey: ["scan-preview", activeToken],
    queryFn: () =>
      api.get<ScanPreview>(`/api/v1/scan/preview/${encodeURIComponent(activeToken ?? "")}`),
    enabled: Boolean(activeToken),
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (autoStartedRef.current || status !== "idle" || detectedToken) return;
    autoStartedRef.current = true;
    void startCamera();
  }, [detectedToken, startCamera, status]);

  /* Helpers */
  const handleAction = (action: "award" | "redeem") => {
    if (!activeToken || mutation.isPending) return;
    mutation.reset();
    mutation.mutate(
      { qrToken: activeToken, action },
      {
        onSuccess: () => {
          void previewQuery.refetch();
          window.setTimeout(() => {
            void previewQuery.refetch();
          }, 350);
        },
      },
    );
  };

  const handleScanAgain = () => {
    clearToken();
    setManualToken("");
    mutation.reset();
    autoStartedRef.current = true;
    void startCamera();
  };

  /* Build the single live-region string so screen readers hear one update. */
  let liveText = "";
  if (mutation.isPending) {
    liveText = t("Processing…");
  } else if (mutation.isSuccess && mutation.data) {
    const n = Math.abs(mutation.data.delta);
    if (mutation.data.action === "award") {
      liveText = n === 1 ? t("Awarded 1 point. Balance updated.") : t("Awarded {n} points.", { n });
    } else {
      liveText =
        n === 1 ? t("Redeemed 1 point. Balance updated.") : t("Redeemed {n} points.", { n });
    }
  } else if (mutation.isError) {
    liveText =
      (mutation.error as unknown as ApiError)?.message ?? t("Scan failed. Please try again.");
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <AppShell title={t("Scan a card")} narrow>
      <style>{scanCss}</style>
      <GlassCard
        light
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          padding: "clamp(1.5rem,4vw,2.5rem)",
          borderRadius: "var(--r-card)",
        }}
      >
        {/* Context line */}
        <p className="body" style={{ textAlign: "center" }}>
          {showManualFallback
            ? status === "denied"
              ? t("Camera access was denied. Paste the QR token below to continue.")
              : t("QR scanning is not supported in this browser. Paste the QR token below.")
            : t("Point the camera at a customer's QR code to award or redeem points.")}
        </p>

        {/* ── Camera section (hidden only when manual fallback is required) */}
        {!showManualFallback && (
          <div role="region" aria-label={t("Camera viewfinder")}>
            <div className={`scan-view${detectedToken ? " is-captured" : ""}`}>
              {detectedToken ? (
                <div className="scan-capture-stage" aria-label={t("Captured QR code")}>
                  {capturedImage && (
                    <img
                      className="scan-crop"
                      src={capturedImage}
                      alt={t("Scanned QR code")}
                      width={224}
                      height={224}
                    />
                  )}
                  <span className="scan-check" aria-hidden="true">
                    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M5 12l5 5L20 7"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </div>
              ) : (
                <>
                  <video ref={videoRef} playsInline muted />
                  <div className="scan-frame" aria-hidden="true" />
                  <div className="scan-line" aria-hidden="true" />
                </>
              )}
            </div>
            <p className="eyebrow" style={{ textAlign: "center", margin: "0.6rem 0 0" }}>
              {detectedToken
                ? t("QR captured - camera paused")
                : t("Hold the customer's card QR inside the frame")}
            </p>
          </div>
        )}

        {/* ── Manual fallback input */}
        {showManualFallback && !detectedToken && (
          <>
            <label
              htmlFor="qr-token-input"
              className="meta"
              style={{ display: "block", marginBottom: "0.35rem" }}
            >
              {t("QR Token")}
            </label>
            <GlassInput
              id="qr-token-input"
              type="text"
              value={manualToken}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setManualToken(e.target.value);
                if (mutation.isError || mutation.isSuccess) mutation.reset();
              }}
              placeholder={t("Paste QR token here")}
              aria-label={t("QR token")}
              aria-describedby="scan-status"
              disabled={mutation.isPending}
              autoComplete="off"
            />
          </>
        )}

        {activeToken && (
          <div className="scan-member-card" aria-live="polite">
            {previewQuery.isLoading ? (
              <p className="body" style={{ textAlign: "center", margin: 0 }} aria-busy="true">
                {t("Loading member details…")}
              </p>
            ) : previewQuery.isError ? (
              <p className="body" role="alert" style={{ textAlign: "center", margin: 0 }}>
                {(previewQuery.error as unknown as ApiError)?.message ??
                  t("Could not load this member.")}
              </p>
            ) : previewQuery.data ? (
              <>
                <div style={{ textAlign: "center" }}>
                  <h2 className="cardt" style={{ margin: 0 }}>
                    {previewQuery.data.member.displayName || t("Member")}
                  </h2>
                  <p className="body" style={{ margin: ".24rem 0 0" }}>
                    {previewQuery.data.member.email || t("No email on file")}
                  </p>
                </div>
                <div className="scan-info-grid">
                  <div className="scan-info-pill">
                    <strong>{t("Card")}</strong>
                    <span>{previewQuery.data.cardName}</span>
                  </div>
                  <div className="scan-info-pill">
                    <strong>{t("Type")}</strong>
                    <span>{previewQuery.data.cardType}</span>
                  </div>
                  <div className="scan-info-pill">
                    <strong>{t("Balance")}</strong>
                    <span>{previewQuery.data.member.balance.toLocaleString()}</span>
                  </div>
                  <div className="scan-info-pill">
                    <strong>{t("Tier")}</strong>
                    <span>{previewQuery.data.member.tier}</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── Action buttons (shown whenever we have a usable token) */}
        {activeToken && (
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <GlassButton
              onClick={() => handleAction("award")}
              disabled={mutation.isPending}
              aria-label={t("Award one loyalty point to this member")}
            >
              {t("Award point")}
            </GlassButton>
            <GlassButton
              variant="ghost"
              onClick={() => handleAction("redeem")}
              disabled={mutation.isPending}
              aria-label={t("Redeem a loyalty reward for this member")}
            >
              {t("Redeem reward")}
            </GlassButton>
            {activeToken && !mutation.isPending && (
              <GlassButton
                variant="ghost"
                onClick={handleScanAgain}
                aria-label={t("Clear this QR and scan a new code")}
              >
                {t("Scan again")}
              </GlassButton>
            )}
          </div>
        )}

        {/* ── Single ARIA live region for all status updates */}
        <p
          id="scan-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="body"
          style={{
            minHeight: "1.5em",
            color: mutation.isError ? "var(--c-err, #e53935)" : undefined,
          }}
        >
          {liveText}
        </p>
      </GlassCard>
    </AppShell>
  );
}
