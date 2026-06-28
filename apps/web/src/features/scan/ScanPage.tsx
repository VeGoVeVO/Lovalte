import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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

const scanCss = `
.scan-view { position: relative; margin-top: .75rem; border-radius: var(--r-card,16px); overflow: hidden; background:#0b0d12; }
.scan-view video { width:100%; max-height:340px; object-fit:cover; display:block; }
.scan-frame { position:absolute; inset:14%; border-radius:14px; border:2px solid rgba(255,255,255,.85);
  box-shadow: 0 0 0 1000px rgba(8,10,16,.30); pointer-events:none; }
.scan-line { position:absolute; left:14%; right:14%; height:2px; border-radius:2px;
  background:linear-gradient(90deg,transparent,#A9F5FF,transparent); box-shadow:0 0 10px #A9F5FF;
  animation: scanline 2.1s ease-in-out infinite; }
@keyframes scanline { 0%,100%{ top:16%; } 50%{ top:82%; } }
.scan-detected { text-align:center; margin-bottom:1rem; }
.scan-crop-wrap { position:relative; width:128px; height:128px; margin:0 auto; }
.scan-crop { width:128px; height:128px; border-radius:14px; object-fit:cover; background:#fff;
  box-shadow:0 10px 26px -10px rgba(0,0,0,.4); animation: scanpop .35s cubic-bezier(.2,.8,.3,1.2) both; }
.scan-ring { position:absolute; inset:-7px; border-radius:18px; border:3px solid rgb(0,180,120); animation: scanring .55s ease-out both; }
.scan-check { position:absolute; right:-8px; bottom:-8px; width:34px; height:34px; border-radius:50%;
  background:rgb(0,170,110); color:#fff; display:grid; place-items:center;
  box-shadow:0 4px 12px -4px rgba(0,150,90,.6); animation: scanpop .4s .14s cubic-bezier(.2,.8,.3,1.4) both; }
@keyframes scanpop { from{ opacity:0; transform:scale(.6); } to{ opacity:1; transform:scale(1); } }
@keyframes scanring { from{ opacity:.85; transform:scale(.8);} to{ opacity:0; transform:scale(1.18);} }
@media (prefers-reduced-motion: reduce){ .scan-line,.scan-crop,.scan-ring,.scan-check{ animation:none !important; } }
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
  const { videoRef, status, detectedToken, capturedImage, startCamera, stopCamera, clearToken } =
    useBarcodeScanner();
  const [manualToken, setManualToken] = useState("");

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

  /* Helpers */
  const handleAction = (action: "award" | "redeem") => {
    if (!activeToken || mutation.isPending) return;
    mutation.reset();
    mutation.mutate(
      { qrToken: activeToken, action },
      {
        onSuccess: () => {
          clearToken();
          setManualToken("");
        },
      },
    );
  };

  const handleScanAgain = () => {
    clearToken();
    mutation.reset();
  };

  /* Build the single live-region string so screen readers hear one update. */
  let liveText = "";
  if (mutation.isPending) {
    liveText = t("Processing…");
  } else if (mutation.isSuccess && mutation.data) {
    const n = Math.abs(mutation.data.delta);
    if (mutation.data.action === "award") {
      liveText = n === 1 ? t("Awarded 1 point!") : t("Awarded {n} points!", { n });
    } else {
      liveText = n === 1 ? t("Redeemed 1 point!") : t("Redeemed {n} points!", { n });
    }
  } else if (mutation.isError) {
    liveText =
      (mutation.error as unknown as ApiError)?.message ?? t("Scan failed. Please try again.");
  } else if (status === "requesting") {
    liveText = t("Requesting camera permission…");
  } else if (status === "scanning") {
    liveText = t("Scanning for QR code…");
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <AppShell title={t("Scan a card")}>
      <style>{scanCss}</style>
      <GlassCard light className="waitlist" style={{ maxWidth: 480 }}>
        {/* Context line */}
        <p className="body" style={{ marginBottom: "1.25rem" }}>
          {showManualFallback
            ? status === "denied"
              ? t("Camera access was denied. Paste the QR token below to continue.")
              : t("QR scanning is not supported in this browser. Paste the QR token below.")
            : t("Point the camera at a customer's QR code to award or redeem points.")}
        </p>

        {/* ── Camera section (hidden when in manual-fallback mode or after detection) */}
        {!showManualFallback && !detectedToken && (
          <div>
            {status === "idle" && (
              <GlassButton onClick={startCamera} aria-label={t("Start camera to scan a QR code")}>
                {t("Start Camera")}
              </GlassButton>
            )}

            {/*
              Keep the <video> in the DOM (just hidden) while the camera section
              is visible so videoRef is attached before getUserMedia resolves.
              No CSS animation/transition on the video - prefers-reduced-motion safe.
            */}
            <div
              role="region"
              aria-label={t("Camera viewfinder")}
              style={{ display: status === "scanning" ? "block" : "none" }}
              aria-hidden={status !== "scanning"}
            >
              <div className="scan-view">
                <video ref={videoRef} playsInline muted />
                <div className="scan-frame" aria-hidden="true" />
                <div className="scan-line" aria-hidden="true" />
              </div>
              <p
                className="meta"
                style={{ textAlign: "center", margin: "0.6rem 0 0", fontSize: "0.8rem" }}
              >
                {t("Hold the customer's card QR inside the frame")}
              </p>
              <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
                <GlassButton variant="ghost" onClick={stopCamera} aria-label={t("Stop the camera")}>
                  {t("Stop Camera")}
                </GlassButton>
              </div>
            </div>
          </div>
        )}

        {/* ── Manual fallback input */}
        {showManualFallback && !detectedToken && (
          <div style={{ marginBottom: "1rem" }}>
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
          </div>
        )}

        {/* ── Detected: auto-cropped QR + success animation (camera path) */}
        {detectedToken && (
          <div className="scan-detected" aria-label={t("QR detected")}>
            <div className="scan-crop-wrap">
              {capturedImage && (
                <img
                  className="scan-crop"
                  src={capturedImage}
                  alt={t("Scanned QR code")}
                  width={128}
                  height={128}
                />
              )}
              <span className="scan-ring" aria-hidden="true" />
              <span className="scan-check" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
            <p className="meta" style={{ marginTop: "0.7rem" }}>
              {t("Card detected - award or redeem below.")}
            </p>
          </div>
        )}

        {/* ── Action buttons (shown whenever we have a usable token) */}
        {activeToken && (
          <div
            className="hero-actions"
            style={{ flexWrap: "wrap", gap: "0.6rem", marginTop: "0.75rem" }}
          >
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
            {detectedToken && !mutation.isPending && (
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
            marginTop: "1rem",
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
