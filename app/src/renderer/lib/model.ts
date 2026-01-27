import * as tf from '@tensorflow/tfjs'

const NUM_LANDMARKS = 21
const NUM_COORDS = 3
const NUM_FEATURES = NUM_LANDMARKS * NUM_COORDS // 63

// Letter mapping for trained model (only letters with samples)
// Always read fresh from localStorage to avoid stale cache issues
export function getTrainedLetters(): string[] {
  const saved = localStorage.getItem('signlingo-trained-letters')
  return saved ? JSON.parse(saved) : []
}

export function setTrainedLetters(letters: string[]): void {
  localStorage.setItem('signlingo-trained-letters', JSON.stringify(letters))
}

export interface Sample {
  letter: string
  landmarks: number[][]
  timestamp: number
}

export interface DynamicSample {
  letter: string
  frames: number[][][]  // Array of landmark arrays over time (each frame is 21 landmarks × 3 coords)
  timestamp: number
}

// Letters that are configured to use dynamic gestures
export function getDynamicLetters(): Set<string> {
  const saved = localStorage.getItem('signlingo-dynamic-letters')
  return saved ? new Set(JSON.parse(saved)) : new Set()
}

export function setDynamicLetters(letters: Set<string>): void {
  localStorage.setItem('signlingo-dynamic-letters', JSON.stringify([...letters]))
}

export function getDynamicSamples(): DynamicSample[] {
  const saved = localStorage.getItem('signlingo-dynamic-samples')
  return saved ? JSON.parse(saved) : []
}

export function saveDynamicSamples(samples: DynamicSample[]): void {
  localStorage.setItem('signlingo-dynamic-samples', JSON.stringify(samples))
}

export interface TrainingProgress {
  epoch: number
  totalEpochs: number
  loss: number
  accuracy: number
  valLoss?: number
  valAccuracy?: number
}

export interface TrainingResult {
  accuracy: number
  loss: number
  model: tf.LayersModel
}

// Normalize landmarks relative to wrist (landmark 0) and scale
function normalizeLandmarks(landmarks: number[][]): number[] {
  const wrist = landmarks[0]
  const normalized: number[] = []

  // Find bounding box for scaling
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (const [x, y] of landmarks) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const scaleX = maxX - minX || 1
  const scaleY = maxY - minY || 1
  const scale = Math.max(scaleX, scaleY)

  for (const [x, y, z] of landmarks) {
    // Center relative to wrist and normalize by scale
    normalized.push((x - wrist[0]) / scale)
    normalized.push((y - wrist[1]) / scale)
    normalized.push(z) // Z is already normalized by MediaPipe
  }

  return normalized
}

// Convert index back to letter using trained letter mapping
export function indexToLetter(index: number): string {
  const letters = getTrainedLetters()
  return letters[index] || '?'
}

// Shuffle array in place (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Prepare training data from samples (only for letters with samples)
export function prepareData(samples: Sample[]): { xs: tf.Tensor2D; ys: tf.Tensor2D; letters: string[] } {
  // Get unique letters sorted alphabetically
  const uniqueLetters = [...new Set(samples.map(s => s.letter))].sort()
  const letterToIdx = new Map(uniqueLetters.map((l, i) => [l, i]))

  // IMPORTANT: Shuffle samples before splitting into train/validation
  // TensorFlow.js validation split takes the LAST N% of data, so without
  // shuffling, the last recorded letter would only appear in validation
  const shuffledSamples = shuffleArray(samples)

  const features: number[][] = []
  const labels: number[] = []

  for (const sample of shuffledSamples) {
    const normalized = normalizeLandmarks(sample.landmarks)
    features.push(normalized)
    labels.push(letterToIdx.get(sample.letter)!)
  }

  const xs = tf.tensor2d(features)
  const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), uniqueLetters.length)

  return { xs, ys: ys as tf.Tensor2D, letters: uniqueLetters }
}

// Create the model architecture
export function createModel(numClasses: number): tf.LayersModel {
  const model = tf.sequential()

  model.add(tf.layers.dense({
    inputShape: [NUM_FEATURES],
    units: 128,
    activation: 'relu',
    kernelInitializer: 'heNormal',
  }))

  model.add(tf.layers.dropout({ rate: 0.5 }))

  model.add(tf.layers.dense({
    units: 64,
    activation: 'relu',
    kernelInitializer: 'heNormal',
  }))

  model.add(tf.layers.dropout({ rate: 0.4 }))

  model.add(tf.layers.dense({
    units: numClasses,
    activation: 'softmax',
  }))

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy'],
  })

  return model
}

