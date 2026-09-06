/**
 * Conversión STL/OBJ/PLY (ASCII) → GLB binario, sin Three.js.
 * Pensado para workers del navegador, Electron IPC y CLI Node.
 */

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const MAX_INPUT_TRIANGLES = 8_000_000
const TARGET_TRIANGLES = 280_000

/**
 * @param {ArrayBuffer | Uint8Array} input
 * @param {string} [fileName]
 * @returns {ArrayBuffer}
 */
export function convertMeshToGlb(input, fileName = 'model.stl') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const ext = extensionOf(fileName)
  let mesh
  if (ext === 'obj') mesh = parseObj(bytes)
  else if (ext === 'ply') mesh = parsePly(bytes)
  else mesh = parseStl(bytes)

  if (mesh.triangleCount < 1) {
    throw new Error('El modelo 3D no contiene triángulos.')
  }
  if (mesh.triangleCount > MAX_INPUT_TRIANGLES) {
    throw new Error(
      `El modelo tiene ${mesh.triangleCount.toLocaleString('es-CO')} triángulos (máximo ${MAX_INPUT_TRIANGLES.toLocaleString('es-CO')}).`,
    )
  }

  let { positions, indices } = weldVertices(mesh.positions, mesh.triangleCount)
  ;({ positions, indices } = clusterSimplify(positions, indices, TARGET_TRIANGLES))
  centerAndScale(positions)
  const normals = computeNormals(positions, indices)
  return buildGlb(positions, normals, indices)
}

function extensionOf(fileName) {
  const parts = String(fileName).toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() : 'stl'
}

function parseStl(bytes) {
  if (looksLikeAsciiStl(bytes)) return parseAsciiStl(bytes)
  return parseBinaryStl(bytes)
}

function looksLikeAsciiStl(bytes) {
  if (bytes.byteLength < 84) return true
  const head = decoder.decode(bytes.subarray(0, 80)).trim().toLowerCase()
  if (!head.startsWith('solid')) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const declared = view.getUint32(80, true)
  const expected = 84 + declared * 50
  if (declared > 0 && expected === bytes.byteLength) return false
  return true
}

function parseBinaryStl(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 84) throw new Error('Archivo STL binario incompleto.')
  const triangleCount = view.getUint32(80, true)
  const needed = 84 + triangleCount * 50
  if (bytes.byteLength < needed) {
    throw new Error('Archivo STL binario truncado.')
  }
  const positions = new Float32Array(triangleCount * 9)
  let o = 84
  let p = 0
  for (let i = 0; i < triangleCount; i += 1) {
    o += 12
    for (let v = 0; v < 9; v += 1) {
      positions[p] = view.getFloat32(o, true)
      p += 1
      o += 4
    }
    o += 2
  }
  return { positions, triangleCount }
}

const decoder = new TextDecoder('latin1')

function parseAsciiStl(bytes) {
  const text = decoder.decode(bytes)
  const matches = text.matchAll(/vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gi)
  const coords = []
  for (const match of matches) {
    coords.push(Number(match[1]), Number(match[2]), Number(match[3]))
  }
  if (coords.length < 9 || coords.length % 9 !== 0) {
    throw new Error('No se pudieron leer vértices del STL ASCII.')
  }
  return { positions: new Float32Array(coords), triangleCount: coords.length / 9 }
}

function parseObj(bytes) {
  const text = decoder.decode(bytes)
  const verts = []
  const faces = []
  const lines = text.split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/)
      verts.push(Number(parts[1]), Number(parts[2]), Number(parts[3]))
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1)
      const ids = parts.map((part) => Number(part.split('/')[0]))
      for (let i = 1; i < ids.length - 1; i += 1) {
        faces.push(ids[0], ids[i], ids[i + 1])
      }
    }
  }
  if (!verts.length || !faces.length) {
    throw new Error('El OBJ no contiene malla triangular.')
  }
  const triangleCount = faces.length / 3
  const positions = new Float32Array(triangleCount * 9)
  let p = 0
  for (let i = 0; i < faces.length; i += 1) {
    const vi = (faces[i] < 0 ? verts.length / 3 + faces[i] : faces[i] - 1) * 3
    positions[p] = verts[vi]
    positions[p + 1] = verts[vi + 1]
    positions[p + 2] = verts[vi + 2]
    p += 3
  }
  return { positions, triangleCount }
}

