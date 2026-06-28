import { Routes, Route } from "react-router-dom";
import { globalCss, AmbientBackground } from "./design-system/halo";
import { APP_VERSION } from "./version";
import { LovalteLanding } from "./features/marketing/LovalteLanding";
import { RequireAuth } from "./lib/auth";
import { LoginPage } from "./features/auth/LoginPage";
import { SignupPage } from "./features/auth/SignupPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { BuilderPage } from "./features/builder/BuilderPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import { MembersPage } from "./features/members/MembersPage";
import { StaffPage } from "./features/staff/StaffPage";
import { IssuePassPage } from "./features/wallet/IssuePassPage";
import { EnrollPage } from "./features/wallet/EnrollPage";
import { ScanPage } from "./features/scan/ScanPage";

/* Route map. Marketing landing (Halo) at '/'; auth pages standalone; the whole
   authenticated app (/app/*) sits behind the RequireAuth guard (GET /auth/me). */
export function App() {
  return (
    <>
      <style>{globalCss}</style>
      <AmbientBackground />
      <Routes>
        <Route path="/" element={<LovalteLanding />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/enroll" element={<EnrollPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/builder" element={<BuilderPage />} />
          <Route path="/app/analytics" element={<AnalyticsPage />} />
          <Route path="/app/members" element={<MembersPage />} />
          <Route path="/app/staff" element={<StaffPage />} />
          <Route path="/app/issue" element={<IssuePassPage />} />
          <Route path="/app/scan" element={<ScanPage />} />
        </Route>

        <Route path="*" element={<LovalteLanding />} />
      </Routes>
      <span
        aria-hidden="true"
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