// Compute class weights for imbalanced data
function computeClassWeights(samples: Sample[], letterToIdx: Map<string, number>): { [key: number]: number } {
  // Count samples per class
  const counts: { [key: number]: number } = {}
  for (const sample of samples) {
    const idx = letterToIdx.get(sample.letter)!
    counts[idx] = (counts[idx] || 0) + 1
  }

  // Find max count for normalization
  const maxCount = Math.max(...Object.values(counts))

  // Compute inverse frequency weights (rare classes get higher weight)
  const weights: { [key: number]: number } = {}
  for (const [idx, count] of Object.entries(counts)) {
    // Weight = maxCount / count, capped to avoid extreme values
    weights[Number(idx)] = Math.min(maxCount / count, 10)
  }

  return weights
}

// Train the model
export async function trainModel(
  samples: Sample[],
  onProgress?: (progress: TrainingProgress) => void,
  epochs: number = 25
): Promise<TrainingResult> {
  // Debug: Check I samples
  const iSamples = samples.filter(s => s.letter === 'I')
  console.log(`Training with ${samples.length} total samples`)
  console.log(`I samples: ${iSamples.length}`)
  if (iSamples.length > 0) {
    const first = iSamples[0]
    console.log(`First I sample landmarks[0]:`, first.landmarks[0])
    console.log(`First I sample has ${first.landmarks.length} landmarks`)

    // Check for identical samples
    const uniqueI = new Set(iSamples.map(s => JSON.stringify(s.landmarks)))
    console.log(`Unique I samples: ${uniqueI.size} / ${iSamples.length}`)
  }

  const { xs, ys, letters } = prepareData(samples)

  // Debug: Check label distribution
  const labelData = await ys.data()
  const iIdx = letters.indexOf('I')
  console.log(`I is at index ${iIdx} in letters: [${letters.join(', ')}]`)

  // Count how many samples have I as their label
  let iLabelCount = 0
  const numClasses = letters.length
  for (let i = 0; i < labelData.length; i += numClasses) {
    if (labelData[i + iIdx] === 1) iLabelCount++
  }
  console.log(`Samples labeled as I: ${iLabelCount}`)

  // Save trained letters mapping
  setTrainedLetters(letters)

  const model = createModel(letters.length)
  const letterToIdx = new Map(letters.map((l, i) => [l, i]))
  const classWeight = computeClassWeights(samples, letterToIdx)

  console.log(`Class weight for I (idx ${iIdx}): ${classWeight[iIdx]}`)

  let finalLoss = 0
  let finalAccuracy = 0
  let finalValLoss = 0
  let finalValAccuracy = 0

  // Early stopping: track best validation loss
  let bestValLoss = Infinity
  let patienceCounter = 0
  const patience = 5 // Stop if no improvement for 5 epochs
  let stopTraining = false

  await model.fit(xs, ys, {
    epochs,
    batchSize: 32,
    validationSplit: 0.2,
    shuffle: true,
    classWeight,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        finalLoss = logs?.loss || 0
        finalAccuracy = logs?.acc || 0
        finalValLoss = logs?.val_loss || 0
        finalValAccuracy = logs?.val_acc || 0

        // Early stopping logic
        if (finalValLoss < bestValLoss) {
          bestValLoss = finalValLoss
          patienceCounter = 0
        } else {
          patienceCounter++
          if (patienceCounter >= patience) {
            stopTraining = true
            model.stopTraining = true
          }
        }

        if (onProgress) {
          onProgress({
            epoch: epoch + 1,
            totalEpochs: stopTraining ? epoch + 1 : epochs,
            loss: finalLoss,
            accuracy: finalAccuracy,
            valLoss: finalValLoss,
            valAccuracy: finalValAccuracy,
          })
        }
      },
    },
  })

  // Clean up tensors
  xs.dispose()
  ys.dispose()

  return {
    accuracy: finalValAccuracy, // Return validation accuracy
    loss: finalValLoss,
    model,
  }
}

