import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Model is stored in app/model/ directory (repo root)
function getModelDir(): string {
  if (process.env.NODE_ENV === 'development') {
    // In dev, go up from dist-electron/main to app/model
    return path.join(__dirname, '../../model')
  } else {
    // In production, model is bundled with the app
    return path.join(process.resourcesPath, 'model')
  }
}

// IPC Handlers for model persistence
ipcMain.handle('save-model', async (_event, modelJson: string, weightsData: ArrayBuffer, metadata: string) => {
  const modelDir = getModelDir()

  // Ensure directory exists
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true })
  }

  // Save model topology
  fs.writeFileSync(path.join(modelDir, 'model.json'), modelJson)

  // Save weights as binary
  fs.writeFileSync(path.join(modelDir, 'weights.bin'), Buffer.from(weightsData))

  // Save metadata (trained letters, etc.)
  fs.writeFileSync(path.join(modelDir, 'metadata.json'), metadata)

  return true
})

ipcMain.handle('load-model', async () => {
  const modelDir = getModelDir()
  const modelPath = path.join(modelDir, 'model.json')
  const weightsPath = path.join(modelDir, 'weights.bin')
  const metadataPath = path.join(modelDir, 'metadata.json')

  if (!fs.existsSync(modelPath) || !fs.existsSync(weightsPath)) {
    return null
  }

  const modelJson = fs.readFileSync(modelPath, 'utf-8')
  const weightsData = fs.readFileSync(weightsPath)
  const metadata = fs.existsSync(metadataPath)
    ? fs.readFileSync(metadataPath, 'utf-8')
    : '{}'

  return {
    modelJson,
    weightsData: weightsData.buffer.slice(weightsData.byteOffset, weightsData.byteOffset + weightsData.byteLength),
    metadata,
  }
})

ipcMain.handle('has-model', async () => {
  const modelDir = getModelDir()
  return fs.existsSync(path.join(modelDir, 'model.json'))
})

ipcMain.handle('delete-model', async () => {
  const modelDir = getModelDir()
  const files = ['model.json', 'weights.bin', 'metadata.json']
  for (const file of files) {
    const filePath = path.join(modelDir, file)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }
  return true
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f11', // gray-950
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    // In production, load the built files
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
