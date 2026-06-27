/**
 * App version derived from the git commit count at build time (injected as
 * VITE_APP_VERSION by deploy.sh → the web Dockerfile). Scheme: patch rolls 0→99
 * then bumps minor; minor rolls 0→9 then bumps major (so 0.0.99 → 0.1.0 → … →
 * 0.9.99 → 1.0.0). Falls back to a dev marker outside a built deploy.
 */
const env = import.meta.env as unknown as Record<string, string | undefined>;
export const APP_VERSION = env.VITE_APP_VERSION || "0.0.0-dev";
