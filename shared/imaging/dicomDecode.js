import dicomParser from 'dicom-parser'

function getParser() {
  const mod = dicomParser?.parseDicom ? dicomParser : dicomParser?.default
  if (!mod?.parseDicom) {
    throw new Error('dicom-parser no disponible.')
  }
  return mod
}

/**
 * @param {Uint8Array | ArrayBuffer} input
 */
export function parseDicomDataset(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const parser = getParser()
  return parser.parseDicom(bytes)
}

/**
 * @param {import('dicom-parser').DataSet} dataSet
 */
export function readDicomMeta(dataSet) {
  const rows = dataSet.uint16('x00280010') || 0
  const cols = dataSet.uint16('x00280011') || 0
  const numberOfFrames = Math.max(1, dataSet.intString('x00280008') || 1)
  const bitsAllocated = dataSet.uint16('x00280100') || 16
  const bitsStored = dataSet.uint16('x00280101') || bitsAllocated
  const pixelRepresentation = dataSet.uint16('x00280103') || 0
  const samplesPerPixel = dataSet.uint16('x00280002') || 1
  const photometric = (dataSet.string('x00280004') || 'MONOCHROME2').toUpperCase()
  const planarConfiguration = dataSet.uint16('x00280006') || 0
  const slope = dataSet.floatString('x00281053') ?? 1
  const intercept = dataSet.floatString('x00281052') ?? 0
  const windowCenter = firstNumber(dataSet.string('x00281050'))
  const windowWidth = firstNumber(dataSet.string('x00281051'))
  const instanceNumber = dataSet.intString('x00200013') ?? 0
  const imagePosition = parseFloatList(dataSet.string('x00200032'))
  const transferSyntax = dataSet.string('x00020010') || ''
  const pixelElement = dataSet.elements.x7fe00010
  const encapsulated = Boolean(pixelElement?.encapsulatedPixelData)
  return {
    rows,
    cols,
    numberOfFrames,
    bitsAllocated,
    bitsStored,
    pixelRepresentation,
    samplesPerPixel,
    photometric,
    planarConfiguration,
    slope,
    intercept,
    windowCenter,
    windowWidth,
    instanceNumber,
    imagePosition,
    transferSyntax,
    encapsulated,
    hasPixelData: Boolean(pixelElement),
  }
}

function firstNumber(value) {
  if (value == null || value === '') return undefined
  const part = String(value).split('\\')[0]
  const n = Number(part)
  return Number.isFinite(n) ? n : undefined
}

function parseFloatList(value) {
  if (!value) return []
  return String(value)
    .split('\\')
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n))
}

/**
 * Extrae frames JPEG encapsulados (si existen).
 * @param {import('dicom-parser').DataSet} dataSet
 * @returns {Uint8Array[]}
 */
export function extractEncapsulatedFrames(dataSet) {
  const pixelElement = dataSet.elements.x7fe00010
  if (!pixelElement?.encapsulatedPixelData || !pixelElement.fragments?.length) return []
  return pixelElement.fragments.map((frag) =>
    dataSet.byteArray.subarray(frag.position, frag.position + frag.length),
  )
}

/**
 * Decodifica pixel data no encapsulado a RGBA por frame.
 * @param {import('dicom-parser').DataSet} dataSet
 * @param {ReturnType<typeof readDicomMeta>} meta
 * @returns {Array<{ width: number, height: number, rgba: Uint8ClampedArray }>}
 */
export function decodeUncompressedFrames(dataSet, meta) {
  const pixelElement = dataSet.elements.x7fe00010
  if (!pixelElement || pixelElement.encapsulatedPixelData) {
    throw new Error('Pixel Data encapsulado: use extractEncapsulatedFrames.')
  }
  if (!meta.rows || !meta.cols) {
    throw new Error('DICOM sin filas/columnas.')
  }

  const framePixels = meta.rows * meta.cols * meta.samplesPerPixel
  const bytesPerSample = meta.bitsAllocated <= 8 ? 1 : 2
  const frameBytes = framePixels * bytesPerSample
  const raw = dataSet.byteArray.subarray(
    pixelElement.dataOffset,
    pixelElement.dataOffset + pixelElement.length,
  )
  const available = Math.max(1, Math.floor(raw.byteLength / frameBytes))
  const frameCount = Math.min(meta.numberOfFrames, available)
  const littleEndian = !/ExplicitVRBigEndian/i.test(meta.transferSyntax)

  /** @type {number[]} */
  const samples = []
  for (let f = 0; f < frameCount; f += 1) {
    const slice = raw.subarray(f * frameBytes, (f + 1) * frameBytes)
    collectSamples(slice, bytesPerSample, littleEndian, meta.pixelRepresentation, samples)
  }

  const { center, width } = resolveWindow(samples, meta)
  const invert = meta.photometric.includes('MONOCHROME1')
  const frames = []
  for (let f = 0; f < frameCount; f += 1) {
    const offset = f * framePixels
    const rgba = new Uint8ClampedArray(meta.rows * meta.cols * 4)
    if (meta.samplesPerPixel >= 3 && !meta.photometric.includes('MONO')) {
      writeRgbFrame(samples, offset, meta, rgba)
    } else {
      writeMonoFrame(samples, offset, meta.rows * meta.cols, center, width, invert, meta, rgba)
    }
    frames.push({ width: meta.cols, height: meta.rows, rgba })
  }
  return frames
}

