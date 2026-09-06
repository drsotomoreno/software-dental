#!/usr/bin/env node
/**
 * Convierte STL/OBJ/PLY ASCII a GLB optimizado para visores móviles.
 *
 * Uso:
 *   node server/imaging/convertStlToGlb.mjs entrada.stl salida.glb
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertMeshToGlb } from '../../shared/imaging/stlToGlb.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const [, , inputPath, outputPath] = process.argv
  if (!inputPath || !outputPath) {
    console.error('Uso: node server/imaging/convertStlToGlb.mjs <entrada.stl> <salida.glb>')
    console.error(`Ejemplo desde ${path.relative(process.cwd(), __dirname)}`)
    process.exit(1)
  }
  const buf = await readFile(inputPath)
  const glb = convertMeshToGlb(buf, path.basename(inputPath))
  await writeFile(outputPath, Buffer.from(glb))
  const kb = Math.round(glb.byteLength / 1024)
  console.log(`GLB escrito: ${outputPath} (${kb} KB)`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
