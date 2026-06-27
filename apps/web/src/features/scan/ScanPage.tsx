import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton, GlassInput } from "../../design-system/halo";
import { useBarcodeScanner } from "./useBarcodeScanner";

/* ── Types ──────────────────────────────────────────────────────────────── */

/** Shape returned by POST /api/v1/scan/redeem (no { data } wrapper on this route). */
type RedeemResult = {
  eventId: string;
  passId: string;
  action: string;
  delta: number;
};

/* ── Page ────────────────────────────────────────────────────────────────── */

/**
 * Staff QR-scan surface. Uses the BarcodeDetector API (camera) when available;
 * falls back to a manual paste input when unsupported or permission is denied.
 * Calls POST /api/v1/scan/redeem with a per-request Idempotency-Key header.
 */
export function ScanPage() {
  const { videoRef, status, detectedToken, startCamera, stopCamera, clearToken } =
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
    liveText = "Processing…";
  } else if (mutation.isSuccess && mutation.data) {
    const n = Math.abs(mutation.data.delta);
    const pts = `${n} point${n !== 1 ? "s" : ""}`;
    liveText = mutation.data.action === "award" ? `Awarded ${pts}!` : `Redeemed ${pts}!`;
  } else if (mutation.isError) {
    liveText = (mutation.error as ApiError)?.message ?? "Scan failed. Please try again.";
  } else if (status === "requesting") {
    liveText = "Requesting camera permission…";
  } else if (status === "scanning") {
    liveText = "Scanning for QR code…";
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <AppShell title="Scan a card">
      <GlassCard light className="waitlist" style={{ maxWidth: 480 }}>
        {/* Context line */}
        <p className="body" style={{ marginBottom: "1.25rem" }}>
          {showManualFallback
            ? status === "denied"
              ? "Camera access was denied. Paste the QR token below to continue."
              : "QR scanning is not supported in this browser. Paste the QR token below."
            : "Point the camera at a customer's QR code to award or redeem points."}
        </p>

        {/* ── Camera section (hidden when in manual-fallback mode or after detection) */}
        {!showManualFallback && !detectedToken && (
          <div>
            {status === "idle" && (
              <GlassButton
                onClick={startCamera}
                aria-label="Start camera to scan a QR code"
              >
                Start Camera
              </GlassButton>
            )}

            {/*
              Keep the <video> in the DOM (just hidden) while the camera section
              is visible so videoRef is attached before getUserMedia resolves.
              No CSS animation/transition on the video — prefers-reduced-motion safe.
            */}
            <div
              role="region"
              aria-label="Camera viewfinder"
              style={{ display: status === "scanning" ? "block" : "none" }}
              aria-hidden={status !== "scanning"}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: "100%",
                  borderRadius: "var(--r-card, 1rem)",
                  maxHeight: 320,
                  objectFit: "cover",
                  display: "block",
                  background: "#111",
                  marginTop: "0.75rem",
                }}
              />
              <div style={{ marginTop: "0.75rem" }}>
                <GlassButton
                  variant="ghost"
                  onClick={stopCamera}
                  aria-label="Stop the camera"
                >
                  Stop Camera
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
              QR Token
            </label>
            <GlassInput
              id="qr-token-input"
              type="text"
              value={manualToken}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setManualToken(e.target.value);
                if (mutation.isError || mutation.isSuccess) mutation.reset();
              }}
              placeholder="Paste QR token here"
              aria-label="QR token"
              aria-describedby="scan-status"
              disabled={mutation.isPending}
              autoComplete="off"
            />
          </div>
        )}

        {/* ── Detected token preview (camera path) */}
        {detectedToken && (
          <div
            className="glass"
            style={{
              padding: "0.6rem 1rem",
              borderRadius: "var(--r-input, 0.75rem)",
              marginBottom: "1rem",
              wordBreak: "break-all",
            }}
            aria-label="Detected QR token"
          >
            <p className="meta" style={{ marginBottom: "0.2rem" }}>
              QR detected
            </p>
            <code style={{ fontSize: "0.7rem", opacity: 0.75 }}>{detectedToken}</code>
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
              aria-label="Award one loyalty point to this member"
            >
              Award point
            </GlassButton>
            <GlassButton
              variant="ghost"
              onClick={() => handleAction("redeem")}
              disabled={mutation.isPending}
              aria-label="Redeem a loyalty reward for this member"
            >
              Redeem reward
            </GlassButton>
            {detectedToken && !mutation.isPending && (
              <GlassButton
                variant="ghost"
                onClick={handleScanAgain}
                aria-label="Clear this QR and scan a new code"
              >
                Scan again
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
