import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton, Dropdown } from "../../design-system/halo";
import { useEnrollLink, useIssueDirect, type EnrollLinkDto, type IssuePassDto } from "./useEnroll";
import { useT } from "@/lib/i18n";

type CardTemplateDTO = {
  id: string;
  name: string;
  status: string;
  brand: { organizationName: string };
};

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

function TemplateSelect({
  templates,
  value,
  onChange,
}: {
  templates: CardTemplateDTO[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useT();
  return (
    <div style={{ width: "100%" }}>
      <label
        htmlFor="tpl-select"
        style={{
          display: "block",
          marginBottom: "0.4rem",
          fontSize: "0.85rem",
          color: "var(--muted)",
          fontWeight: 500,
        }}
      >
        {t("Loyalty card")}
      </label>
      <Dropdown
        id="tpl-select"
        ariaLabel={t("Loyalty card")}
        placeholder={t("Select a published card…")}
        value={value}
        onChange={onChange}
        options={templates.map((tpl) => ({
          value: tpl.id,
          label: `${tpl.name} - ${tpl.brand.organizationName}`,
        }))}
      />
    </div>
  );
}

export function IssuePassPage() {
  const { t } = useT();
  const [templateId, setTemplateId] = useState("");
  const [link, setLink] = useState<EnrollLinkDto | null>(null);
  const [issued, setIssued] = useState<IssuePassDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    data: templates = [],
    isLoading,
    isError,
  } = useQuery<CardTemplateDTO[]>({
    queryKey: ["card-templates", "published"],
    queryFn: () => api.get<CardTemplateDTO[]>("/api/v1/card-templates?status=published"),
    staleTime: 60_000,
  });

  const enrollLink = useEnrollLink();
  const issueDirect = useIssueDirect();

  const reset = () => {
    setLink(null);
    setIssued(null);
    setError(null);
  };
  const onPickTemplate = (id: string) => {
    setTemplateId(id);
    reset();
  };

  const makeQr = async () => {
    setError(null);
    setIssued(null);
    try {
      setLink(await enrollLink.mutateAsync({ templateId }));
    } catch (e) {
      setError(signingHint((e as { message?: string })?.message, t));
    }
  };
  const issueNow = async () => {
    setError(null);
    setLink(null);
    try {
      setIssued(await issueDirect.mutateAsync({ templateId }));
    } catch (e) {
      setError(signingHint((e as { message?: string })?.message, t));
    }
  };

  return (
    <AppShell title={t("Issue a Wallet Pass")}>
      <GlassCard
        light
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          maxWidth: 540,
          margin: "0 auto",
          padding: "clamp(1.25rem, 4vw, 2rem)",
        }}
      >
        <p className="body">
          {t(
            "Pick a published card, then let customers self-enroll by scanning a QR - each scan creates a unique member automatically. No member IDs to type.",
          )}
        </p>

        {isLoading && (
          <p
            role="status"
            aria-live="polite"
            style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.5 }}
          >
            {t("Loading cards…")}
          </p>
        )}
        {isError && (
          <p role="alert" style={{ color: "#c0392b", fontSize: "0.875rem", lineHeight: 1.5 }}>
            {t("Could not load cards. Refresh the page.")}
          </p>
        )}

        {!isLoading && !isError && templates.length === 0 && (
          <p className="body" style={{ color: "var(--muted)" }}>
            {t("No published cards yet. Create and publish a card in the builder first.")}
          </p>
        )}

        {templates.length > 0 && (
          <>
            <TemplateSelect templates={templates} value={templateId} onChange={onPickTemplate} />

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <GlassButton
                type="button"
                onClick={makeQr}
                disabled={!templateId || enrollLink.isPending}
                aria-busy={enrollLink.isPending}
              >
                {enrollLink.isPending ? t("Creating…") : t("Create enrollment QR")}
              </GlassButton>
              <GlassButton
                type="button"
                onClick={issueNow}
                disabled={!templateId || issueDirect.isPending}
                aria-busy={issueDirect.isPending}
              >
                {issueDirect.isPending ? t("Issuing…") : t("Issue one to a walk-in")}
              </GlassButton>
            </div>

            {error && (
              <p role="alert" style={{ color: "#c0392b", fontSize: "0.875rem", lineHeight: 1.5 }}>
                {error}
              </p>
            )}

            {link && (
              <section aria-label={t("Enrollment QR")} style={{ textAlign: "center" }}>
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.875rem",
                    lineHeight: 1.5,
                    marginBottom: "0.8rem",
                  }}
                >
                  {t("Customers scan this to get their loyalty card")}
                </p>
                <div
                  className="glass"
                  style={{
                    display: "inline-block",
                    padding: "var(--s-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-btn)",
                    boxShadow: "var(--shadow-soft)",
                  }}
                >
                  <QRCodeSVG value={link.url} size={196} />
                </div>
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.72rem",
                    lineHeight: 1.5,
                    marginTop: "0.8rem",
                    wordBreak: "break-all",
                  }}
                >
                  {link.url}
                </p>
              </section>
            )}

            {issued && (
              <section aria-label={t("Issued pass")}>
                <p
                  className="body"
                  role="status"
                  style={{ color: "rgb(0,150,70)", marginBottom: "0.8rem" }}
                >
                  {t("Pass issued - member {memberId}.", {
                    memberId: issued.memberId.slice(0, 8),
                  })}
                </p>
                <a
                  href={`/api/v1/passes/${issued.passId}/pkpass`}
                  download="lovalte.pkpass"
                  className="btn"
                  style={{ textDecoration: "none" }}
                  aria-label={t("Add to Apple Wallet - downloads the .pkpass file")}
                >
                  {t("Add to Apple Wallet")}
                </a>
              </section>
            )}
          </>
        )}
      </GlassCard>
    </AppShell>
  );
}