function parsePly(bytes) {
  const text = decoder.decode(bytes)
  if (!text.startsWith('ply')) {
    throw new Error('PLY no reconocido. Use ASCII PLY o convierta a STL/GLB.')
  }
  if (/format\s+binary/i.test(text.slice(0, 400))) {
    throw new Error('PLY binario no soportado en v1. Exporte STL u OBJ.')
  }
  const headerEnd = text.indexOf('end_header')
  if (headerEnd < 0) throw new Error('PLY sin end_header.')
  const header = text.slice(0, headerEnd)
  const vertexCount = Number((header.match(/element vertex\s+(\d+)/i) || [])[1] || 0)
  const faceCount = Number((header.match(/element face\s+(\d+)/i) || [])[1] || 0)
  const body = text.slice(text.indexOf('\n', headerEnd) + 1).trim().split(/\r?\n/)
  if (!vertexCount || !faceCount) throw new Error('PLY ASCII incompleto.')
  const verts = []
  for (let i = 0; i < vertexCount; i += 1) {
    const parts = body[i].trim().split(/\s+/)
    verts.push(Number(parts[0]), Number(parts[1]), Number(parts[2]))
  }
  const positions = []
  for (let i = 0; i < faceCount; i += 1) {
    const parts = body[vertexCount + i].trim().split(/\s+/).map(Number)
    const n = parts[0]
    const ids = parts.slice(1, 1 + n)
    for (let t = 1; t < ids.length - 1; t += 1) {
      for (const id of [ids[0], ids[t], ids[t + 1]]) {
        positions.push(verts[id * 3], verts[id * 3 + 1], verts[id * 3 + 2])
      }
    }
  }
  return { positions: new Float32Array(positions), triangleCount: positions.length / 9 }
}

function weldVertices(flatPositions, triangleCount) {
  const map = new Map()
  const unique = []
  const indices = new Uint32Array(triangleCount * 3)
  for (let i = 0; i < triangleCount * 3; i += 1) {
    const x = flatPositions[i * 3]
    const y = flatPositions[i * 3 + 1]
    const z = flatPositions[i * 3 + 2]
    const key = `${Math.round(x * 1e4)}|${Math.round(y * 1e4)}|${Math.round(z * 1e4)}`
    let index = map.get(key)
    if (index === undefined) {
      index = unique.length / 3
      map.set(key, index)
      unique.push(x, y, z)
    }
    indices[i] = index
  }
  return { positions: new Float32Array(unique), indices }
}

function boundingBox(positions) {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }
  return { minX, minY, minZ, maxX, maxY, maxZ }
}

function clusterSimplify(positions, indices, maxTriangles) {
  const triCount = indices.length / 3
  if (triCount <= maxTriangles) return { positions, indices }

  const box = boundingBox(positions)
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ) || 1
  let grid = 96
  let result = { positions, indices }

  while (grid >= 16) {
    const cell = span / grid
    const map = new Map()
    const sums = []
    const remap = new Uint32Array(positions.length / 3)
    for (let i = 0; i < positions.length; i += 3) {
      const ix = Math.floor((positions[i] - box.minX) / cell)
      const iy = Math.floor((positions[i + 1] - box.minY) / cell)
      const iz = Math.floor((positions[i + 2] - box.minZ) / cell)
      const key = `${ix}|${iy}|${iz}`
      let slot = map.get(key)
      if (slot === undefined) {
        slot = sums.length / 4
        map.set(key, slot)
        sums.push(positions[i], positions[i + 1], positions[i + 2], 1)
      } else {
        sums[slot * 4] += positions[i]
        sums[slot * 4 + 1] += positions[i + 1]
        sums[slot * 4 + 2] += positions[i + 2]
        sums[slot * 4 + 3] += 1
      }
      remap[i / 3] = slot
    }
    const clustered = new Float32Array((sums.length / 4) * 3)
    for (let i = 0; i < sums.length / 4; i += 1) {
      const n = sums[i * 4 + 3] || 1
      clustered[i * 3] = sums[i * 4] / n
      clustered[i * 3 + 1] = sums[i * 4 + 1] / n
      clustered[i * 3 + 2] = sums[i * 4 + 2] / n
    }
    const next = []
    for (let t = 0; t < triCount; t += 1) {
      const a = remap[indices[t * 3]]
      const b = remap[indices[t * 3 + 1]]
      const c = remap[indices[t * 3 + 2]]
      if (a !== b && b !== c && c !== a) next.push(a, b, c)
    }
    result = { positions: clustered, indices: new Uint32Array(next) }
    if (next.length / 3 <= maxTriangles) break
    grid = Math.floor(grid * 0.72)
  }
  return result
}

