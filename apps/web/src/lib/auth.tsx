import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Session = {
  userId: string;
  tenantId: string;
  role: "owner" | "manager" | "staff";
  email: string;
  /** Platform super-admin (the single configured email). Sees the /admin desk. */
  isAdmin: boolean;
};

/** Current session via GET /api/v1/auth/me (401 -> error -> treated as logged out). */
export function useSession() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Session>("/api/v1/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

const Loading = () => (
  <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6F7684" }}>
    Loading…
  </div>
);

/** Route guard: renders the nested app routes when authenticated, else -> /login. */
export function RequireAuth() {
  const { data, isLoading, isError } = useSession();
  if (isLoading) return <Loading />;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Route guard: platform super-admin only. Non-admins go to the app; guests -> /login. */
export function RequireAdmin() {
  const { data, isLoading, isError } = useSession();
  if (isLoading) return <Loading />;
  if (isError || !data) return <Navigate to="/login" replace />;
  if (!data.isAdmin) return <Navigate to="/app" replace />;
  return <Outlet />;
}