function collectSamples(slice, bytesPerSample, littleEndian, pixelRepresentation, out) {
  if (bytesPerSample === 1) {
    for (let i = 0; i < slice.length; i += 1) out.push(slice[i])
    return
  }
  const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength)
  const signed = pixelRepresentation === 1
  for (let i = 0; i < slice.byteLength; i += 2) {
    out.push(signed ? view.getInt16(i, littleEndian) : view.getUint16(i, littleEndian))
  }
}

function resolveWindow(samples, meta) {
  if (meta.windowCenter != null && meta.windowWidth != null && meta.windowWidth > 0) {
    return { center: meta.windowCenter, width: meta.windowWidth }
  }
  let min = Infinity
  let max = -Infinity
  const step = Math.max(1, Math.floor(samples.length / 20000))
  for (let i = 0; i < samples.length; i += step) {
    const v = samples[i] * meta.slope + meta.intercept
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { center: 0, width: 1 }
  }
  return { center: (min + max) / 2, width: max - min }
}

function writeMonoFrame(samples, offset, count, center, width, invert, meta, rgba) {
  const low = center - width / 2
  const high = center + width / 2
  const span = high - low || 1
  for (let i = 0; i < count; i += 1) {
    let v = samples[offset + i] * meta.slope + meta.intercept
    let n = (v - low) / span
    if (n < 0) n = 0
    else if (n > 1) n = 1
    if (invert) n = 1 - n
    const g = Math.round(n * 255)
    const o = i * 4
    rgba[o] = g
    rgba[o + 1] = g
    rgba[o + 2] = g
    rgba[o + 3] = 255
  }
}

function writeRgbFrame(samples, offset, meta, rgba) {
  const count = meta.rows * meta.cols
  const planar = meta.planarConfiguration === 1
  for (let i = 0; i < count; i += 1) {
    let r
    let g
    let b
    if (planar) {
      r = samples[offset + i]
      g = samples[offset + count + i]
      b = samples[offset + count * 2 + i]
    } else {
      const s = offset + i * 3
      r = samples[s]
      g = samples[s + 1]
      b = samples[s + 2]
    }
    const o = i * 4
    rgba[o] = r
    rgba[o + 1] = g
    rgba[o + 2] = b
    rgba[o + 3] = 255
  }
}

/**
 * @param {Array<{ width: number, height: number, rgba: Uint8ClampedArray, instanceNumber?: number, z?: number }>} axials
 * @param {number} [maxSlices]
 */
export function buildCoronalRgba(axials, maxSlices = 96) {
  if (axials.length < 8) return []
  const width = axials[0].width
  const height = axials[0].height
  const depth = axials.length
  if (!axials.every((frame) => frame.width === width && frame.height === height)) return []

  const volumeBytes = width * height * depth
  if (volumeBytes > 80_000_000) return []

  const step = Math.max(1, Math.ceil(height / maxSlices))
  /** @type {Array<{ width: number, height: number, rgba: Uint8ClampedArray }>} */
  const coronals = []
  for (let y = 0; y < height; y += step) {
    const rgba = new Uint8ClampedArray(depth * width * 4)
    for (let z = 0; z < depth; z += 1) {
      const src = axials[z].rgba
      const row = y * width * 4
      const dest = z * width * 4
      rgba.set(src.subarray(row, row + width * 4), dest)
    }
    coronals.push({ width, height: depth, rgba })
  }
  return coronals
}

export function isJpegPayload(bytes) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8
}