function centerAndScale(positions) {
  const box = boundingBox(positions)
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const cz = (box.minZ + box.maxZ) / 2
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ) || 1
  const scale = 1 / span
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * scale
    positions[i + 1] = (positions[i + 1] - cy) * scale
    positions[i + 2] = (positions[i + 2] - cz) * scale
  }
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length)
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3
    const ib = indices[t + 1] * 3
    const ic = indices[t + 2] * 3
    const ax = positions[ib] - positions[ia]
    const ay = positions[ib + 1] - positions[ia + 1]
    const az = positions[ib + 2] - positions[ia + 2]
    const bx = positions[ic] - positions[ia]
    const by = positions[ic + 1] - positions[ia + 1]
    const bz = positions[ic + 2] - positions[ia + 2]
    const nx = ay * bz - az * by
    const ny = az * bx - ax * bz
    const nz = ax * by - ay * bx
    normals[ia] += nx
    normals[ia + 1] += ny
    normals[ia + 2] += nz
    normals[ib] += nx
    normals[ib + 1] += ny
    normals[ib + 2] += nz
    normals[ic] += nx
    normals[ic + 1] += ny
    normals[ic + 2] += nz
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i]
    const ny = normals[i + 1]
    const nz = normals[i + 2]
    const len = Math.hypot(nx, ny, nz) || 1
    normals[i] = nx / len
    normals[i + 1] = ny / len
    normals[i + 2] = nz / len
  }
  return normals
}

function buildGlb(positions, normals, indices) {
  const useShort = indices.length > 0 && positions.length / 3 <= 65535
  const indexBytes = useShort ? new Uint16Array(indices.length) : indices
  if (useShort) {
    for (let i = 0; i < indices.length; i += 1) indexBytes[i] = indices[i]
  }
  const indexBuffer = new Uint8Array(
    indexBytes.buffer,
    indexBytes.byteOffset,
    indexBytes.byteLength,
  )
  const indexPad = (4 - (indexBuffer.byteLength % 4)) % 4
  const posOffset = indexBuffer.byteLength + indexPad
  const posBuffer = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength)
  const nrmOffset = posOffset + posBuffer.byteLength
  const nrmBuffer = new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength)
  const binLength = nrmOffset + nrmBuffer.byteLength
  const bin = new Uint8Array(binLength)
  bin.set(indexBuffer, 0)
  bin.set(posBuffer, posOffset)
  bin.set(nrmBuffer, nrmOffset)

  const posMin = [Infinity, Infinity, Infinity]
  const posMax = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = positions[i + k]
      if (v < posMin[k]) posMin[k] = v
      if (v > posMax[k]) posMax[k] = v
    }
  }

  const json = {
    asset: { version: '2.0', generator: 'software-dental-stl-to-glb' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 1, NORMAL: 2 },
            indices: 0,
            mode: 4,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: useShort ? 5123 : 5125,
        count: indices.length,
        type: 'SCALAR',
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: positions.length / 3,
        max: posMax,
        min: posMin,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: normals.length / 3,
        type: 'VEC3',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: indexBuffer.byteLength, target: 34963 },
      { buffer: 0, byteOffset: posOffset, byteLength: posBuffer.byteLength, target: 34962 },
      { buffer: 0, byteOffset: nrmOffset, byteLength: nrmBuffer.byteLength, target: 34962 },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  }

  const jsonText = JSON.stringify(json)
  const jsonBytes = new TextEncoder().encode(jsonText)
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4
  const jsonChunkLen = jsonBytes.byteLength + jsonPad
  const binPad = (4 - (bin.byteLength % 4)) % 4
  const binChunkLen = bin.byteLength + binPad
  const total = 12 + 8 + jsonChunkLen + 8 + binChunkLen
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const u8 = new Uint8Array(out)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonChunkLen, true)
  view.setUint32(16, JSON_CHUNK, true)
  u8.set(jsonBytes, 20)
  for (let i = 0; i < jsonPad; i += 1) u8[20 + jsonBytes.byteLength + i] = 0x20
  const binHeader = 20 + jsonChunkLen
  view.setUint32(binHeader, binChunkLen, true)
  view.setUint32(binHeader + 4, BIN_CHUNK, true)
  u8.set(bin, binHeader + 8)
  return out
}
