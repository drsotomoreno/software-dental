const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { createHash } = require('crypto')
const { spawn } = require('child_process')

const isDev = !app.isPackaged

function generateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 })
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function registerIpcHandlers() {
  ipcMain.handle('diagnostic:pick-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Exámenes y escaneos',
          extensions: [
            'dcm',
            'dicom',
            'stl',
            'ply',
            'obj',
            'jpg',
            'jpeg',
            'png',
            'gif',
            'webp',
            'bmp',
            'tif',
            'tiff',
            'pdf',
            'zip',
          ],
        },
        { name: 'Todos', extensions: ['*'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const absolutePath = result.filePaths[0]
    return {
      absolutePath,
      fileName: path.basename(absolutePath),
    }
  })

  ipcMain.handle('diagnostic:generate-hash', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Ruta de archivo inválida.')
    }
    return generateFileHash(filePath)
  })

  ipcMain.handle('diagnostic:file-exists', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return false
    try {
      await fs.promises.access(filePath, fs.constants.F_OK)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('diagnostic:open-path', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      return 'Ruta de archivo inválida.'
    }
    return shell.openPath(filePath)
  })

  ipcMain.handle('diagnostic:pick-application', async () => {
    const filters =
      process.platform === 'darwin'
        ? [{ name: 'Aplicaciones', extensions: ['app'] }]
        : process.platform === 'win32'
          ? [
              { name: 'Programas', extensions: ['exe', 'bat', 'cmd', 'lnk'] },
              { name: 'Todos', extensions: ['*'] },
            ]
          : [{ name: 'Ejecutables', extensions: ['*'] }]

    const result = await dialog.showOpenDialog({
      title: 'Seleccionar programa para abrir el archivo',
      properties: ['openFile'],
      filters,
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const absolutePath = result.filePaths[0]
    return {
      absolutePath,
      displayName: path.basename(absolutePath).replace(/\.(exe|app|lnk)$/i, ''),
    }
  })

  ipcMain.handle('thermal:print-html', async (_event, html) => {
    if (!html || typeof html !== 'string') {
      throw new Error('Contenido de impresión inválido.')
    }

    const printWin = new BrowserWindow({
      show: false,
      width: 320,
      height: 900,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    try {
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
      await printWin.loadURL(dataUrl)

      await new Promise((resolve, reject) => {
        printWin.webContents.print(
          {
            silent: false,
            printBackground: true,
          },
          (success, failureReason) => {
            if (success) resolve(true)
            else reject(new Error(failureReason || 'No se pudo imprimir el ticket térmico.'))
          },
        )
      })
    } finally {
      if (!printWin.isDestroyed()) {
        printWin.close()
      }
    }
  })

  ipcMain.handle('diagnostic:open-with-program', async (_event, filePath, programPath) => {
    if (!filePath || typeof filePath !== 'string') {
      return 'Ruta de archivo inválida.'
    }
    if (!programPath || typeof programPath !== 'string') {
      return 'Ruta del programa inválida.'
    }

    try {
      await fs.promises.access(filePath, fs.constants.F_OK)
      await fs.promises.access(programPath, fs.constants.F_OK)
    } catch {
      return 'El archivo o el programa seleccionado no existe en disco.'
    }

    try {
      if (process.platform === 'darwin') {
        const child = spawn('open', ['-a', programPath, filePath], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        return ''
      }

      const child = spawn(programPath, [filePath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      child.on('error', () => {})
      child.unref()
      return ''
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo iniciar el programa seleccionado.'
    }
  })

  ipcMain.handle('imaging:read-file', async (_event, filePath) => {
    return readDiagnosticFileBuffer(filePath)
  })

  ipcMain.handle('imaging:extract-dicom', async (_event, filePath) => {
    return readDiagnosticFileBuffer(filePath)
  })

  ipcMain.handle('imaging:convert-stl', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Ruta de archivo inválida.')
    }
    const buf = await fs.promises.readFile(filePath)
    if (buf.byteLength > 250 * 1024 * 1024) {
      throw new Error('El archivo supera 250 MB y no se puede convertir en esta versión.')
    }
    const { convertMeshToGlb } = await import('../shared/imaging/stlToGlb.js')
    return convertMeshToGlb(buf, path.basename(filePath))
  })
}

async function readDiagnosticFileBuffer(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Ruta de archivo inválida.')
  }
  const stat = await fs.promises.stat(filePath)
  if (stat.size > 250 * 1024 * 1024) {
    throw new Error('El archivo supera 250 MB y no se puede abrir en el visor in-app.')
  }
  const buf = await fs.promises.readFile(filePath)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
