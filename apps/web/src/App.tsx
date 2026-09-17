import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingState } from "./components/ui";
import { useLocale } from "./i18n";

const LoginPage = lazy(async () => ({ default: (await import("./pages/LoginPage")).LoginPage }));
const ResetPasswordPage = lazy(async () => ({ default: (await import("./pages/ResetPasswordPage")).ResetPasswordPage }));
const OverviewPage = lazy(async () => ({ default: (await import("./pages/OverviewPage")).OverviewPage }));
const CasesPage = lazy(async () => ({ default: (await import("./pages/CasesPage")).CasesPage }));
const NewCasePage = lazy(async () => ({ default: (await import("./pages/NewCasePage")).NewCasePage }));
const CaseDetailPage = lazy(async () => ({ default: (await import("./pages/CaseDetailPage")).CaseDetailPage }));
const IncidentsPage = lazy(async () => ({ default: (await import("./pages/IncidentsPage")).IncidentsPage }));
const KnowledgePage = lazy(async () => ({ default: (await import("./pages/KnowledgePage")).KnowledgePage }));
const ServicesPage = lazy(async () => ({ default: (await import("./pages/ServicesPage")).ServicesPage }));
const UsersPage = lazy(async () => ({ default: (await import("./pages/UsersPage")).UsersPage }));
const SystemPage = lazy(async () => ({ default: (await import("./pages/SystemPage")).SystemPage }));
const ProfilePage = lazy(async () => ({ default: (await import("./pages/ProfilePage")).ProfilePage }));
const NotFoundPage = lazy(async () => ({ default: (await import("./pages/NotFoundPage")).NotFoundPage }));

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  const { text } = useLocale();
  if (loading) {
    return (
      <div className="boot-screen">
        <LoadingState label={text("Đang mở không gian làm việc", "Opening your workspace")} />
      </div>
    );
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user && ["manager", "org_admin", "platform_admin"].includes(user.role) ? (
    children
  ) : (
    <Navigate to="/overview" replace />
  );
}

function IncidentRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user && user.role !== "requester" ? children : <Navigate to="/overview" replace />;
}

export default function App() {
  const { text } = useLocale();
  return (
    <ErrorBoundary><Suspense
      fallback={
        <div className="boot-screen">
          <LoadingState label={text("Đang tải không gian làm việc", "Loading workspace")} />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/cases" element={<CasesPage />} />
            <Route path="/cases/new" element={<NewCasePage />} />
            <Route path="/cases/:id" element={<CaseDetailPage />} />
            <Route
              path="/incidents"
              element={
                <IncidentRoute>
                  <IncidentsPage />
                </IncidentRoute>
              }
            />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/system" element={<AdminRoute><SystemPage /></AdminRoute>} />
            <Route
              path="/services"
              element={
                <AdminRoute>
                  <ServicesPage />
                </AdminRoute>
              }
            />
            <Route
              path="/users"
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense></ErrorBoundary>
  );
}
