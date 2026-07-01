import type { AppConfig } from "../../../config/env";
import type { IdentityEmailSender } from "../application/ports";

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
  return `<p style="color:#7c8492;font-size:13px;line-height:1.6;margin:22px 0 0;">
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
  <body style="margin:0;background:#eefaff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#20242a;">
    <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${esc(input.title)}</div>
    <div style="max-width:580px;margin:0 auto;padding:28px 16px;">
      <div style="border:1px solid #e5eaf2;border-radius:24px;background:#ffffff;overflow:hidden;box-shadow:0 24px 70px rgba(72,91,122,.14);">
        <div style="background:linear-gradient(135deg,#f7fdff 0%,#ffffff 38%,#f8f0ff 100%);border-bottom:1px solid #edf1f7;padding:0;overflow:hidden;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
            <tr>
              <td style="padding:22px 24px;vertical-align:middle;">
                <table cellpadding="0" cellspacing="0" border="0" role="presentation">
                  <tr>
                    <td style="vertical-align:middle;padding-right:12px;">
                      <img src="${esc(markUrl)}" alt="Lovalte" width="42" height="42" style="display:block;border-radius:13px;">
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="font-size:22px;line-height:1;font-weight:800;letter-spacing:-.4px;color:#20242a;">Lovalte</div>
                      <div style="font-size:11px;line-height:1.5;color:#8290a3;letter-spacing:.14em;text-transform:uppercase;margin-top:5px;">Apple Wallet loyalty</div>
                    </td>
                  </tr>
                </table>
              </td>
              <td style="vertical-align:top;text-align:right;width:156px;">
                <table cellpadding="0" cellspacing="0" border="0" align="right" role="presentation" style="margin-left:auto;">
                  <tr>
                    <td width="52" height="36" style="background:#dff9ff;border-left:1px solid rgba(127,151,180,.12);border-bottom:1px solid rgba(127,151,180,.12);"></td>
                    <td width="52" height="36" style="background:#f2edff;border-left:1px solid rgba(127,151,180,.12);border-bottom:1px solid rgba(127,151,180,.12);"></td>
                    <td width="52" height="36" style="background:#ffffff;border-left:1px solid rgba(127,151,180,.12);border-bottom:1px solid rgba(127,151,180,.12);"></td>
                  </tr>
                  <tr>
                    <td width="52" height="36" style="background:#ffffff;border-left:1px solid rgba(127,151,180,.12);"></td>
                    <td width="52" height="36" style="background:#e8f8ff;border-left:1px solid rgba(127,151,180,.12);"></td>
                    <td width="52" height="36" style="background:#f7eefe;border-left:1px solid rgba(127,151,180,.12);"></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
        <div style="padding:32px 28px 26px;background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);">
          <p style="margin:0 0 12px;color:#8b95a5;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">${esc(
            eyebrow,
          )}</p>
          <h1 style="margin:0 0 16px;font-size:26px;line-height:1.18;font-weight:800;letter-spacing:-.4px;color:#20242a;">${esc(
            input.title,
          )}</h1>
          ${input.body}
          ${input.showSupportLine === false ? "" : supportLine(config)}
        </div>
        <div style="padding:18px 28px 22px;border-top:1px solid #edf1f7;text-align:center;background:#fbfdff;">
          <p style="margin:0;color:#8b95a5;font-size:11px;line-height:1.7;">
            Lovalte - Loyalty cards in Apple Wallet<br>
            <a href="${esc(siteUrl)}" style="color:#7f67ff;text-decoration:none;font-weight:700;">lovalte.com</a>
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:26px 0 6px;"><a href="${esc(href)}" style="display:inline-block;border-radius:999px;background-color:#7f67ff;background:linear-gradient(135deg,#7f67ff 0%,#5fc8ff 100%);color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 24px;box-shadow:0 12px 28px rgba(127,103,255,.25);">${esc(label)}</a></p>`;
}

function paragraph(value: string): string {
  return `<p style="color:#3b4048;font-size:15px;line-height:1.72;margin:0 0 10px;">${value}</p>`;
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
          )}</strong> is ready. You can design beautiful Apple Wallet cards, issue passes, and track repeat visits from your dashboard.`,
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
