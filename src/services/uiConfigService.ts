import { DEFAULT_UI_CONFIG } from '@/config/uiConfig.defaults'
import {
  HOME_MODULE_REGISTRY,
  NAV_MODULE_REGISTRY,
  isHomeModuleId,
  isNavModuleId,
  type HomeModuleDefinition,
  type NavModuleDefinition,
} from '@/config/moduleRegistry'
import type {
  NavRow,
  PartialUiConfig,
  UiConfig,
  UiHomeModuleOverride,
  UiNavModuleOverride,
  UiThemeColors,
} from '@/config/uiConfig.types'

const UI_CONFIG_URL = `${import.meta.env.BASE_URL}ui-config.json`
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const THEME_COLOR_KEYS: Array<keyof UiThemeColors> = [
  'dental-50',
  'dental-100',
  'dental-200',
  'dental-300',
  'dental-400',
  'dental-500',
  'dental-600',
  'dental-700',
  'dental-800',
  'dental-900',
  'surface',
  'text',
  'nav-inactive-bg',
  'nav-inactive-text',
  'nav-inactive-border',
  'nav-inactive-hover',
]

export interface ResolvedHomeModule extends HomeModuleDefinition {
  order: number
}

export interface ResolvedNavModule extends NavModuleDefinition {
  order: number
}

let currentUiConfig: UiConfig = structuredClone(DEFAULT_UI_CONFIG)

export function getUiConfig(): UiConfig {
  return currentUiConfig
}

