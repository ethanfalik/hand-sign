export interface ElectronAPI {
  saveModel: (modelJson: string, weightsData: ArrayBuffer, metadata: string) => Promise<boolean>
  loadModel: () => Promise<{
    modelJson: string
    weightsData: ArrayBuffer
    metadata: string
  } | null>
  hasModel: () => Promise<boolean>
  deleteModel: () => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
