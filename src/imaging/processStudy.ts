import JSZip from 'jszip'
import type {
  DiagnosticAidDerivativeKind,
  DiagnosticAidSlicePlane,
  DiagnosticAidStudyKind,
} from '@/types/diagnosticAid'
import {
  getFileExtension,
  inferStudyKindFromFileName,
} from '@/utils/diagnosticAidWebClassification'
import {
  buildCoronalRgba,
  decodeUncompressedFrames,
  extractEncapsulatedFrames,
  isJpegPayload,
  parseDicomDataset,
  readDicomMeta,
  type RgbaFrame,
} from '@/imaging/dicomDecode'
import {
  bitmapToCompressed,
  makeThumbFromBitmap,
  makeThumbFromRgba,
  rgbaToCompressed,
} from '@/imaging/encodeImage'
import { convertMeshToGlb } from '@/imaging/stlToGlb'

export interface ProcessStudyInput {
  fileName: string
  data: ArrayBuffer
}

export interface ProcessStudyDerivative {
  kind: DiagnosticAidDerivativeKind
  plane?: DiagnosticAidSlicePlane
  index?: number
  mimeType: string
  data: ArrayBuffer
}

export interface ProcessStudyOutput {
  studyKind: DiagnosticAidStudyKind
  derivatives: ProcessStudyDerivative[]
  sliceCount?: number
}

const MAX_AXIAL_SLICES = 256
const MAX_CORONAL_SLICES = 96
const DISPLAY_MAX_SIDE = 1024

export async function processStudy(input: ProcessStudyInput): Promise<ProcessStudyOutput> {
  const kind = inferStudyKindFromFileName(input.fileName)
  if (kind === 'mesh3d') return processMesh(input)
  if (kind === 'photo') return processPhoto(input)
  if (kind === 'dicomSeries' || kind === 'dicom2d') return processDicom(input, kind)
  return { studyKind: 'other', derivatives: [] }
}

async function processMesh(input: ProcessStudyInput): Promise<ProcessStudyOutput> {
  const glb = convertMeshToGlb(input.data, input.fileName)
  return {
    studyKind: 'mesh3d',
    derivatives: [{ kind: 'glb', mimeType: 'model/gltf-binary', data: glb }],
  }
}

async function processPhoto(input: ProcessStudyInput): Promise<ProcessStudyOutput> {
  const blob = new Blob([input.data])
  const bitmap = await createImageBitmap(blob)
  try {
    const thumb = await makeThumbFromBitmap(bitmap)
    const display =
      Math.max(bitmap.width, bitmap.height) > DISPLAY_MAX_SIDE
        ? await bitmapToCompressed(bitmap, { maxSide: DISPLAY_MAX_SIDE, quality: 0.86 })
        : null
    const derivatives: ProcessStudyDerivative[] = [
      { kind: 'thumb', mimeType: thumb.mimeType, data: thumb.data },
    ]
    if (display) {
      derivatives.push({ kind: 'dicom2d', mimeType: display.mimeType, data: display.data })
    }
    return { studyKind: 'photo', derivatives }
  } finally {
    bitmap.close()
  }
}

async function processDicom(
  input: ProcessStudyInput,
  initialKind: DiagnosticAidStudyKind,
): Promise<ProcessStudyOutput> {
  const extension = getFileExtension(input.fileName)
  const frames =
    extension === 'zip' || initialKind === 'dicomSeries'
      ? await loadFramesFromZipOrSingle(input.data, input.fileName)
      : await loadFramesFromSingleDicom(input.data)

  if (!frames.length) {
    throw new Error('No se encontraron cortes DICOM decodificables.')
  }

  const studyKind: DiagnosticAidStudyKind = frames.length > 1 ? 'dicomSeries' : 'dicom2d'
  const sampled = subsample(frames, MAX_AXIAL_SLICES)
  const derivatives: ProcessStudyDerivative[] = []

  if (studyKind === 'dicom2d') {
    const frame = sampled[0]
    const encoded = await rgbaToCompressed(frame.rgba, frame.width, frame.height, {
      maxSide: DISPLAY_MAX_SIDE,
      quality: 0.86,
    })
    const thumb = await makeThumbFromRgba(frame.rgba, frame.width, frame.height)
    derivatives.push(
      { kind: 'dicom2d', mimeType: encoded.mimeType, data: encoded.data },
      { kind: 'thumb', mimeType: thumb.mimeType, data: thumb.data },
    )
    return { studyKind, derivatives, sliceCount: 1 }
  }

  for (let i = 0; i < sampled.length; i += 1) {
    const frame = sampled[i]
    const encoded = await rgbaToCompressed(frame.rgba, frame.width, frame.height, {
      maxSide: DISPLAY_MAX_SIDE,
      quality: 0.82,
    })
    derivatives.push({
      kind: 'slice',
      plane: 'axial',
      index: i,
      mimeType: encoded.mimeType,
      data: encoded.data,
    })
  }

  const coronals = buildCoronalRgba(sampled, MAX_CORONAL_SLICES)
  for (let i = 0; i < coronals.length; i += 1) {
    const frame = coronals[i]
    const encoded = await rgbaToCompressed(frame.rgba, frame.width, frame.height, {
      maxSide: DISPLAY_MAX_SIDE,
      quality: 0.8,
    })
    derivatives.push({
      kind: 'slice',
      plane: 'coronal',
      index: i,
      mimeType: encoded.mimeType,
      data: encoded.data,
    })
  }

  const mid = sampled[Math.floor(sampled.length / 2)]
  const thumb = await makeThumbFromRgba(mid.rgba, mid.width, mid.height)
  derivatives.push({ kind: 'thumb', mimeType: thumb.mimeType, data: thumb.data })

  return { studyKind, derivatives, sliceCount: sampled.length }
}

