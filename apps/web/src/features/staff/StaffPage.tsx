import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError } from "../../lib/api";
import { AppShell } from "../../lib/AppShell";
import { GlassCard, GlassButton, GlassInput, Icon, Dropdown } from "../../design-system/halo";
import { useT } from "../../lib/i18n";

/* ── domain types (mirror identity context DTOs) ─────────────── */
type UserRole = "owner" | "manager" | "staff";
type UserStatus = "active" | "invited" | "suspended";

interface UserDTO {
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

interface InviteResult {
  invitationId: string;
  email: string;
  role: "manager" | "staff";
  expiresAt: string;
  token: string;
}

/* ── badge helpers ────────────────────────────────────────────── */
const ROLE_BG: Record<UserRole, string> = {
  owner: "var(--mint)",
  manager: "var(--lavender)",
  staff: "var(--ice)",
};

function RoleBadge({ role }: { role: UserRole }) {
  const { t } = useT();
  return (
    <span
      aria-label={t("Role: {role}", { role })}
      style={{
        fontSize: "0.72rem",
        fontWeight: 600,
        padding: "0.2rem 0.65rem",
        borderRadius: "var(--r-pill)",
        background: ROLE_BG[role] ?? "rgba(0,0,0,.06)",
        color: "var(--text)",
        textTransform: "capitalize",
        letterSpacing: "0.01em",
      }}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  const { t } = useT();
  if (status === "active") return null;
  return (
    <span
      aria-label={t("Status: {status}", { status })}
      style={{
        fontSize: "0.68rem",
        fontWeight: 500,
        padding: "0.15rem 0.55rem",
        borderRadius: "var(--r-pill)",
        background: "rgba(0,0,0,.06)",
        color: "var(--muted)",
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

/* ── page ─────────────────────────────────────────────────────── */
export function StaffPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("staff");
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data: users,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["staff-users"],
    queryFn: () => api.get<UserDTO[]>("/api/v1/users"),
  });

  const invite = useMutation({
    mutationFn: (body: { email: string; role: "manager" | "staff" }) =>
      api.post<InviteResult>("/api/v1/users/invite", body),
    onSuccess: (result) => {
      setInviteResult(result);
      setEmail("");
      setInviteError(null);
      qc.invalidateQueries({ queryKey: ["staff-users"] });
    },
    onError: (e: ApiError) => {
      setInviteError(e.message ?? t("Invitation failed"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteResult(null);
    setInviteError(null);
    setCopied(false);
    invite.mutate({ email: email.trim(), role });
  };

  const copyToken = async () => {
    if (!inviteResult?.token) return;
    await navigator.clipboard.writeText(inviteResult.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell title={t("Staff")}>
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "720px" }}>
        {/* ── Invite form ──────────────────────────────────────── */}
        <GlassCard light className="feature" aria-label={t("Invite team member")}>
          <h2 className="section" style={{ fontSize: "1.15rem" }}>
            {t("Invite team member")}
          </h2>
          <p className="body" style={{ margin: "0 0 0.25rem" }}>
            {t("Owners and managers can invite staff or additional managers.")}
          </p>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            noValidate
          >
            <div>
              <label
                htmlFor="invite-email"
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  color: "var(--muted)",
                  marginBottom: "0.35rem",
                  fontWeight: 500,
                }}
              >
                {t("Email address")}
              </label>
              <GlassInput
                id="invite-email"
                type="email"
                autoComplete="email"
                placeholder={t("colleague@example.com")}
                aria-label={t("Email address")}
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label
                htmlFor="invite-role"
                style={{
                  display: "block",
                  fontSize: "0.85rem",
                  color: "var(--muted)",
                  marginBottom: "0.35rem",
                  fontWeight: 500,
                }}
              >
                {t("Role")}
              </label>
              <Dropdown
                id="invite-role"
                ariaLabel={t("Role")}
                value={role}
                onChange={(v) => setRole(v as "manager" | "staff")}
                options={[
                  { value: "staff", label: t("Staff") },
                  { value: "manager", label: t("Manager") },
                ]}
              />
            </div>

            {inviteError ? (
              <p className="body" role="alert" style={{ margin: 0, fontSize: "0.9rem" }}>
                {inviteError}
              </p>
            ) : null}

            <GlassButton type="submit" disabled={invite.isPending || !email.trim()}>
              {invite.isPending ? t("Sending…") : t("Send invite")}
            </GlassButton>
          </form>

          {inviteResult ? (
            <div
              className="glass"
              role="status"
              aria-live="polite"
              style={{ padding: "1rem 1.25rem", borderRadius: "var(--r-card)" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <Icon.Check aria-hidden="true" />
                <span style={{ fontWeight: 500 }}>
                  {t("Invite sent to {email}", { email: inviteResult.email })}
                </span>
                <RoleBadge role={inviteResult.role} />
              </div>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "var(--muted)" }}>
                {t("Share this token with the invitee - expires {date}.", {
                  date: new Date(inviteResult.expiresAt).toLocaleDateString(),
                })}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <code
                  style={{
                    flex: 1,
                    fontSize: "0.73rem",
                    wordBreak: "break-all",
                    background: "rgba(0,0,0,.04)",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "10px",
                    display: "block",
                    lineHeight: 1.5,
                  }}
                >
                  {inviteResult.token}
                </code>
                <GlassButton
                  type="button"
                  variant="ghost"
                  onClick={copyToken}
                  aria-label={t("Copy invitation token")}
                  style={{ flexShrink: 0, padding: "0.5rem 0.85rem", fontSize: "0.82rem" }}
                >
                  {copied ? t("Copied") : t("Copy")}
                </GlassButton>
              </div>
            </div>
          ) : null}
        </GlassCard>

        {/* ── Team list ─────────────────────────────────────────── */}
        <GlassCard light className="feature" aria-label={t("Team members")}>
          <h2 className="section" style={{ fontSize: "1.15rem" }}>
            {t("Team members")}
          </h2>

          {isLoading ? (
            <p className="body" aria-busy="true" aria-live="polite">
              {t("Loading team…")}
            </p>
          ) : isError ? (
            <p className="body" role="alert">
              {t("Could not load users. Only owners and managers can view this page.")}
            </p>
          ) : !users?.length ? (
            <p className="body">{t("No team members yet - invite someone above.")}</p>
          ) : (
            <ul
              role="list"
              aria-label={t("Team members")}
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {users.map((user) => (
                <li key={user.userId}>
                  <div
                    className="glass"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      padding: "0.9rem 1.15rem",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 500, fontSize: "0.95rem" }}>{user.email}</span>
                      <span
                        className="body"
                        style={{ display: "block", fontSize: "0.75rem", marginTop: "0.1rem" }}
                      >
                        {t("Joined {date}", {
                          date: new Date(user.createdAt).toLocaleDateString(),
                        })}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <RoleBadge role={user.role} />
                      <StatusBadge status={user.status} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}
