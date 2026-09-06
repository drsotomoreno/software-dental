const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopBridge', {
  isElectron: true,
  pickDiagnosticFile: () => ipcRenderer.invoke('diagnostic:pick-file'),
  generateFileHash: (filePath) => ipcRenderer.invoke('diagnostic:generate-hash', filePath),
  fileExists: (filePath) => ipcRenderer.invoke('diagnostic:file-exists', filePath),
  openPath: (filePath) => ipcRenderer.invoke('diagnostic:open-path', filePath),
  pickApplicationProgram: () => ipcRenderer.invoke('diagnostic:pick-application'),
  openPathWithProgram: (filePath, programPath) =>
    ipcRenderer.invoke('diagnostic:open-with-program', filePath, programPath),
  printThermalHtml: (html) => ipcRenderer.invoke('thermal:print-html', html),
  readDiagnosticFile: (filePath) => ipcRenderer.invoke('imaging:read-file', filePath),
  convertStlToGlb: (filePath) => ipcRenderer.invoke('imaging:convert-stl', filePath),
  extractDicomFile: (filePath) => ipcRenderer.invoke('imaging:extract-dicom', filePath),
})
