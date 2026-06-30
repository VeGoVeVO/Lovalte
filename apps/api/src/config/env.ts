import { z } from "zod";

/** Boundary-validated environment. Fail fast at boot if misconfigured. */
const schema = z.object({
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
  // Comma-separated CORS allowlist. Defaults to APP_BASE_URL when unset. The native
  // app build adds its WebView origins, e.g. "https://lovalte.com,capacitor://localhost,https://localhost".
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  WALLET_WEB_SERVICE_URL: z.string().url(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_PASS_TYPE_ID: z.string().optional(),
  APPLE_SIGNER_CERT_PATH: z.string().optional(),
  APPLE_SIGNER_KEY_PATH: z.string().optional(),
  APPLE_SIGNER_KEY_PASSPHRASE: z.string().optional(),
  APPLE_WWDR_PATH: z.string().optional(),
  GOOGLE_WALLET_SA_JSON: z.string().optional(),
  GOOGLE_WALLET_ISSUER_ID: z.string().optional(),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return schema.parse(env);
}
