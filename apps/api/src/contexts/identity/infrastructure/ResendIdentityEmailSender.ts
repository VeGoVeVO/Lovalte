import type { AppConfig } from "../../../config/env";
import type { IdentityEmailSender } from "../application/ports";

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5fbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#20242a;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="border:1px solid rgba(255,255,255,.7);border-radius:28px;background:rgba(255,255,255,.72);box-shadow:0 20px 55px rgba(78,103,130,.16);padding:28px;">
        <p style="margin:0 0 18px;color:#7d8796;font-size:13px;letter-spacing:.16em;text-transform:uppercase;">Lovalte</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.12;">${esc(title)}</h1>
        ${body}
      </div>
    </div>
  </body>
</html>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:28px 0;"><a href="${esc(href)}" style="display:inline-block;border-radius:999px;background:#20242a;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;">${esc(label)}</a></p>`;
}

export class ResendIdentityEmailSender implements IdentityEmailSender {
  constructor(private readonly config: AppConfig) {}

  async sendWelcomeEmail(input: { to: string; businessName?: string }): Promise<void> {
    const name = input.businessName?.trim() || "your business";
    await this.send({
      to: input.to,
      subject: "Welcome to Lovalte",
      text: `Welcome to Lovalte. Your loyalty workspace for ${name} is ready.`,
      html: layout(
        "Welcome to Lovalte",
        `<p style="font-size:16px;line-height:1.6;margin:0;">Your loyalty workspace for <strong>${esc(
          name,
        )}</strong> is ready. You can design cards, issue passes, and track visits from your dashboard.</p>${button(
          "Open Lovalte",
          this.config.APP_BASE_URL,
        )}`,
      ),
    });
  }

  async sendInvitationEmail(input: { to: string; role: string; acceptUrl: string }): Promise<void> {
    await this.send({
      to: input.to,
      subject: "You're invited to Lovalte",
      text: `You've been invited as ${input.role}. Accept the invitation: ${input.acceptUrl}`,
      html: layout(
        "You're invited to Lovalte",
        `<p style="font-size:16px;line-height:1.6;margin:0;">You've been invited as <strong>${esc(
          input.role,
        )}</strong>. Create your password to join the workspace.</p>${button(
          "Accept invitation",
          input.acceptUrl,
        )}`,
      ),
    });
  }

  async sendPasswordResetEmail(input: { to: string; resetUrl: string }): Promise<void> {
    await this.send({
      to: input.to,
      subject: "Reset your Lovalte password",
      text: `Reset your Lovalte password: ${input.resetUrl}`,
      html: layout(
        "Reset your password",
        `<p style="font-size:16px;line-height:1.6;margin:0;">Use this secure link to choose a new password. It expires in one hour.</p>${button(
          "Reset password",
          input.resetUrl,
        )}<p style="font-size:14px;line-height:1.6;color:#6f7a89;margin:0;">If you did not request this, you can ignore this email.</p>`,
      ),
    });
  }

  async sendSupportEmail(input: { subject: string; text: string; html: string }): Promise<void> {
    await this.send({
      to: this.config.SUPPORT_EMAIL,
      subject: input.subject,
      text: input.text,
      html: layout(input.subject, input.html),
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
