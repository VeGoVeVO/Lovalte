import type { AppConfig } from "../../../config/env";
import type { EmailTestPreset, IdentityEmailSender } from "../application/ports";

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailLayoutInput = {
  title: string;
  eyebrow?: string;
  body: string;
  showSupportLine?: boolean;
};

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function imageUrl(config: AppConfig, path: string): string {
  return new URL(path, config.APP_BASE_URL).toString();
}

function supportLine(config: AppConfig): string {
  return `<p class="lvt-muted" style="color:#7c8492;font-size:13px;line-height:1.6;margin:22px 0 0;">
Questions? Just reply to this email or contact
<a href="mailto:${esc(config.SUPPORT_EMAIL)}" style="color:#7f67ff;text-decoration:none;font-weight:700;">${esc(
    config.SUPPORT_EMAIL,
  )}</a>.
</p>`;
}

function layout(config: AppConfig, input: EmailLayoutInput): string {
  const markUrl = imageUrl(config, "/lovalte-mark.png");
  const siteUrl = config.APP_BASE_URL;
  const eyebrow = input.eyebrow ?? "Lovalte";
  return `<!doctype html>
<html>
  <head>
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      @media (prefers-color-scheme: dark) {
        .lvt-body { background:#eefaff !important; }
        .lvt-card { background:#ffffff !important; border-color:#e5eaf2 !important; }
        .lvt-header { background:#f8fcff !important; }
        .lvt-content { background:#ffffff !important; }
        .lvt-title,.lvt-brand { color:#20242a !important; }
        .lvt-text { color:#3b4048 !important; }
        .lvt-muted { color:#7c8492 !important; }
        .lvt-button { color:#20242a !important; background:#ffffff !important; }
      }
      [data-ogsc] .lvt-body { background:#eefaff !important; }
      [data-ogsc] .lvt-card,[data-ogsc] .lvt-content,[data-ogsc] .lvt-button { background:#ffffff !important; }
      [data-ogsc] .lvt-title,[data-ogsc] .lvt-brand,[data-ogsc] .lvt-button { color:#20242a !important; }
      [data-ogsc] .lvt-text { color:#3b4048 !important; }
      [data-ogsc] .lvt-muted { color:#7c8492 !important; }
    </style>
  </head>
  <body class="lvt-body" style="margin:0;background-color:#eefaff;background-image:linear-gradient(180deg,#eafcff 0%,#fbf7ff 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#20242a;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${esc(input.title)}</div>
    <div style="max-width:580px;margin:0 auto;padding:28px 16px;">
      <div class="lvt-card" style="border:1px solid #e5eaf2;border-radius:24px;background-color:#ffffff;background-image:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);overflow:hidden;box-shadow:0 24px 70px rgba(72,91,122,.14);">
        <div class="lvt-header" style="background-color:#f8fcff;background-image:radial-gradient(220px 130px at 92% 0%,rgba(169,245,255,.34),transparent 60%),radial-gradient(210px 140px at 100% 100%,rgba(229,216,255,.34),transparent 62%),linear-gradient(135deg,#f7fdff 0%,#ffffff 42%,#fbf4ff 100%);border-bottom:1px solid #edf1f7;padding:0;overflow:hidden;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
            <tr>
              <td style="padding:22px 24px;vertical-align:middle;">
                <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                  <tr>
                    <td style="vertical-align:middle;padding-right:12px;">
                      <img src="${esc(markUrl)}" alt="Lovalte" width="50" height="50" style="display:block;border-radius:15px;">
                    </td>
                    <td style="vertical-align:middle;">
                      <div class="lvt-brand" style="font-size:24px;line-height:1;font-weight:800;color:#20242a;">Lovalte</div>
                    </td>
                  </tr>
                </table>
              </td>
              <td style="vertical-align:middle;text-align:right;width:150px;padding-right:18px;">
                <div style="height:58px;border-radius:999px;background-color:rgba(255,255,255,.46);background-image:radial-gradient(48px 44px at 26% 50%,rgba(169,245,255,.58),transparent 70%),radial-gradient(54px 48px at 62% 42%,rgba(229,216,255,.62),transparent 72%),radial-gradient(46px 42px at 88% 58%,rgba(255,221,244,.42),transparent 70%);border:1px solid rgba(255,255,255,.75);box-shadow:inset 0 1px 0 rgba(255,255,255,.88);"></div>
              </td>
            </tr>
          </table>
        </div>
        <div class="lvt-content" style="padding:32px 28px 26px;background-color:#ffffff;background-image:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);">
          <p class="lvt-muted" style="margin:0 0 12px;color:#8b95a5;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">${esc(
            eyebrow,
          )}</p>
          <h1 class="lvt-title" style="margin:0 0 16px;font-size:26px;line-height:1.18;font-weight:800;color:#20242a;">${esc(
            input.title,
          )}</h1>
          ${input.body}
          ${input.showSupportLine === false ? "" : supportLine(config)}
        </div>
        <div style="padding:18px 28px 22px;border-top:1px solid #edf1f7;text-align:center;background-color:#fbfdff;">
          <p class="lvt-muted" style="margin:0;color:#8b95a5;font-size:11px;line-height:1.7;">
            Lovalte - Loyalty cards for Apple Wallet and Google Wallet<br>
            <a href="${esc(siteUrl)}" style="color:#7f67ff;text-decoration:none;font-weight:700;">lovalte.com</a>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:26px 0 6px;"><a class="lvt-button" href="${esc(href)}" style="display:inline-block;border-radius:999px;background-color:#ffffff;background-image:radial-gradient(120% 140% at 0% 0%,rgba(169,245,255,.34),transparent 50%),radial-gradient(120% 140% at 100% 100%,rgba(229,216,255,.42),transparent 54%),linear-gradient(180deg,#ffffff 0%,#fafdff 100%);border:1px solid #e5eaf2;color:#20242a;text-decoration:none;font-weight:800;font-size:15px;padding:14px 24px;box-shadow:0 12px 28px rgba(72,91,122,.16),inset 0 1px 0 rgba(255,255,255,.9);">${esc(label)}</a></p>`;
}

