/**
 * Puente al proceso principal de Electron.
 * En navegador puro `window.desktopBridge` no está definido.
 */
export interface PickedDiagnosticFile {
  absolutePath: string
  fileName: string
}

export interface PickedApplicationProgram {
  absolutePath: string
  displayName: string
}

export interface DesktopBridge {
  isElectron: boolean
  pickDiagnosticFile(): Promise<PickedDiagnosticFile | null>
  generateFileHash(filePath: string): Promise<string>
  fileExists(filePath: string): Promise<boolean>
  /** Devuelve cadena vacía si la apertura fue exitosa; mensaje de error en caso contrario. */
  openPath(filePath: string): Promise<string>
  pickApplicationProgram(): Promise<PickedApplicationProgram | null>
  openPathWithProgram(filePath: string, programPath: string): Promise<string>
  /** Imprime HTML de ticket térmico 80 mm (diálogo nativo de impresión). */
  printThermalHtml(html: string): Promise<void>
}

declare global {
  interface Window {
    desktopBridge?: DesktopBridge
  }
}

export function getDesktopBridge(): DesktopBridge | undefined {
  return typeof window !== 'undefined' ? window.desktopBridge : undefined
}

export function isDesktopApp(): boolean {
  return Boolean(getDesktopBridge()?.isElectron)
}
