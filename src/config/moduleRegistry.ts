import {
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileJson,
  Share2,
  Stethoscope,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@/utils/permissions'
import type { NavRow } from './uiConfig.types'

export type HomeModuleId =
  | 'nuevo-paciente'
  | 'lista-pacientes'
  | 'agenda'
  | 'exportar-historia'
  | 'exportar-fhir'
  | 'exportar-rips'
  | 'historia-clinica'
  | 'precios'

export type NavModuleId =
  | 'nuevo-paciente'
  | 'pacientes-activos'
  | 'pacientes-valorados'
  | 'pacientes-terminados'
  | 'agenda'
  | 'historia-clinica'
  | 'precios'
  | 'cuentas-facturas'
  | 'rips'
  | 'fhir'
  | 'catalogos'
  | 'copias'
  | 'usuarios'
  | 'auditoria'
  | 'suscripciones'

export interface HomeModuleDefinition {
  id: HomeModuleId
  title: string
  desc: string
  to: string
  icon: LucideIcon
  accent: string
  permission: Permission
}

export interface NavModuleDefinition {
  id: NavModuleId
  label: string
  to: string
  permission: Permission
  row: NavRow
  isActive?: (pathname: string) => boolean
}

function isPatientsListActive(pathname: string): boolean {
  return (
    pathname === '/pacientes' ||
    (pathname.startsWith('/pacientes/') && !pathname.startsWith('/pacientes/nuevo'))
  )
}

function isValuatedPatientsActive(pathname: string): boolean {
  return pathname === '/pacientes-valorados'
}

function isCompletedPatientsActive(pathname: string): boolean {
  return pathname === '/pacientes-terminados'
}

export const HOME_MODULE_REGISTRY: Record<HomeModuleId, HomeModuleDefinition> = {
  'nuevo-paciente': {
    id: 'nuevo-paciente',
    title: 'Nuevo Paciente',
    desc: 'Registrar paciente con datos RIPS',
    to: '/pacientes/nuevo',
    icon: UserPlus,
    accent:
      'bg-gradient-to-br from-dental-400 to-dental-600 text-white shadow-lg shadow-dental-500/25 ring-4 ring-dental-100',
    permission: 'patients.write',
  },
  'lista-pacientes': {
    id: 'lista-pacientes',
    title: 'Lista de Pacientes',
    desc: 'Consultar y gestionar pacientes',
    to: '/pacientes',
    icon: Users,
    accent:
      'bg-gradient-to-br from-sky-400 to-dental-600 text-white shadow-lg shadow-sky-500/20 ring-4 ring-sky-100',
    permission: 'patients.read',
  },
  agenda: {
    id: 'agenda',
    title: 'Agenda Clínica',
    desc: 'Citas por profesional y unidad',
    to: '/agenda',
    icon: CalendarDays,
    accent:
      'bg-gradient-to-br from-dental-600 to-dental-800 text-white shadow-lg shadow-dental-700/25 ring-4 ring-dental-100',
    permission: 'agenda.read',
  },
  'exportar-historia': {
    id: 'exportar-historia',
    title: 'Exportar Historia Clínica',
    desc: 'RDA y portabilidad — JSON, FHIR, XML, PDF',
    to: '/portabilidad',
    icon: Share2,
    accent:
      'bg-gradient-to-br from-violet-400 to-violet-600 text-white shadow-lg shadow-violet-500/25 ring-4 ring-violet-100',
    permission: 'export.portability',
  },
  'exportar-fhir': {
    id: 'exportar-fhir',
    title: 'Exportar FHIR',
    desc: 'Bundle FHIR R4 para interoperabilidad',
    to: '/fhir',
    icon: FileJson,
    accent:
      'bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-4 ring-indigo-100',
    permission: 'export.fhir',
  },
  'exportar-rips': {
    id: 'exportar-rips',
    title: 'Exportar RIPS',
    desc: 'Generar JSON RIPS para FEV-Salud',
    to: '/rips',
    icon: ClipboardList,
    accent:
      'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-100',
    permission: 'export.rips',
  },
  'historia-clinica': {
    id: 'historia-clinica',
    title: 'Historia Clínica',
    desc: 'CIE-10, odontograma y firma Ley 527',
    to: '/pacientes',
    icon: Stethoscope,
    accent:
      'bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-lg shadow-slate-500/25 ring-4 ring-slate-200',
    permission: 'clinical.read',
  },
  precios: {
    id: 'precios',
    title: 'Mis Precios y Procedimientos',
    desc: 'Presupuestos y tarifas por procedimiento',
    to: '/precios',
    icon: CircleDollarSign,
    accent:
      'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/25 ring-4 ring-orange-100',
    permission: 'prices.manage',
  },
}

export const NAV_MODULE_REGISTRY: Record<NavModuleId, NavModuleDefinition> = {
  'nuevo-paciente': {
    id: 'nuevo-paciente',
    label: 'Nuevo Paciente',
    to: '/pacientes/nuevo',
    permission: 'patients.write',
    row: 1,
  },
  'pacientes-activos': {
    id: 'pacientes-activos',
    label: 'Pacientes Activos',
    to: '/pacientes',
    permission: 'patients.read',
    row: 1,
    isActive: isPatientsListActive,
  },
  'pacientes-valorados': {
    id: 'pacientes-valorados',
    label: 'Pacientes Valorados',
    to: '/pacientes-valorados',
    permission: 'patients.read',
    row: 1,
    isActive: isValuatedPatientsActive,
  },
  'pacientes-terminados': {
    id: 'pacientes-terminados',
    label: 'Pacientes Terminados',
    to: '/pacientes-terminados',
    permission: 'patients.read',
    row: 1,
    isActive: isCompletedPatientsActive,
  },
  agenda: {
    id: 'agenda',
    label: 'Agenda',
    to: '/agenda',
    permission: 'agenda.read',
    row: 1,
  },
  'historia-clinica': {
    id: 'historia-clinica',
    label: 'Historia Clínica',
    to: '/portabilidad',
    permission: 'export.portability',
    row: 1,
  },
  precios: {
    id: 'precios',
    label: 'Mis Precios y Procedimientos',
    to: '/precios',
    permission: 'prices.manage',
    row: 1,
  },
  'cuentas-facturas': {
    id: 'cuentas-facturas',
    label: 'Mis Cuentas y Facturas',
    to: '/cuentas-facturas',
    permission: 'invoices.read',
    row: 2,
  },
  rips: {
    id: 'rips',
    label: 'RIPS',
    to: '/rips',
    permission: 'export.rips',
    row: 2,
  },
  fhir: {
    id: 'fhir',
    label: 'FHIR',
    to: '/fhir',
    permission: 'export.fhir',
    row: 2,
  },
  catalogos: {
    id: 'catalogos',
    label: 'Catálogos',
    to: '/catalogos',
    permission: 'catalogs.manage',
    row: 2,
  },
  copias: {
    id: 'copias',
    label: 'Copias',
    to: '/respaldos',
    permission: 'backups.manage',
    row: 2,
  },
  usuarios: {
    id: 'usuarios',
    label: 'Usuarios',
    to: '/usuarios',
    permission: 'users.manage',
    row: 2,
  },
  auditoria: {
    id: 'auditoria',
    label: 'Auditoría',
    to: '/auditoria',
    permission: 'audit.read',
    row: 2,
  },
  suscripciones: {
    id: 'suscripciones',
    label: 'Suscripciones',
    to: '/admin/usuarios',
    permission: 'audit.read',
    row: 2,
  },
}

export function isHomeModuleId(id: string): id is HomeModuleId {
  return id in HOME_MODULE_REGISTRY
}

export function isNavModuleId(id: string): id is NavModuleId {
  return id in NAV_MODULE_REGISTRY
}
