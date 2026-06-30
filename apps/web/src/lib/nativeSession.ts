import { Capacitor } from "@capacitor/core";
import { SESSION_TOKEN_KEY } from "./api";

type AuthPayload = { token?: string };

function isNativeApp(): boolean {
  return Capacitor.getPlatform() !== "web";
}

export function persistNativeSession(payload: AuthPayload): void {
  if (!isNativeApp() || !payload.token || typeof localStorage === "undefined") return;
  localStorage.setItem(SESSION_TOKEN_KEY, payload.token);
}

export function clearNativeSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SESSION_TOKEN_KEY);
}
