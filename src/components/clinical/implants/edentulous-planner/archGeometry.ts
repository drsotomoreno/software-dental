import type { ImplantFdiQuadrant } from '@/constants/implantPlanning'

/** Coincide con las dimensiones reales de la imagen de referencia (1024×621). */
export const PLANNER_VIEWBOX = { width: 1024, height: 621 }

export const ARTWORK_IMAGE = {
  x: 0,
  y: 0,
  width: PLANNER_VIEWBOX.width,
  height: PLANNER_VIEWBOX.height,
}

const CENTER_X = PLANNER_VIEWBOX.width / 2
const MIDLINE_Y = PLANNER_VIEWBOX.height / 2

/** Genera reborde alveolar ondulado siguiendo un arco en herradura. */
function buildScallopedHorseshoeRidge(options: {
  centerX: number
  centerGapY: number
  wingY: number
  halfSpan: number
  scallopsPerSide: number
  openDirection: 'down' | 'up'
}): string {
  const { centerX, centerGapY, wingY, halfSpan, scallopsPerSide, openDirection } = options
  const scallopDepth = openDirection === 'down' ? 9 : -9
  const totalSteps = scallopsPerSide * 4
  const segments: string[] = []

  const sampleY = (t: number) => {
    const parabola = 1 - (2 * t - 1) ** 2
    return wingY + (centerGapY - wingY) * parabola
  }

  for (let index = 0; index <= totalSteps; index += 1) {
    const t = index / totalSteps
    const x = centerX - halfSpan + t * halfSpan * 2
    const y = sampleY(t) + (index % 2 === 0 ? 0 : scallopDepth)

    if (index === 0) {
      segments.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`)
      continue
    }

    const prevT = (index - 1) / totalSteps
    const prevX = centerX - halfSpan + prevT * halfSpan * 2
    const prevY = sampleY(prevT) + ((index - 1) % 2 === 0 ? 0 : scallopDepth)
    const ctrlX = (prevX + x) / 2
    const ctrlY = (prevY + y) / 2 + (index % 2 === 0 ? scallopDepth * 0.45 : -scallopDepth * 0.25)
    segments.push(`Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }

  return segments.join(' ')
}

/** Reborde interno ondulado del maxilar (calibrado sobre la imagen de referencia). */
export const UPPER_RIDGE_PATH = buildScallopedHorseshoeRidge({
  centerX: CENTER_X,
  centerGapY: 326,
  wingY: 232,
  halfSpan: 338,
  scallopsPerSide: 5,
  openDirection: 'down',
})

/** Reborde interno ondulado de la mandíbula (calibrado sobre la imagen de referencia). */
export const LOWER_RIDGE_PATH = buildScallopedHorseshoeRidge({
  centerX: CENTER_X,
  centerGapY: 295,
  wingY: 390,
  halfSpan: 338,
  scallopsPerSide: 5,
  openDirection: 'up',
})

export const RIDGE_PATHS: {
  path: string
  arch: 'upper' | 'lower'
}[] = [
  { path: UPPER_RIDGE_PATH, arch: 'upper' },
  { path: LOWER_RIDGE_PATH, arch: 'lower' },
]

export function resolveFdiQuadrant(x: number, y: number): ImplantFdiQuadrant {
  const isUpper = y < MIDLINE_Y
  const isPatientRight = x < CENTER_X

  if (isUpper && isPatientRight) return 'Q1'
  if (isUpper && !isPatientRight) return 'Q2'
  if (!isUpper && !isPatientRight) return 'Q3'
  return 'Q4'
}

export function resolveArchFromPoint(y: number): 'upper' | 'lower' {
  return y < MIDLINE_Y ? 'upper' : 'lower'
}

export function resolveImplantPlacement(x: number, y: number) {
  return {
    x,
    y,
    quadrant: resolveFdiQuadrant(x, y),
    arch: resolveArchFromPoint(y),
  }
}

interface RidgeSnapResult {
  x: number
  y: number
  arch: 'upper' | 'lower'
  quadrant: ImplantFdiQuadrant
  distance: number
}

function snapToPath(
  pathD: string,
  arch: 'upper' | 'lower',
  x: number,
  y: number,
  samples = 160,
): RidgeSnapResult | null {
  if (typeof document === 'undefined') return null

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', pathD)
  const total = path.getTotalLength()
  if (!total) return null

  let best: RidgeSnapResult | null = null

  for (let index = 0; index <= samples; index += 1) {
    const point = path.getPointAtLength((total * index) / samples)
    const distance = Math.hypot(point.x - x, point.y - y)
    if (!best || distance < best.distance) {
      best = {
        x: point.x,
        y: point.y,
        arch,
        quadrant: resolveFdiQuadrant(point.x, point.y),
        distance,
      }
    }
  }

  return best
}

export function snapToAlveolarRidge(
  x: number,
  y: number,
  maxDistance = 34,
): Omit<RidgeSnapResult, 'distance'> | null {
  const candidates = RIDGE_PATHS.map((ridge) =>
    snapToPath(ridge.path, ridge.arch, x, y),
  ).filter((item): item is RidgeSnapResult => item !== null)

  if (candidates.length === 0) return null

  const best = candidates.reduce((current, item) =>
    item.distance < current.distance ? item : current,
  )

  if (best.distance > maxDistance) return null

  return {
    x: best.x,
    y: best.y,
    arch: best.arch,
    quadrant: best.quadrant,
  }
}

export function clientPointToViewBox(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const transformed = point.matrixTransform(ctm.inverse())
  return { x: transformed.x, y: transformed.y }
}
