import { Routes, Route } from "react-router-dom";
import { globalCss } from "./design-system/halo";
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
    </>
  );
}
