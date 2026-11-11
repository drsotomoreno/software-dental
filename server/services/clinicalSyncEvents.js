/**
 * Bus de eventos del sync clínico (CQRS write → read model).
 * Desacopla el push HTTP del indexador en background.
 */
import { EventEmitter } from 'node:events'

export const SNAPSHOT_PUSHED = 'snapshot:pushed'

/** @type {import('node:events').EventEmitter} */
export const clinicalSyncEvents = new EventEmitter()
clinicalSyncEvents.setMaxListeners(30)
