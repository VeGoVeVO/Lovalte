import { Navigate, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Session = { userId: string; tenantId: string; role: "owner" | "manager" | "staff" };

/** Current session via GET /api/v1/auth/me (401 -> error -> treated as logged out). */
export function useSession() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Session>("/api/v1/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

/** Route guard: renders the nested app routes when authenticated, else -> /login. */
export function RequireAuth() {
  const { data, isLoading, isError } = useSession();
  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6F7684" }}>
        Loading…
      </div>
    );
  }
  if (isError || !data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
