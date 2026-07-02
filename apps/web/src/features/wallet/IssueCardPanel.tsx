import { useCallback, useEffect, useRef, useState } from "react";
import { DynamicIcon } from "lucide-react/dynamic";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { GlassButton, GlassCard } from "../../design-system/halo";
import { useT } from "../../lib/i18n";
import { addAppleWalletPass } from "../../lib/nativeWallet";
import { useEnrollLink, useIssueDirect, type EnrollLinkDto, type IssuePassDto } from "./useEnroll";

function signingHint(message: string | undefined, t: (key: string) => string): string {
  const lower = (message ?? "").toLowerCase();
  const isSigning = ["signing", "certificate", "pkcs12", "p12", "icon image"].some((k) =>
    lower.includes(k),
  );
  return isSigning
    ? t(
        "Pass signing isn't fully configured yet (Apple certificate / card icon). Check the card has an icon and the certs are set.",
      )
    : t("Something went wrong. Please try again.");
}

function download(filename: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

export function IssueCardPanel({
  templateId,
  cardName,
  autoCreateQr = false,
  compact = false,
}: {
  templateId: string;
  cardName: string;
  autoCreateQr?: boolean;
  compact?: boolean;
}) {
  const { t } = useT();
  const qrSvgRef = useRef<SVGSVGElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [link, setLink] = useState<EnrollLinkDto | null>(null);
  const [issued, setIssued] = useState<IssuePassDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const didAutoCreateQr = useRef(false);
  const enrollLink = useEnrollLink();
  const issueDirect = useIssueDirect();

  const makeQr = useCallback(async () => {
    setError(null);
    setIssued(null);
    try {
      setLink(await enrollLink.mutateAsync({ templateId }));
    } catch (e) {
      setError(signingHint((e as { message?: string })?.message, t));
    }
  }, [enrollLink, templateId, t]);

  useEffect(() => {
    if (!autoCreateQr || didAutoCreateQr.current) return;
    didAutoCreateQr.current = true;
    void makeQr();
  }, [autoCreateQr, makeQr]);

  const issueNow = async () => {
    setError(null);
    try {
      setIssued(await issueDirect.mutateAsync({ templateId }));
    } catch (e) {
      setError(signingHint((e as { message?: string })?.message, t));
    }
  };

  const addIssuedPass = async () => {
    if (!issued) return;
    setWalletBusy(true);
    setError(null);
    try {
      await addAppleWalletPass(`/api/v1/passes/${issued.passId}/pkpass`);
    } catch (e) {
      setError(
        (e as { message?: string })?.message ?? t("Could not open Apple Wallet. Please try again."),
      );
    } finally {
      setWalletBusy(false);
    }
  };

  const downloadPng = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    setShareOpen(false);
    download(`${cardName || "lovalte"}-qr.png`, canvas.toDataURL("image/png"));
  };

  const downloadSvg = () => {
    const svg = qrSvgRef.current;
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    setShareOpen(false);
    download(`${cardName || "lovalte"}-qr.svg`, URL.createObjectURL(blob));
  };

  const printQr = () => {
    if (!link) return;
    setShareOpen(false);
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>${cardName}</title></head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;">
          <main style="text-align:center;padding:32px;">
            <h1 style="font-size:24px;margin:0 0 8px;">${cardName}</h1>
            <p style="color:#6F7684;margin:0 0 24px;">${t("Scan to add this loyalty card to Wallet.")}</p>
            <img alt="QR" style="width:260px;height:260px;" src="${qrCanvasRef.current?.toDataURL("image/png") ?? ""}" />
          </main>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? ".8rem" : "1rem" }}>
      {!compact ? (
        <div style={{ textAlign: "center" }}>
          <h2 className="cardt" style={{ margin: 0, fontSize: "1.2rem" }}>
            {t("Issue {name}", { name: cardName })}
          </h2>
          <p className="body" style={{ margin: ".45rem 0 0" }}>
            {t("Create a customer QR or add a test pass directly on this iPhone.")}
          </p>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: ".65rem", justifyContent: "center", flexWrap: "wrap" }}>
        {!autoCreateQr || !link ? (
          <GlassButton type="button" onClick={makeQr} disabled={enrollLink.isPending}>
            {enrollLink.isPending ? t("Creating…") : link ? t("Refresh QR") : t("Create QR")}
          </GlassButton>
        ) : null}
        <GlassButton type="button" onClick={issueNow} disabled={issueDirect.isPending}>
          {issueDirect.isPending ? t("Issuing…") : t("Add test pass")}
        </GlassButton>
      </div>

      {error ? (
        <p
          role="alert"
          style={{ color: "#c0392b", fontSize: ".875rem", margin: 0, lineHeight: 1.5 }}
        >
          {error}
        </p>
      ) : null}

      {link ? (
        <section aria-label={t("Enrollment QR")} style={{ textAlign: "center" }}>
          <div
            className="glass"
            style={{
              display: "inline-grid",
              placeItems: "center",
              padding: compact ? ".55rem" : "1rem",
              borderRadius: compact ? "20px" : "24px",
              background:
                "linear-gradient(135deg, rgba(255,255,255,.78), rgba(255,255,255,.42)), var(--card)",
            }}
          >
            <QRCodeSVG ref={qrSvgRef} value={link.url} size={compact ? 148 : 210} />
            <QRCodeCanvas
              ref={qrCanvasRef}
              value={link.url}
              size={768}
              style={{ display: "none" }}
            />
          </div>
          {!compact ? (
            <p className="body" style={{ margin: ".75rem 0 0" }}>
              {t("Customers scan this to get their loyalty card.")}
            </p>
          ) : null}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: ".8rem",
              position: "relative",
            }}
          >
            <GlassButton
              type="button"
              variant="ghost"
              onClick={() => setShareOpen((open) => !open)}
              aria-expanded={shareOpen}
              aria-haspopup="menu"
            >
              <DynamicIcon name={"share" as never} size={16} aria-hidden="true" />
              {t("Share")}
            </GlassButton>
            {shareOpen ? (
              <div
                role="menu"
                className="glass"
                style={{
                  position: "absolute",
                  zIndex: 3,
                  top: "calc(100% + .45rem)",
                  minWidth: "10rem",
                  padding: ".4rem",
                  borderRadius: "18px",
                  display: "grid",
                  gap: ".25rem",
                  boxShadow: "var(--shadow-lift)",
                }}
              >
                {[
                  { label: "PNG", action: downloadPng },
                  { label: "SVG", action: downloadSvg },
                  { label: "PDF", action: printQr },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="btn ghost"
                    onClick={item.action}
                    style={{ justifyContent: "flex-start", minHeight: 34 }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {issued ? (
        <section aria-label={t("Issued pass")} style={{ textAlign: "center" }}>
          <p className="body" role="status" style={{ color: "rgb(0,150,70)", margin: "0 0 .8rem" }}>
            {t("Test pass is ready for Wallet.")}
          </p>
          <GlassButton
            type="button"
            onClick={addIssuedPass}
            disabled={walletBusy}
            aria-label={t("Add to Apple Wallet - downloads the .pkpass file")}
          >
            {walletBusy ? t("Opening Wallet…") : t("Add to Apple Wallet")}
          </GlassButton>
        </section>
      ) : null}
    </div>
  );

  if (compact) {
    return (
      <section className="lvt-issue-panel" aria-label={t("Issue {name}", { name: cardName })}>
        {content}
      </section>
    );
  }

  return (
    <GlassCard
      light
      className="feature lvt-issue-panel"
      aria-label={t("Issue {name}", { name: cardName })}
    >
      {content}
    </GlassCard>
  );
}