// Save model to filesystem via Electron IPC
export async function saveModel(model: tf.LayersModel): Promise<void> {
  // Get model topology
  const modelTopology = model.toJSON(null, false)

  // Get weights data
  const weightData = await model.getWeights()
  const weightSpecs: tf.io.WeightsManifestEntry[] = []
  const weightArrays: ArrayBuffer[] = []

  for (let i = 0; i < weightData.length; i++) {
    const weight = weightData[i]
    const data = await weight.data()
    const buffer = new Float32Array(data).buffer
    weightArrays.push(buffer)
    weightSpecs.push({
      name: `weight_${i}`,
      shape: weight.shape,
      dtype: weight.dtype as 'float32',
    })
  }

  // Combine all weight buffers
  const totalBytes = weightArrays.reduce((sum, arr) => sum + arr.byteLength, 0)
  const combinedBuffer = new ArrayBuffer(totalBytes)
  const combinedView = new Uint8Array(combinedBuffer)
  let offset = 0
  for (const arr of weightArrays) {
    combinedView.set(new Uint8Array(arr), offset)
    offset += arr.byteLength
  }

  // Create model.json structure
  const modelJson = JSON.stringify({
    modelTopology,
    weightsManifest: [{
      paths: ['weights.bin'],
      weights: weightSpecs,
    }],
  })

  // Save metadata
  const metadata = JSON.stringify({
    trainedLetters: getTrainedLetters(),
    dynamicLetters: [...getDynamicLetters()],
  })

  await window.electronAPI.saveModel(modelJson, combinedBuffer, metadata)
}

// Load model from filesystem via Electron IPC
export async function loadModel(): Promise<tf.LayersModel | null> {
  try {
    const data = await window.electronAPI.loadModel()
    if (!data) return null

    const { modelJson, weightsData, metadata } = data
    const modelArtifacts = JSON.parse(modelJson)

    // Parse metadata and restore state
    const meta = JSON.parse(metadata)
    if (meta.trainedLetters) {
      setTrainedLetters(meta.trainedLetters)
    }
    if (meta.dynamicLetters) {
      setDynamicLetters(new Set(meta.dynamicLetters))
    }

    // Create weight tensors from binary data
    const weightsManifest = modelArtifacts.weightsManifest[0].weights
    const weightData = new Float32Array(weightsData)

    let weightOffset = 0
    const weightMap: { [name: string]: tf.Tensor } = {}

    for (const spec of weightsManifest) {
      const size = spec.shape.reduce((a: number, b: number) => a * b, 1)
      const values = weightData.slice(weightOffset, weightOffset + size)
      weightMap[spec.name] = tf.tensor(Array.from(values), spec.shape, spec.dtype)
      weightOffset += size
    }

    // Load model with weights
    const model = await tf.loadLayersModel({
      load: async () => ({
        modelTopology: modelArtifacts.modelTopology,
        weightSpecs: weightsManifest,
        weightData: weightsData,
      }),
    })

    return model
  } catch (err) {
    console.error('Failed to load model:', err)
    return null
  }
}

// Check if a saved model exists
export async function hasStoredModel(): Promise<boolean> {
  return window.electronAPI.hasModel()
}

// Delete stored model
export async function deleteStoredModel(): Promise<void> {
  await window.electronAPI.deleteModel()
  // Also clear localStorage state
  localStorage.removeItem('signlingo-trained-letters')
  localStorage.removeItem('signlingo-dynamic-letters')
}

// Predict letter from landmarks with top N results
export async function predictTopN(
  model: tf.LayersModel,
  landmarks: number[][],
  n: number = 3
): Promise<Array<{ letter: string; confidence: number; index: number }>> {
  const normalized = normalizeLandmarks(landmarks)
  const input = tf.tensor2d([normalized])

  const prediction = model.predict(input) as tf.Tensor
  const probabilities = await prediction.data()

  input.dispose()
  prediction.dispose()

  const letters = getTrainedLetters()

  // Debug: log full state
  console.log(`Model output size: ${probabilities.length}, Trained letters: [${letters.join(',')}] (${letters.length})`)

  // Debug: log raw output for I specifically
  const iIndex = letters.indexOf('I')
  if (iIndex >= 0) {
    console.log(`Raw prob for I (idx ${iIndex}): ${probabilities[iIndex]?.toFixed(4)}`)
  }

  // Find which index has highest probability
  let maxIdx = 0
  let maxProb = 0
  for (let i = 0; i < probabilities.length; i++) {
    if (probabilities[i] > maxProb) {
      maxProb = probabilities[i]
      maxIdx = i
    }
  }
  console.log(`Highest prob: idx ${maxIdx} = ${letters[maxIdx]} (${(maxProb * 100).toFixed(1)}%)`)

  // Get all predictions with their indices
  const results: Array<{ letter: string; confidence: number; index: number }> = []
  for (let i = 0; i < probabilities.length; i++) {
    results.push({
      letter: indexToLetter(i),
      confidence: probabilities[i],
      index: i,
    })
  }

  // Sort by confidence descending and return top N
  return results.sort((a, b) => b.confidence - a.confidence).slice(0, n)
}

