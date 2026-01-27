import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  saveModel: (modelJson: string, weightsData: ArrayBuffer, metadata: string) =>
    ipcRenderer.invoke('save-model', modelJson, weightsData, metadata),
  loadModel: () => ipcRenderer.invoke('load-model'),
  hasModel: () => ipcRenderer.invoke('has-model'),
  deleteModel: () => ipcRenderer.invoke('delete-model'),
})
