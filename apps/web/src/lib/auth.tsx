import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, SESSION_TOKEN_KEY } from "./api";
import { resolveNextPath } from "./nativeNavigation";

export type Session = {
  userId: string;
  tenantId: string;
  role: "owner" | "manager" | "staff";
  email: string;
  /** Platform super-admin (the single configured email). Sees the /admin desk. */
  isAdmin: boolean;
};

const LOCAL_TEST_SESSION_KEY = "lovalte_local_test_session";

const LOCAL_TEST_SESSION: Session = {
  userId: "local-test-user",
  tenantId: "local-test-tenant",
  role: "owner",
  email: "local-test@lovalte.dev",
  isAdmin: false,
};

function canUseLocalTestSession(): boolean {
  return Boolean(import.meta.env.DEV && typeof localStorage !== "undefined");
}

export function enableLocalTestSession(): void {
  if (!canUseLocalTestSession()) return;
  localStorage.setItem(LOCAL_TEST_SESSION_KEY, "1");
}

export function clearLocalTestSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LOCAL_TEST_SESSION_KEY);
}

function getLocalTestSession(): Session | null {
  if (!canUseLocalTestSession()) return null;
  return localStorage.getItem(LOCAL_TEST_SESSION_KEY) === "1" ? LOCAL_TEST_SESSION : null;
}

function hasStoredSessionHint(): boolean {
  if (typeof localStorage === "undefined") return false;
  return (
    localStorage.getItem(LOCAL_TEST_SESSION_KEY) === "1" ||
    Boolean(localStorage.getItem(SESSION_TOKEN_KEY))
  );
}

function resolveAuthenticatedLanding(search: string): string {
  const path = resolveNextPath(search);
  return path === "/login" || path === "/signup" ? "/app" : path;
}

/** Current session via GET /api/v1/auth/me (401 -> error -> treated as logged out). */
export function useSession(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => getLocalTestSession() ?? api.get<Session>("/api/v1/auth/me"),
    enabled: options.enabled ?? true,
    retry: false,
    staleTime: 60_000,
  });
}

const Loading = () => (
  <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", color: "#6F7684" }}>
    Loading…
  </div>
);

/** Route guard: renders the nested app routes when authenticated, else -> /login. */
export function RequireAuth() {
  const location = useLocation();
  const { data, isLoading, isError } = useSession();
  if (isLoading) return <Loading />;
  if (isError || !data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** Public auth pages: guests can sign in, existing sessions go straight to the app. */
export function PublicOnlyAuth() {
  const location = useLocation();
  const hasAuthHint = hasStoredSessionHint();
  const { data, isLoading, isError } = useSession({ enabled: hasAuthHint });
  if (!hasAuthHint) return <Outlet />;
  if (isLoading) return <Loading />;
  if (!isError && data) {
    return <Navigate to={resolveAuthenticatedLanding(location.search)} replace />;
  }
  return <Outlet />;
}

/** Route guard: platform super-admin only. Non-admins go to the app; guests -> /login. */
export function RequireAdmin() {
  const location = useLocation();
  const { data, isLoading, isError } = useSession();
  if (isLoading) return <Loading />;
  if (isError || !data) {
    const next = encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!data.isAdmin) return <Navigate to="/app" replace />;
  return <Outlet />;
}
