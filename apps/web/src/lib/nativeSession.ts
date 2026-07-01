import { SESSION_TOKEN_KEY } from "./api";
import { clearLocalTestSession } from "./auth";

type AuthPayload = { token?: string };

export function persistNativeSession(payload: AuthPayload): void {
  if (!payload.token || typeof localStorage === "undefined") return;
  clearLocalTestSession();
  localStorage.setItem(SESSION_TOKEN_KEY, payload.token);
}

export function clearNativeSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SESSION_TOKEN_KEY);
  clearLocalTestSession();
}
