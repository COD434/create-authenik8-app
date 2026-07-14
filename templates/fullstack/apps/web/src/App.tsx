import { Route, Routes } from "react-router-dom";
import { AdminRoute, ProtectedRoute } from "./auth/RouteGuards";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/auth/RecoveryPages";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { OAuthCallbackPage } from "./pages/auth/OAuthCallbackPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsPage, ProjectDetailPage, ProjectFormPage } from "./features/projects/ProjectPages";
import { ProfilePage } from "./pages/settings/ProfilePage";
import { SecurityPage } from "./pages/settings/SecurityPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { AuditPage } from "./pages/admin/AuditPage";
import { ForbiddenPage, NotFoundPage } from "./pages/StatusPages";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<ProjectFormPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="projects/:id/edit" element={<ProjectFormPage />} />
          <Route path="settings/profile" element={<ProfilePage />} />
          <Route path="settings/security" element={<SecurityPage />} />
          <Route path="forbidden" element={<ForbiddenPage />} />
          <Route element={<AdminRoute />}>
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/audit" element={<AuditPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
