import { useEffect } from "react";
import { Navigate, Routes, Route, useNavigate } from "react-router-dom";
import { globalCss, AmbientBackground } from "./design-system/halo";
import { APP_VERSION } from "./version";
import { PublicOnlyAuth, RequireAuth, RequireAdmin } from "./lib/auth";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { AcceptInvitationPage } from "./features/auth/AcceptInvitationPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./features/auth/PasswordResetPage";
import { BuilderPage } from "./features/builder/BuilderPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { MembersPage } from "./features/members/MembersPage";
import { StaffPage } from "./features/staff/StaffPage";
import { SupportPage } from "./features/support/SupportPage";
import { AdminPage } from "./features/admin/AdminPage";
import { EnrollPage } from "./features/wallet/EnrollPage";
import { ScanPage } from "./features/scan/ScanPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { registerNativeUrlHandler } from "./lib/nativeNavigation";

/* Route map. Auth pages are public; the authenticated app (/app/*) sits behind
   the RequireAuth guard (GET /auth/me). */
export function App() {
  const navigate = useNavigate();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    registerNativeUrlHandler((path) => {
      navigate(path);
    }).then((listener) => {
      cleanup = () => {
        void listener?.remove();
      };
    });

    return () => {
      cleanup?.();
    };
  }, [navigate]);

  return (
    <>
      <style>{globalCss}</style>
      <AmbientBackground />
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route element={<PublicOnlyAuth />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
        </Route>
        <Route path="/enroll" element={<EnrollPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AnalyticsPage />} />
          <Route path="/app/builder" element={<BuilderPage />} />
          <Route path="/app/members" element={<MembersPage />} />
          <Route path="/app/staff" element={<StaffPage />} />
          <Route path="/app/issue" element={<Navigate to="/app/builder" replace />} />
          <Route path="/app/scan" element={<ScanPage />} />
          <Route path="/app/settings" element={<SettingsPage />} />
          <Route path="/app/support" element={<SupportPage />} />
          <Route path="/support" element={<SupportPage />} />
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <span
        aria-hidden="true"
        className="lvt-ver"
        style={{
          position: "fixed",
          bottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
          right: 10,
          fontSize: "0.62rem",
          color: "rgba(32,36,42,.28)",
          letterSpacing: ".03em",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        v{APP_VERSION}
      </span>
    </>
  );
}