async function loadFramesFromZipOrSingle(data: ArrayBuffer, fileName: string): Promise<RgbaFrame[]> {
  if (getFileExtension(fileName) !== 'zip' && !looksLikeZip(data)) {
    return loadFramesFromSingleDicom(data)
  }
  const zip = await JSZip.loadAsync(data)
  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir)
    .filter((name) => {
      const lower = name.toLowerCase()
      return (
        lower.endsWith('.dcm') ||
        lower.endsWith('.dicom') ||
        !lower.includes('.') ||
        /\/\d+$/.test(lower)
      )
    })
  if (!names.length) {
    throw new Error('El ZIP no contiene archivos DICOM.')
  }
  const parsed: Array<RgbaFrame & { instanceNumber: number; z: number }> = []
  for (const name of names) {
    try {
      const fileData = await zip.files[name].async('arraybuffer')
      const frames = await loadFramesFromSingleDicom(fileData)
      const metaZ = parsed.length
      frames.forEach((frame, index) => {
        parsed.push({
          ...frame,
          instanceNumber: frame.instanceNumber ?? metaZ + index,
          z: frame.z ?? metaZ + index,
        })
      })
    } catch {
      // Ignorar entradas que no sean DICOM válido dentro del ZIP.
    }
  }
  parsed.sort((a, b) => a.z - b.z || a.instanceNumber - b.instanceNumber)
  return parsed
}

async function loadFramesFromSingleDicom(data: ArrayBuffer): Promise<RgbaFrame[]> {
  const dataSet = parseDicomDataset(data)
  const meta = readDicomMeta(dataSet)
  if (!meta.hasPixelData) {
    throw new Error('El DICOM no incluye Pixel Data.')
  }

  if (meta.encapsulated) {
    const payloads = extractEncapsulatedFrames(dataSet)
    const frames: RgbaFrame[] = []
    for (const payload of payloads) {
      if (!isJpegPayload(payload)) continue
      const bitmap = await createImageBitmap(new Blob([payload], { type: 'image/jpeg' }))
      try {
        const canvas =
          typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(bitmap.width, bitmap.height)
            : Object.assign(document.createElement('canvas'), {
                width: bitmap.width,
                height: bitmap.height,
              })
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
        if (!ctx || !('drawImage' in ctx) || !('getImageData' in ctx)) continue
        ctx.drawImage(bitmap, 0, 0)
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
        frames.push({
          width: bitmap.width,
          height: bitmap.height,
          rgba: imageData.data,
          instanceNumber: meta.instanceNumber,
          z: meta.imagePosition[2] ?? meta.instanceNumber,
        })
      } finally {
        bitmap.close()
      }
    }
    if (!frames.length) {
      throw new Error(
        'DICOM comprimido no soportado (solo JPEG encapsulado o no comprimido en v1).',
      )
    }
    return frames
  }

  const frames = decodeUncompressedFrames(dataSet, meta)
  return frames.map((frame, index) => ({
    ...frame,
    instanceNumber: meta.instanceNumber || index + 1,
    z: meta.imagePosition[2] ?? meta.instanceNumber ?? index,
  }))
}

function subsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const out: T[] = []
  const step = (items.length - 1) / (max - 1)
  for (let i = 0; i < max; i += 1) {
    out.push(items[Math.round(i * step)])
  }
  return out
}

function looksLikeZip(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data)
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}
