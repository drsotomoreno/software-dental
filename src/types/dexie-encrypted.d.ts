declare module 'dexie-encrypted' {
  import type Dexie from 'dexie'

  export const cryptoOptions: {
    readonly NON_INDEXED_FIELDS: 'NON_INDEXED_FIELDS'
    readonly UNENCRYPTED_LIST: 'UNENCRYPTED_LIST'
    readonly ENCRYPT_LIST: 'ENCRYPT_LIST'
  }

  export const NON_INDEXED_FIELDS: 'NON_INDEXED_FIELDS'
  export const ENCRYPT_LIST: 'ENCRYPT_LIST'
  export const UNENCRYPTED_LIST: 'UNENCRYPTED_LIST'

  export type EncryptionOption<T> =
    | 'NON_INDEXED_FIELDS'
    | { type: 'UNENCRYPTED_LIST' | 'ENCRYPT_LIST'; fields: Array<keyof T> }

  export function applyEncryptionMiddleware<T extends Dexie>(
    db: T,
    encryptionKey: Uint8Array | Promise<Uint8Array>,
    tableSettings: Partial<Record<string, EncryptionOption<unknown>>>,
    onKeyChange: (db: T) => Promise<unknown>,
    _nonceOverrideForTesting?: Uint8Array,
  ): void

  export function clearAllTables(db: Dexie): Promise<void[]>
  export function clearEncryptedTables<T extends Dexie>(db: T): Promise<void[]>
}
