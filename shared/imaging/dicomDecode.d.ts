export interface DicomMeta {
  rows: number
  cols: number
  numberOfFrames: number
  bitsAllocated: number
  bitsStored: number
  pixelRepresentation: number
  samplesPerPixel: number
  photometric: string
  planarConfiguration: number
  slope: number
  intercept: number
  windowCenter?: number
  windowWidth?: number
  instanceNumber: number
  imagePosition: number[]
  transferSyntax: string
  encapsulated: boolean
  hasPixelData: boolean
}

export interface RgbaFrame {
  width: number
  height: number
  rgba: Uint8ClampedArray
  instanceNumber?: number
  z?: number
}

export function parseDicomDataset(input: Uint8Array | ArrayBuffer): import('dicom-parser').DataSet
export function readDicomMeta(dataSet: import('dicom-parser').DataSet): DicomMeta
export function extractEncapsulatedFrames(dataSet: import('dicom-parser').DataSet): Uint8Array[]
export function decodeUncompressedFrames(
  dataSet: import('dicom-parser').DataSet,
  meta: DicomMeta,
): RgbaFrame[]
export function buildCoronalRgba(axials: RgbaFrame[], maxSlices?: number): RgbaFrame[]
export function isJpegPayload(bytes: Uint8Array): boolean
