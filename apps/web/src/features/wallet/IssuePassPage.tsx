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
    <div>
      <label
        htmlFor="tpl-select"
        className="meta"
        style={{ display: "block", marginBottom: "0.4rem" }}
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
      <div style={{ maxWidth: 540, margin: "0 auto" }}>
        <GlassCard light className="waitlist">
          <p className="body" style={{ marginBottom: "1.5rem" }}>
            {t(
              "Pick a published card, then let customers self-enroll by scanning a QR - each scan creates a unique member automatically. No member IDs to type.",
            )}
          </p>

          {isLoading && (
            <p className="meta" role="status" aria-live="polite">
              {t("Loading cards…")}
            </p>
          )}
          {isError && (
            <p className="meta" role="alert" style={{ color: "#c0392b" }}>
              {t("Could not load cards. Refresh the page.")}
            </p>
          )}

          {!isLoading && !isError && templates.length === 0 && (
            <GlassCard className="feature">
              <p className="body">
                {t("No published cards yet. Create and publish a card in the builder first.")}
              </p>
            </GlassCard>
          )}

          {templates.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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
                  variant="ghost"
                  onClick={issueNow}
                  disabled={!templateId || issueDirect.isPending}
                  aria-busy={issueDirect.isPending}
                >
                  {issueDirect.isPending ? t("Issuing…") : t("Issue one to a walk-in")}
                </GlassButton>
              </div>

              {error && (
                <p role="alert" className="meta" style={{ color: "#c0392b" }}>
                  {error}
                </p>
              )}

              {link && (
                <section
                  aria-label={t("Enrollment QR")}
                  style={{ textAlign: "center", marginTop: "0.5rem" }}
                >
                  <p className="meta" style={{ marginBottom: "0.8rem" }}>
                    {t("Customers scan this to get their loyalty card")}
                  </p>
                  <div
                    style={{
                      display: "inline-block",
                      padding: "1rem",
                      background: "#fff",
                      borderRadius: 12,
                    }}
                  >
                    <QRCodeSVG value={link.url} size={196} />
                  </div>
                  <p
                    className="meta"
                    style={{ marginTop: "0.8rem", wordBreak: "break-all", fontSize: "0.72rem" }}
                  >
                    {link.url}
                  </p>
                </section>
              )}

              {issued && (
                <section aria-label={t("Issued pass")} style={{ marginTop: "0.5rem" }}>
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
                    style={{ display: "inline-block", textDecoration: "none" }}
                    aria-label={t("Add to Apple Wallet - downloads the .pkpass file")}
                  >
                    {t("Add to Apple Wallet")}
                  </a>
                </section>
              )}
            </div>
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}
