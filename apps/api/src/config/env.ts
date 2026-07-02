import { z } from "zod";

/** Boundary-validated environment. Fail fast at boot if misconfigured. */
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  QR_TOKEN_SECRET: z.string().min(16),
  // Single platform super-admin email. This account (and only this one) sees the
  // cross-tenant /admin support desk. Env-overridable; defaults to the founder.
  ADMIN_EMAIL: z.string().email().default("wtsouli@gmail.com"),
  APP_BASE_URL: z.string().url(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Lovalte <hello@lovalte.com>"),
  SUPPORT_EMAIL: z.string().email().default("support@lovalte.com"),
  // Comma-separated CORS allowlist. Defaults to APP_BASE_URL when unset. The native
  // app build adds its WebView origins, e.g. "https://lovalte.com,capacitor://localhost,https://localhost".
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  WALLET_WEB_SERVICE_URL: z.string().url(),
  APPLE_TEAM_ID: z.string().optional(),
  // Comma-separated accepted audiences for Sign in with Apple identity tokens.
  // Native iOS tokens use the app bundle id; web tokens use the Apple Services ID.
  APPLE_SIGN_IN_CLIENT_IDS: z.string().default("com.lovalte.app,com.lovalte.web"),
  APPLE_PASS_TYPE_ID: z.string().optional(),
  APPLE_SIGNER_CERT_PATH: z.string().optional(),
  APPLE_SIGNER_KEY_PATH: z.string().optional(),
  APPLE_SIGNER_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WWDR_PATH: z.string().optional(),
  GOOGLE_WALLET_SA_JSON: z.string().optional(),
  GOOGLE_WALLET_ISSUER_ID: z.string().optional(),
  // APNs (delivery context push notifications) - .p8 key path + the two IDs shown
  // in the Apple Developer portal. Optional outside production (ApnsAdapter falls
  // back to a no-op log when absent).
  APNS_KEY_PATH: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
});

/**
 * Production boot guard: the Apple Wallet pipeline (signing + push) is useless
 * half-configured, so refuse to boot with a single clear message listing every
 * missing var instead of failing opaquely deep in a request handler later.
 */
const schema = baseSchema.superRefine((val, ctx) => {
  if (val.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!val.APNS_KEY_PATH) missing.push("APNS_KEY_PATH");
  if (!val.APNS_KEY_ID) missing.push("APNS_KEY_ID");
  if (!val.APNS_TEAM_ID) missing.push("APNS_TEAM_ID");
  if (!val.APPLE_TEAM_ID || val.APPLE_TEAM_ID.length !== 10) {
    missing.push("APPLE_TEAM_ID (must be exactly 10 characters)");
  }
  if (!val.APPLE_PASS_TYPE_ID) missing.push("APPLE_PASS_TYPE_ID");
  if (!val.APPLE_SIGNER_CERT_PATH) missing.push("APPLE_SIGNER_CERT_PATH");
  if (!val.APPLE_SIGNER_KEY_PATH) missing.push("APPLE_SIGNER_KEY_PATH");
  if (!val.APPLE_WWDR_PATH) missing.push("APPLE_WWDR_PATH");
  if (!val.WALLET_WEB_SERVICE_URL.startsWith("https://")) {
    missing.push("WALLET_WEB_SERVICE_URL (must start with https://)");
  }

  if (missing.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Missing/invalid required production env vars: ${missing.join(", ")}`,
    });
  }
});

export type AppConfig = z.infer<typeof baseSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(env);
}
