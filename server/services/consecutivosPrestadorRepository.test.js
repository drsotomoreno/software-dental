import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { reservarReciboCaja, SQL_RESERVAR_RECIBO_CAJA } from './consecutivosPrestadorRepository.js'

function memoria() {
  const seq = new Map()
  const recibos = []
  return {
    recibos,
    async query(sql, params = []) {
      const text = String(sql)
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] }
      if (!text.includes('INSERT INTO recibos_caja')) {
        throw new Error(`SQL inesperada: ${text.slice(0, 80)}`)
      }
      const titular = params[0]
      const next = (seq.get(titular) ?? 0) + 1
      seq.set(titular, next)
      if (recibos.some((row) => row.titular === titular && row.consecutivo === next)) {
        const error = new Error('llave duplicada')
        error.code = '23505'
        throw error
      }
      const numero = `RC-${String(next).padStart(5, '0')}`
      recibos.push({ titular, consecutivo: next, numero })
      return {
        rows: [
          {
            id: `${titular}-${next}`,
            usuario_titular_id: titular,
            tipo_documento: 'RECIBO_CAJA',
            consecutivo: next,
            numero_documento: numero,
            monto: params[1],
          },
        ],
      }
    },
  }
}

test('la reserva SQL incrementa en conflicto y deja el recibo único por titular', async () => {
  const sql = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), '../db/migrations/20261021120000_consecutivos_prestador.sql'),
    'utf8',
  )
  assert.match(sql, /UNIQUE \(usuario_titular_id, tipo_documento\)/)
  assert.match(sql, /UNIQUE \(usuario_titular_id, tipo_documento, consecutivo\)/)
  assert.match(SQL_RESERVAR_RECIBO_CAJA, /ON CONFLICT \(usuario_titular_id, tipo_documento\)/)
  assert.doesNotMatch(SQL_RESERVAR_RECIBO_CAJA, /FE-/)
})

test('dos titulares no comparten el consecutivo RC-', async () => {
  const client = memoria()
  const primero = await reservarReciboCaja({ usuarioTitularId: 'clinica-a', monto: 80000, paymentId: 'p1' }, { client })
  const segundo = await reservarReciboCaja({ usuarioTitularId: 'clinica-b', monto: 50000, paymentId: 'p2' }, { client })
  const siguiente = await reservarReciboCaja({ usuarioTitularId: 'clinica-a', monto: 10000, paymentId: 'p3' }, { client })

  assert.equal(primero.numeroDocumento, 'RC-00001')
  assert.equal(segundo.numeroDocumento, 'RC-00001')
  assert.equal(siguiente.numeroDocumento, 'RC-00002')
  assert.equal(primero.consecutivo, 1)
  assert.equal(siguiente.consecutivo, 2)
})

test('un cobro en cero no reserva recibo', async () => {
  await assert.rejects(
    () => reservarReciboCaja({ usuarioTitularId: 'clinica-a', monto: 0 }, { client: memoria() }),
    (error) => error.statusCode === 400,
  )
})
