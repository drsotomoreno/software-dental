#!/usr/bin/env node
/**
 * Extrae cortes DICOM (archivo .dcm o ZIP) a PNG/WebP para visor móvil.
 *
 * Uso:
 *   node server/imaging/extractDicomSlices.mjs estudio.dcm|estudio.zip carpeta_salida
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import {
  buildCoronalRgba,
  decodeUncompressedFrames,
  parseDicomDataset,
  readDicomMeta,
} from '../../shared/imaging/dicomDecode.js'
import { encodePngRgba } from '../../shared/imaging/encodePng.js'

async function maybeSharp() {
  try {
    const mod = await import('sharp')
    return mod.default ?? mod
  } catch {
    return null
  }
}

async function encodeFrame(sharp, frame, destPath) {
  const png = encodePngRgba(frame.width, frame.height, frame.rgba)
  if (!sharp) {
    await writeFile(destPath.replace(/\.webp$/i, '.png'), png)
    return
  }
  await sharp(png).webp({ quality: 82 }).toFile(destPath)
}

async function framesFromBuffer(data) {
  const dataSet = parseDicomDataset(data)
  const meta = readDicomMeta(dataSet)
  if (meta.encapsulated) {
    throw new Error(
      'DICOM comprimido: extraiga los cortes en el visor web (JPEG encapsulado) o descomprima antes.',
    )
  }
  const frames = decodeUncompressedFrames(dataSet, meta)
  const z = meta.imagePosition[2] ?? meta.instanceNumber
  return frames.map((frame, index) => ({
    ...frame,
    instanceNumber: meta.instanceNumber || index + 1,
    z,
  }))
}

async function loadAllFrames(inputPath, data) {
  if (inputPath.toLowerCase().endsWith('.zip') || (data[0] === 0x50 && data[1] === 0x4b)) {
    const zip = await JSZip.loadAsync(data)
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir)
    const collected = []
    for (const name of names) {
      try {
        const fileData = await zip.files[name].async('nodebuffer')
        collected.push(...(await framesFromBuffer(fileData)))
      } catch {
        // entrada no DICOM
      }
    }
    collected.sort((a, b) => (a.z ?? 0) - (b.z ?? 0) || a.instanceNumber - b.instanceNumber)
    return collected
  }
  return framesFromBuffer(data)
}

async function main() {
  const [, , inputPath, outputDir] = process.argv
  if (!inputPath || !outputDir) {
    console.error('Uso: node server/imaging/extractDicomSlices.mjs <entrada.dcm|zip> <carpeta>')
    process.exit(1)
  }
  const data = await readFile(inputPath)
  const frames = await loadAllFrames(inputPath, data)
  if (!frames.length) {
    throw new Error('No se encontraron cortes DICOM no comprimidos.')
  }
  await mkdir(outputDir, { recursive: true })
  const sharp = await maybeSharp()
  const ext = sharp ? 'webp' : 'png'
  for (let i = 0; i < frames.length; i += 1) {
    const dest = path.join(outputDir, `axial-${String(i).padStart(4, '0')}.${ext}`)
    await encodeFrame(sharp, frames[i], dest)
  }
  const coronals = buildCoronalRgba(frames, 96)
  for (let i = 0; i < coronals.length; i += 1) {
    const dest = path.join(outputDir, `coronal-${String(i).padStart(4, '0')}.${ext}`)
    await encodeFrame(sharp, coronals[i], dest)
  }
  console.log(
    `Cortes escritos en ${outputDir}: ${frames.length} axiales, ${coronals.length} coronales (${ext}).`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
