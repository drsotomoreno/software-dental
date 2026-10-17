import type { ScheduleColumn } from '@/types/appointment'

export interface ChairDisplayStyle {
  bg100: string
  text700: string
  border500: string
  dot500: string
  ring: string
}

const CHAIR_PALETTE: ChairDisplayStyle[] = [
  {
    bg100: 'bg-sky-100',
    text700: 'text-sky-800',
    border500: 'border-sky-500',
    dot500: 'bg-sky-500',
    ring: 'ring-sky-300',
  },
  {
    bg100: 'bg-violet-100',
    text700: 'text-violet-800',
    border500: 'border-violet-500',
    dot500: 'bg-violet-500',
    ring: 'ring-violet-300',
  },
  {
    bg100: 'bg-amber-100',
    text700: 'text-amber-900',
    border500: 'border-amber-500',
    dot500: 'bg-amber-500',
    ring: 'ring-amber-300',
  },
  {
    bg100: 'bg-emerald-100',
    text700: 'text-emerald-800',
    border500: 'border-emerald-500',
    dot500: 'bg-emerald-500',
    ring: 'ring-emerald-300',
  },
  {
    bg100: 'bg-rose-100',
    text700: 'text-rose-800',
    border500: 'border-rose-500',
    dot500: 'bg-rose-500',
    ring: 'ring-rose-300',
  },
  {
    bg100: 'bg-cyan-100',
    text700: 'text-cyan-800',
    border500: 'border-cyan-500',
    dot500: 'bg-cyan-500',
    ring: 'ring-cyan-300',
  },
]

export function getChairDisplayStyle(columnIndex: number): ChairDisplayStyle {
  return CHAIR_PALETTE[columnIndex % CHAIR_PALETTE.length]
}

export function buildColumnIndexMap(columns: ScheduleColumn[]): Map<string, number> {
  const map = new Map<string, number>()
  columns.forEach((column, index) => map.set(column.id, index))
  return map
}

export function getChairAbbreviation(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '—'
  const words = trimmed.split(/\s+/)
  if (words.length === 1) return trimmed.slice(0, 3)
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}
