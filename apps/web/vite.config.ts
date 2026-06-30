import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The native app build (`vite build --mode app`) bakes the absolute API origin so the
// cross-origin Capacitor WebView reaches the deployed API. Web/dev builds leave it
// empty (same-origin + dev proxy). Kept here — committed, non-secret — rather than in
// an .env file (the repo policy forbids committing env files). To target a LAN IP for
// local testing, change APP_API_BASE to e.g. "http://192.168.1.20:3001".
const APP_API_BASE = "https://lovalte.com";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  define: {
    __API_BASE__: JSON.stringify(mode === "app" ? APP_API_BASE : ""),
  },
  server: {
    port: 5173,
    // proxy API calls in dev so the SPA and API share an origin
    proxy: {
      "/api": "http://localhost:3001",
      "/wallet": "http://localhost:3001",
    },
  },
}));
