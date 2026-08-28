import type { RehabArchProsthesisScope } from './types'

export function isUpperArchTooth(fdi: number): boolean {
  const quadrant = Math.floor(fdi / 10)
  return quadrant === 1 || quadrant === 2
}

export function isLowerArchTooth(fdi: number): boolean {
  const quadrant = Math.floor(fdi / 10)
  return quadrant === 3 || quadrant === 4
}

export function isArchInProsthesisScope(
  arch: 'upper' | 'lower',
  scope: RehabArchProsthesisScope,
): boolean {
  if (scope === 'superior_inferior') return true
  if (scope === 'superior') return arch === 'upper'
  return arch === 'lower'
}

export function getArchProsthesisTintColor(
  arch: 'upper' | 'lower',
  plans: Array<{ scope: RehabArchProsthesisScope; color: string } | null | undefined>,
): string | undefined {
  for (let index = plans.length - 1; index >= 0; index -= 1) {
    const plan = plans[index]
    if (plan && isArchInProsthesisScope(arch, plan.scope)) return plan.color
  }
  return undefined
}
