export const DENTAL_COLOR_STEPS = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
] as const

export type DentalColorStep = (typeof DENTAL_COLOR_STEPS)[number]

export type DentalColorKey = `dental-${DentalColorStep}`

export type ChromeColorKey =
  | 'surface'
  | 'text'
  | 'nav-inactive-bg'
  | 'nav-inactive-text'
  | 'nav-inactive-border'
  | 'nav-inactive-hover'

export type UiColorKey = DentalColorKey | ChromeColorKey

export type NavRow = 1 | 2

export interface UiThemeColors {
  'dental-50': string
  'dental-100': string
  'dental-200': string
  'dental-300': string
  'dental-400': string
  'dental-500': string
  'dental-600': string
  'dental-700': string
  'dental-800': string
  'dental-900': string
  surface: string
  text: string
  'nav-inactive-bg': string
  'nav-inactive-text': string
  'nav-inactive-border': string
  'nav-inactive-hover': string
}

export interface UiThemeConfig {
  name: string
  colors: UiThemeColors
  radius: string
  fontFamily: string
}

export interface UiLayoutConfig {
  homeGridColumns: number
}

export interface UiHomeModuleOverride {
  id: string
  enabled?: boolean
  order?: number
  label?: string
  desc?: string
}

export interface UiNavModuleOverride {
  id: string
  enabled?: boolean
  order?: number
  row?: NavRow
  label?: string
}

export interface UiModulesConfig {
  home: UiHomeModuleOverride[]
  nav: UiNavModuleOverride[]
}

export interface UiConfig {
  version: number
  theme: UiThemeConfig
  layout: UiLayoutConfig
  modules: UiModulesConfig
}

export type PartialUiConfig = {
  version?: number
  theme?: {
    name?: string
    colors?: Partial<UiThemeColors>
    radius?: string
    fontFamily?: string
  }
  layout?: {
    homeGridColumns?: number
  }
  modules?: {
    home?: UiHomeModuleOverride[]
    nav?: UiNavModuleOverride[]
  }
}