export async function loadUiConfig(): Promise<UiConfig> {
  try {
    const response = await fetch(UI_CONFIG_URL, { cache: 'no-cache' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const payload: unknown = await response.json()
    currentUiConfig = mergeUiConfig(payload)
  } catch (error) {
    console.warn('No se pudo cargar ui-config.json; se usan valores por defecto.', error)
    currentUiConfig = structuredClone(DEFAULT_UI_CONFIG)
  }

  applyVisualTheme(currentUiConfig)
  return currentUiConfig
}

export function mergeUiConfig(raw: unknown): UiConfig {
  const incoming = isRecord(raw) ? (raw as PartialUiConfig) : {}
  const merged: UiConfig = structuredClone(DEFAULT_UI_CONFIG)

  if (typeof incoming.version === 'number') {
    merged.version = incoming.version
  }

  if (incoming.theme) {
    if (typeof incoming.theme.name === 'string' && incoming.theme.name.trim()) {
      merged.theme.name = incoming.theme.name.trim()
    }
    if (typeof incoming.theme.radius === 'string' && incoming.theme.radius.trim()) {
      merged.theme.radius = incoming.theme.radius.trim()
    }
    if (typeof incoming.theme.fontFamily === 'string' && incoming.theme.fontFamily.trim()) {
      merged.theme.fontFamily = incoming.theme.fontFamily.trim()
    }
    if (incoming.theme.colors) {
      for (const key of THEME_COLOR_KEYS) {
        const value = incoming.theme.colors[key]
        if (typeof value === 'string' && HEX_COLOR.test(value.trim())) {
          merged.theme.colors[key] = normalizeHex(value.trim())
        }
      }
    }
  }

  if (incoming.layout && typeof incoming.layout.homeGridColumns === 'number') {
    merged.layout.homeGridColumns = clampGridColumns(incoming.layout.homeGridColumns)
  }

  if (Array.isArray(incoming.modules?.home)) {
    merged.modules.home = mergeHomeModules(incoming.modules.home)
  }

  if (Array.isArray(incoming.modules?.nav)) {
    merged.modules.nav = mergeNavModules(incoming.modules.nav)
  }

  return merged
}

export function applyVisualTheme(config: UiConfig = currentUiConfig): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const { colors, radius, fontFamily } = config.theme

  for (const key of THEME_COLOR_KEYS) {
    const hex = colors[key]
    root.style.setProperty(`--color-${key}`, hex)
    const rgb = hexToRgbChannels(hex)
    if (rgb) {
      root.style.setProperty(`--tw-${key}`, rgb)
    }
  }

  root.style.setProperty('--radius', radius)
  root.style.setProperty('--font-sans', fontFamily)
  root.style.setProperty('--home-grid-cols', String(clampGridColumns(config.layout.homeGridColumns)))
}

export function resolveHomeModules(config: UiConfig = currentUiConfig): ResolvedHomeModule[] {
  const resolved: ResolvedHomeModule[] = []

  for (const [index, item] of config.modules.home.entries()) {
    if (item.enabled === false || !isHomeModuleId(item.id)) continue
    const definition = HOME_MODULE_REGISTRY[item.id]
    resolved.push({
      ...definition,
      title: item.label?.trim() || definition.title,
      desc: item.desc?.trim() || definition.desc,
      order: item.order ?? index + 1,
    })
  }

  return resolved.sort((a, b) => a.order - b.order)
}

export function resolveNavModules(config: UiConfig = currentUiConfig): ResolvedNavModule[] {
  const resolved: ResolvedNavModule[] = []

  for (const [index, item] of config.modules.nav.entries()) {
    if (item.enabled === false || !isNavModuleId(item.id)) continue
    const definition = NAV_MODULE_REGISTRY[item.id]
    const row: NavRow = item.row === 2 ? 2 : item.row === 1 ? 1 : definition.row
    resolved.push({
      ...definition,
      label: item.label?.trim() || definition.label,
      row,
      order: item.order ?? index + 1,
    })
  }

  return resolved.sort((a, b) => a.order - b.order)
}

function mergeHomeModules(overrides: UiHomeModuleOverride[]): UiHomeModuleOverride[] {
  const seen = new Set<string>()
  const merged: UiHomeModuleOverride[] = []

  for (const [index, item] of overrides.entries()) {
    if (!item || typeof item.id !== 'string' || !isHomeModuleId(item.id) || seen.has(item.id)) {
      continue
    }
    seen.add(item.id)
    merged.push({
      id: item.id,
      enabled: item.enabled !== false,
      order: typeof item.order === 'number' ? item.order : index + 1,
      ...(typeof item.label === 'string' ? { label: item.label } : {}),
      ...(typeof item.desc === 'string' ? { desc: item.desc } : {}),
    })
  }

  return merged.length > 0 ? merged : structuredClone(DEFAULT_UI_CONFIG.modules.home)
}

function mergeNavModules(overrides: UiNavModuleOverride[]): UiNavModuleOverride[] {
  const seen = new Set<string>()
  const merged: UiNavModuleOverride[] = []

  for (const [index, item] of overrides.entries()) {
    if (!item || typeof item.id !== 'string' || !isNavModuleId(item.id) || seen.has(item.id)) {
      continue
    }
    seen.add(item.id)
    const row: NavRow | undefined = item.row === 1 || item.row === 2 ? item.row : undefined
    merged.push({
      id: item.id,
      enabled: item.enabled !== false,
      order: typeof item.order === 'number' ? item.order : index + 1,
      ...(row ? { row } : {}),
      ...(typeof item.label === 'string' ? { label: item.label } : {}),
    })
  }

  return merged.length > 0 ? merged : structuredClone(DEFAULT_UI_CONFIG.modules.nav)
}

function clampGridColumns(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_CONFIG.layout.homeGridColumns
  return Math.min(6, Math.max(1, Math.round(value)))
}

function normalizeHex(value: string): string {
  if (value.length === 4) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase()
  }
  return value.toLowerCase()
}

export function hexToRgbChannels(hex: string): string | null {
  const normalized = HEX_COLOR.test(hex) ? normalizeHex(hex) : null
  if (!normalized) return null
  const value = Number.parseInt(normalized.slice(1), 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `${r} ${g} ${b}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
