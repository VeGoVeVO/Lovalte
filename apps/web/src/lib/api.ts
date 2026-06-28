/* Thin typed fetch client. Shares the API origin via the Vite dev proxy
   (/api, /wallet -> :3001). Cookies (session) sent with credentials:'include'. */
export type ApiError = { code: string; message: string; details?: unknown };

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // Spread `...rest` first, then set headers LAST so a caller's `opts` (which may
  // carry `headers: undefined`) can never clobber the Content-Type. Without this,
  // POST bodies are sent without application/json and the API sees a raw string.
  const { headers: optHeaders, ...rest } = opts;
  const res = await fetch(path, {
    credentials: "include",
    ...rest,
    headers: { "Content-Type": "application/json", ...(optHeaders ?? {}) },
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
  del: <T>(path: string) => req<T>(path, { method: "DELETE" }),
};
