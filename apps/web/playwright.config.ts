import { defineConfig } from "@playwright/test";

const executablePath =
  process.platform === "darwin"
    ? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    : process.platform === "win32"
      ? "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe"
      : undefined;

/* Frontend e2e against the running dev server (http://localhost:5173), using the
   locally-installed Brave (Chromium) - Playwright's own Chrome download needs admin. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
});
