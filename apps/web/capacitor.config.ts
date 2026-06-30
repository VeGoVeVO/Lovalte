import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Lovalte merchant Android app.
 *
 * Bundles the Vite build (webDir: dist) into a native WebView shell. The WebView
 * origin is https://localhost (androidScheme: 'https'); API calls go to the absolute
 * API origin baked at build time via `npm run build:app` (vite mode 'app' →
 * APP_API_BASE in vite.config.ts → https://lovalte.com). The API must allow
 * https://localhost in CORS and accept the bearer token (see P1 changes).
 *
 * iOS later: `npx cap add ios` reuses this same config + bundle.
 */
const config: CapacitorConfig = {
  appId: "com.lovalte.app",
  appName: "Lovalte",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
