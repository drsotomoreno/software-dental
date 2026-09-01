import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { MainLayout } from '@/components/layout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { PermissionRoute } from '@/components/auth/PermissionRoute'
import {
  HomePage,
  LandingPage,
  LoginPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  NewPatientPage,
  PatientListPage,
  ValuatedPatientsPage,
  CompletedPatientsPage,
  PatientDetailPage,
  AgendaPage,
  ProfilePage,
  PricingPage,
  SubscriptionPage,
  RipsExportPage,
  FhirExportPage,
  AuditLogPage,
  UsersManagementPage,
  BackupsPage,
  ClinicalHistoryExportPage,
  CatalogManagementPage,
  InvoicesAccountsPage,
} from '@/pages'

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="app" element={<HomePage />} />
              <Route element={<PermissionRoute permission="patients.write" />}>
                <Route path="pacientes/nuevo" element={<NewPatientPage />} />
              </Route>
              <Route element={<PermissionRoute permission="patients.read" />}>
                <Route path="pacientes" element={<PatientListPage />} />
                <Route path="pacientes-valorados" element={<ValuatedPatientsPage />} />
                <Route path="pacientes-terminados" element={<CompletedPatientsPage />} />
                <Route path="pacientes/:id" element={<PatientDetailPage />} />
              </Route>
              <Route element={<PermissionRoute permission="agenda.read" />}>
                <Route path="agenda" element={<AgendaPage />} />
              </Route>
              <Route path="perfil" element={<ProfilePage />} />
              <Route element={<PermissionRoute permission="prices.manage" />}>
                <Route path="precios" element={<PricingPage />} />
              </Route>
              <Route element={<PermissionRoute permission="invoices.read" />}>
                <Route path="cuentas-facturas" element={<InvoicesAccountsPage />} />
              </Route>
              <Route path="suscripcion" element={<SubscriptionPage />} />
              <Route element={<PermissionRoute permission="export.rips" />}>
                <Route path="rips" element={<RipsExportPage />} />
              </Route>
              <Route element={<PermissionRoute permission="export.fhir" />}>
                <Route path="fhir" element={<FhirExportPage />} />
              </Route>
              <Route element={<PermissionRoute permission="audit.read" />}>
                <Route path="auditoria" element={<AuditLogPage />} />
              </Route>
              <Route element={<PermissionRoute permission="users.manage" />}>
                <Route path="usuarios" element={<UsersManagementPage />} />
              </Route>
              <Route element={<PermissionRoute permission="backups.manage" />}>
                <Route path="respaldos" element={<BackupsPage />} />
              </Route>
              <Route element={<PermissionRoute permission="export.portability" />}>
                <Route path="portabilidad" element={<ClinicalHistoryExportPage />} />
              </Route>
              <Route element={<PermissionRoute permission="catalogs.manage" />}>
                <Route path="catalogos" element={<CatalogManagementPage />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