// Predict letter from landmarks
export async function predict(
  model: tf.LayersModel,
  landmarks: number[][]
): Promise<{ letter: string; confidence: number }> {
  const normalized = normalizeLandmarks(landmarks)
  const input = tf.tensor2d([normalized])

  const prediction = model.predict(input) as tf.Tensor
  const probabilities = await prediction.data()

  input.dispose()
  prediction.dispose()

  let maxIndex = 0
  let maxProb = 0

  for (let i = 0; i < probabilities.length; i++) {
    if (probabilities[i] > maxProb) {
      maxProb = probabilities[i]
      maxIndex = i
    }
  }

  return {
    letter: indexToLetter(maxIndex),
    confidence: maxProb,
  }
}

// ===== Dynamic Gesture Recognition =====

// Normalize a single frame's landmarks (same as normalizeLandmarks but exported)
export function normalizeFrame(landmarks: number[][]): number[] {
  const wrist = landmarks[0]
  const normalized: number[] = []

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (const [x, y] of landmarks) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const scaleX = maxX - minX || 1
  const scaleY = maxY - minY || 1
  const scale = Math.max(scaleX, scaleY)

  for (const [x, y, z] of landmarks) {
    normalized.push((x - wrist[0]) / scale)
    normalized.push((y - wrist[1]) / scale)
    normalized.push(z)
  }

  return normalized
}

// Calculate Euclidean distance between two normalized frames
function frameDistance(frame1: number[], frame2: number[]): number {
  let sum = 0
  for (let i = 0; i < frame1.length; i++) {
    const diff = frame1[i] - frame2[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

// Dynamic Time Warping distance between two sequences
export function dtwDistance(seq1: number[][], seq2: number[][]): number {
  const n = seq1.length
  const m = seq2.length

  if (n === 0 || m === 0) return Infinity

  // Create cost matrix
  const dtw: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(Infinity))
  dtw[0][0] = 0

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = frameDistance(seq1[i - 1], seq2[j - 1])
      dtw[i][j] = cost + Math.min(
        dtw[i - 1][j],     // insertion
        dtw[i][j - 1],     // deletion
        dtw[i - 1][j - 1]  // match
      )
    }
  }

  // Normalize by path length
  return dtw[n][m] / (n + m)
}

// Extract start and end positions from a dynamic sample
export function extractPositions(sample: DynamicSample): { start: number[], end: number[] } {
  const frames = sample.frames
  // Average first few frames for start position
  const startFrames = frames.slice(0, Math.min(3, frames.length))
  const endFrames = frames.slice(-Math.min(3, frames.length))

  const avgFrame = (frameSet: number[][][]): number[] => {
    const normalized = frameSet.map(f => normalizeFrame(f))
    const result: number[] = new Array(normalized[0].length).fill(0)
    for (const frame of normalized) {
      for (let i = 0; i < frame.length; i++) {
        result[i] += frame[i] / normalized.length
      }
    }
    return result
  }

  return {
    start: avgFrame(startFrames),
    end: avgFrame(endFrames)
  }
}

// Check if current landmarks match a position (start or end)
export function positionMatchScore(current: number[][], targetPosition: number[]): number {
  const normalized = normalizeFrame(current)
  const distance = frameDistance(normalized, targetPosition)
  // Convert distance to a 0-1 score (lower distance = higher score)
  // Using exponential decay for smoother scoring
  return Math.exp(-distance * 2)
}

// Recognize dynamic gesture from a sequence of frames
export function recognizeDynamicGesture(
  inputFrames: number[][][],
  samples: DynamicSample[],
  letter: string
): { confidence: number, matchedSample: DynamicSample | null } {
  const letterSamples = samples.filter(s => s.letter === letter)

  if (letterSamples.length === 0 || inputFrames.length < 5) {
    return { confidence: 0, matchedSample: null }
  }

  // Normalize input frames
  const normalizedInput = inputFrames.map(f => normalizeFrame(f))

  let bestScore = 0
  let bestSample: DynamicSample | null = null

  for (const sample of letterSamples) {
    const normalizedSample = sample.frames.map(f => normalizeFrame(f))
    const dtwDist = dtwDistance(normalizedInput, normalizedSample)

    // Convert DTW distance to confidence score
    const score = Math.exp(-dtwDist * 3)

    if (score > bestScore) {
      bestScore = score
      bestSample = sample
    }
  }

  return { confidence: bestScore, matchedSample: bestSample }
}