function paragraph(value: string): string {
  return `<p class="lvt-text" style="color:#3b4048;font-size:15px;line-height:1.72;margin:0 0 10px;">${value}</p>`;
}

export class ResendIdentityEmailSender implements IdentityEmailSender {
  constructor(private readonly config: AppConfig) {}

  async sendWelcomeEmail(input: { to: string; businessName?: string }): Promise<void> {
    const name = input.businessName?.trim() || "your business";
    await this.send({
      to: input.to,
      subject: "Welcome to Lovalte",
      text: `Welcome to Lovalte. Your loyalty workspace for ${name} is ready.`,
      html: layout(this.config, {
        eyebrow: "Workspace ready",
        title: "Welcome to Lovalte",
        body: `${paragraph(
          `Your loyalty workspace for <strong>${esc(
            name,
          )}</strong> is ready. You can design beautiful wallet cards, issue passes, and track repeat visits from your dashboard.`,
        )}${paragraph(
          "Start with one card, share one QR, and let customers add your loyalty program straight to Wallet.",
        )}${button("Open Lovalte", this.config.APP_BASE_URL)}`,
      }),
    });
  }

  async sendInvitationEmail(input: { to: string; role: string; acceptUrl: string }): Promise<void> {
    await this.send({
      to: input.to,
      subject: "You're invited to Lovalte",
      text: `You've been invited as ${input.role}. Accept the invitation: ${input.acceptUrl}`,
      html: layout(this.config, {
        eyebrow: "Team invitation",
        title: "You're invited to Lovalte",
        body: `${paragraph(
          `You've been invited as <strong>${esc(
            input.role,
          )}</strong>. Create your password to join the workspace and help manage loyalty cards.`,
        )}${button("Accept invitation", input.acceptUrl)}`,
      }),
    });
  }

  async sendPasswordResetEmail(input: { to: string; resetUrl: string }): Promise<void> {
    await this.send({
      to: input.to,
      subject: "Reset your Lovalte password",
      text: `Reset your Lovalte password: ${input.resetUrl}`,
      html: layout(this.config, {
        eyebrow: "Account security",
        title: "Reset your password",
        body: `${paragraph(
          "Use this secure link to choose a new password. It expires in one hour.",
        )}${button("Reset password", input.resetUrl)}<p style="font-size:13px;line-height:1.65;color:#7c8492;margin:18px 0 0;">If you did not request this, you can safely ignore this email.</p>`,
      }),
    });
  }

  async sendTestEmailPreset(input: { to: string; preset: EmailTestPreset }): Promise<void> {
    const acceptUrl = new URL("/accept-invitation", this.config.APP_BASE_URL);
    acceptUrl.searchParams.set("token", "test-invitation-preview");
    const resetUrl = new URL("/reset-password", this.config.APP_BASE_URL);
    resetUrl.searchParams.set("token", "test-password-reset-preview");

    if (input.preset === "welcome") {
      await this.sendWelcomeEmail({ to: input.to, businessName: "Lovalte Test Workspace" });
      return;
    }
    if (input.preset === "invitation") {
      await this.sendInvitationEmail({
        to: input.to,
        role: "manager",
        acceptUrl: acceptUrl.toString(),
      });
      return;
    }
    if (input.preset === "password-reset") {
      await this.sendPasswordResetEmail({ to: input.to, resetUrl: resetUrl.toString() });
      return;
    }
    await this.send({
      to: input.to,
      subject: "Support request received",
      text: "A customer opened a support ticket in Lovalte.",
      html: layout(this.config, {
        eyebrow: "Support",
        title: "Support request received",
        body: `${paragraph(
          "A customer opened a support ticket. This preview shows how admin/support notifications look inside the Lovalte email system.",
        )}${paragraph("<strong>Subject:</strong> Card scanner question")}`,
      }),
    });
  }

  async sendSupportEmail(input: { subject: string; text: string; html: string }): Promise<void> {
    await this.send({
      to: this.config.SUPPORT_EMAIL,
      subject: input.subject,
      text: input.text,
      html: layout(this.config, {
        eyebrow: "Support",
        title: input.subject,
        body: input.html,
        showSupportLine: false,
      }),
    });
  }

  private async send(input: EmailInput): Promise<void> {
    if (!this.config.RESEND_API_KEY) {
      console.info(`[email] ${input.subject} -> ${input.to}`);
      return;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.config.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    if (!res.ok) {
      const details = await res.text();
      throw new Error(`Resend email failed: ${res.status} ${details}`);
    }
  }
}
