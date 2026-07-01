/* Thin typed fetch client. Web/dev shares the API origin via the Vite dev proxy
   (/api, /wallet -> :3001) and sends cookies. Native builds use __API_BASE__.
   Login also stores the returned session token so both web and iOS can restore
   auth after the browser/app process is closed. */
export type ApiError = { code: string; message: string; details?: unknown };

// Injected by vite.config.ts `define`: absolute API origin in the native app build
// (mode 'app'), empty string for web/dev (same-origin + dev proxy).
declare const __API_BASE__: string;
const API_BASE = __API_BASE__;
export const SESSION_TOKEN_KEY = "lovalte_session_token";

export function apiUrl(path: string): string {
  return API_BASE + (path.startsWith("/") ? path : `/${path}`);
}

export function getSessionToken(): string | null {
  return typeof localStorage !== "undefined" ? localStorage.getItem(SESSION_TOKEN_KEY) : null;
}

export function apiAssetUrl(ref: string | null | undefined): string {
  if (!ref) return "";
  if (/^(?:data:|blob:|https?:\/\/)/i.test(ref)) return ref;
  return apiUrl(ref);
}

function bearerHeader(): Record<string, string> {
  const t = getSessionToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // Spread `...rest` first, then set headers LAST so a caller's `opts` (which may
  // carry `headers: undefined`) can never clobber the Content-Type. Without this,
  // POST bodies are sent without application/json and the API sees a raw string.
  const { headers: optHeaders, ...rest } = opts;
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...rest,
    headers: { "Content-Type": "application/json", ...bearerHeader(), ...(optHeaders ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw (body?.error ?? { code: "INTERNAL", message: res.statusText }) as ApiError;
  }
  // API success envelope is { data: ... } - unwrap it for callers.
  return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}

export const api = {
  get: <T>(path: string) => req<T>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    req<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      headers,
    }),
  patch: <T>(path: string, body?: unknown) =>
    req<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    req<T>(path, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
};
