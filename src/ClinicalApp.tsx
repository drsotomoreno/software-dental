import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { MainLayout } from '@/components/layout'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { RequireSuperAdmin } from '@/components/auth/RequireSuperAdmin'
import { PermissionRoute } from '@/components/auth/PermissionRoute'
import { SuperAdminLayout } from '@/components/superadmin/SuperAdminLayout'
import {
  HomePage,
  LandingPage,
  DemoPage,
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
  WelcomeTrialPage,
  AdminSubscriptionUsersPage,
  SuperAdminDashboardPage,
  SuperAdminRegistrationsPage,
  SuperAdminClinicsPage,
  SuperAdminSubscriptionsPage,
  SuperAdminMonitoringPage,
  SuperAdminSettingsPage,
} from '@/pages'
import { seedDemoData } from '@/db/database'
import { hydrateBillingSettingsFromIndexedDb } from '@/services/billingModalityService'
import { installInvoiceImmutabilityFetchGuard } from '@/bootstrap/invoiceImmutabilityGuard'
import { KioskSignatureBridge } from '@/components/kiosk/KioskSignatureBridge'
import './dictation-app'
import './agenda-app'

installInvoiceImmutabilityFetchGuard()

/**
 * Árbol clínico: aquí viven Dexie, Auth y la sincronización offline.
 * Solo se monta cuando la URL no es /kiosco/...
 */
export default function ClinicalApp() {
  useEffect(() => {
    seedDemoData()
      .then(() => hydrateBillingSettingsFromIndexedDb())
      .catch((error) => {
        console.error('No se pudo inicializar datos demo:', error)
      })
  }, [])

  return (
    <AuthProvider>
      <KioskSignatureBridge />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="welcome-trial" element={<WelcomeTrialPage />} />
          <Route path="subscription-plans" element={<WelcomeTrialPage />} />
          <Route element={<RequireSuperAdmin />}>
            <Route element={<SuperAdminLayout />}>
              <Route path="superadmin" element={<SuperAdminDashboardPage />} />
              <Route path="superadmin/registros" element={<SuperAdminRegistrationsPage />} />
              <Route path="superadmin/clinicas" element={<SuperAdminClinicsPage />} />
              <Route path="superadmin/suscripciones" element={<SuperAdminSubscriptionsPage />} />
              <Route path="superadmin/monitoreo" element={<SuperAdminMonitoringPage />} />
              <Route path="superadmin/configuracion" element={<SuperAdminSettingsPage />} />
            </Route>
          </Route>
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
            <Route path="admin/usuarios" element={<AdminSubscriptionUsersPage />} />
            <Route element={<PermissionRoute permission="admin.registered_users" />}>
              <Route
                path="admin/usuarios-registrados"
                element={<Navigate to="/superadmin/registros" replace />}
              />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
