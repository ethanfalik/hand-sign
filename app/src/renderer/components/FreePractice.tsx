import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import * as tf from '@tensorflow/tfjs'
import { HandTracker, HandLandmarks } from './HandTracker'
import {
  predict,
  predictTopN,
  getDynamicLetters,
  getDynamicSamples,
  normalizeFrame,
  positionMatchScore,
  extractPositions,
  dtwDistance,
  DynamicSample,
  Sample,
  getTrainedLetters,
} from '../lib/model'

interface Props {
  model: tf.LayersModel
  onBack: () => void
}

type DynamicState = 'waiting' | 'tracking' | 'completed'

export function FreePractice({ model, onBack }: Props) {
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [currentPrediction, setCurrentPrediction] = useState<string | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [dynamicState, setDynamicState] = useState<DynamicState>('waiting')
  const [holdProgress, setHoldProgress] = useState(0)
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [topPredictions, setTopPredictions] = useState<Array<{ letter: string; confidence: number }>>([])
  const [totalStaticSamples, setTotalStaticSamples] = useState(0)
  const [totalDynamicSamples, setTotalDynamicSamples] = useState(0)
  const [storedLetters, setStoredLetters] = useState<string[]>([])
  const [letterCounts, setLetterCounts] = useState<Record<string, number>>({})

  const lastPredictionTime = useRef(0)
  const correctStartTime = useRef<number | null>(null)

  // Dynamic gesture state
  const dynamicLettersRef = useRef<Set<string>>(getDynamicLetters())
  const dynamicSamplesRef = useRef<DynamicSample[]>(getDynamicSamples())
  const staticSamplesRef = useRef<Sample[]>([])
  const motionBuffer = useRef<number[][][]>([])
  const dynamicPositions = useRef<Map<string, { start: number[], end: number[] }>>(new Map())

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const isDynamic = selectedLetter ? dynamicLettersRef.current.has(selectedLetter) : false

  // Load samples and precompute positions
  useEffect(() => {
    const saved = localStorage.getItem('signlingo-samples')
    const staticSamples: Sample[] = saved ? JSON.parse(saved) : []
    staticSamplesRef.current = staticSamples

    const dynamicSamplesList = getDynamicSamples()
    dynamicSamplesRef.current = dynamicSamplesList
    dynamicLettersRef.current = getDynamicLetters()

    // Update debug state
    setTotalStaticSamples(staticSamples.length)
    setTotalDynamicSamples(dynamicSamplesList.length)
    setStoredLetters([...new Set(staticSamples.map(s => s.letter))].sort())

    // Count per letter
    const counts: Record<string, number> = {}
    for (const s of staticSamples) {
      counts[s.letter] = (counts[s.letter] || 0) + 1
    }
    setLetterCounts(counts)

    const positions = new Map<string, { start: number[], end: number[] }>()
    const letterSamples = new Map<string, DynamicSample[]>()

    for (const sample of dynamicSamplesList) {
      const existing = letterSamples.get(sample.letter) || []
      existing.push(sample)
      letterSamples.set(sample.letter, existing)
    }

    for (const [letter, letterSampleList] of letterSamples) {
      const allStarts: number[][] = []
      const allEnds: number[][] = []

      for (const sample of letterSampleList) {
        const { start, end } = extractPositions(sample)
        allStarts.push(start)
        allEnds.push(end)
      }

      if (allStarts.length > 0) {
        const avgStart = allStarts[0].map((_, i) =>
          allStarts.reduce((sum, s) => sum + s[i], 0) / allStarts.length
        )
        const avgEnd = allEnds[0].map((_, i) =>
          allEnds.reduce((sum, s) => sum + s[i], 0) / allEnds.length
        )
        positions.set(letter, { start: avgStart, end: avgEnd })
      }
    }

    dynamicPositions.current = positions
  }, [])

  // Reset when letter changes
  useEffect(() => {
    setDynamicState('waiting')
    motionBuffer.current = []
    setHoldProgress(0)
    correctStartTime.current = null
    setCurrentPrediction(null)
    setDebugInfo('')
  }, [selectedLetter])

  // Get hint landmarks for the selected letter
  const getHintLandmarks = useCallback((): number[][] | null => {
    if (!selectedLetter) return null

    if (isDynamic) {
      // For dynamic, show the starting position landmarks
      const samples = dynamicSamplesRef.current.filter(s => s.letter === selectedLetter)
      if (samples.length > 0 && samples[0].frames.length > 0) {
        return samples[0].frames[0] // First frame of first sample
      }
    } else {
      // For static, show average of first few samples
      const samples = staticSamplesRef.current.filter(s => s.letter === selectedLetter)
      if (samples.length > 0) {
        return samples[0].landmarks
      }
    }
    return null
  }, [selectedLetter, isDynamic])

  const handleLandmarks = useCallback(async (data: HandLandmarks) => {
    if (!selectedLetter) return

    const now = Date.now()
    if (now - lastPredictionTime.current < 50) return
    lastPredictionTime.current = now

    const landmarkArray = Array.from(data.landmarks).map((lm) => [lm.x, lm.y, lm.z])

    if (isDynamic) {
      const positions = dynamicPositions.current.get(selectedLetter)
      if (!positions) {
        setDebugInfo(`No dynamic samples for ${selectedLetter}`)
        return
      }

      const { start, end } = positions

      if (dynamicState === 'waiting') {
        const startScore = positionMatchScore(landmarkArray, start)
        setHoldProgress(startScore > 0.4 ? startScore * 0.3 : 0)
        setDebugInfo(`Start score: ${(startScore * 100).toFixed(1)}%`)

        if (startScore > 0.6) {
          setDynamicState('tracking')
          motionBuffer.current = [landmarkArray]
          setCurrentPrediction(selectedLetter)
        } else {
          setCurrentPrediction(null)
        }
      } else if (dynamicState === 'tracking') {
        motionBuffer.current.push(landmarkArray)
        setCurrentPrediction(selectedLetter)

        const endScore = positionMatchScore(landmarkArray, end)
        const minFrames = 8
        const maxFrames = 90

        const frameProgress = Math.min(motionBuffer.current.length / minFrames, 1)
        const progress = 0.3 + frameProgress * 0.4 + (endScore > 0.5 ? endScore * 0.3 : 0)
        setHoldProgress(Math.min(progress, 0.95))
        setDebugInfo(`Tracking: ${motionBuffer.current.length} frames, end score: ${(endScore * 100).toFixed(1)}%`)

        if (motionBuffer.current.length >= minFrames && endScore > 0.5) {
          const letterSamples = dynamicSamplesRef.current.filter(s => s.letter === selectedLetter)
          let bestScore = 0

          for (const sample of letterSamples) {
            const normalizedSample = sample.frames.map(f => normalizeFrame(f))
            const normalizedInput = motionBuffer.current.map(f => normalizeFrame(f))
            const dist = dtwDistance(normalizedInput, normalizedSample)
            const score = Math.exp(-dist * 2)
            bestScore = Math.max(bestScore, score)
          }

          setDebugInfo(`DTW score: ${(bestScore * 100).toFixed(1)}%`)

          if (bestScore > 0.35) {
            setHoldProgress(1)
            setDynamicState('completed')
            setConfidence(bestScore)
            setTimeout(() => {
              setDynamicState('waiting')
              motionBuffer.current = []
              setHoldProgress(0)
            }, 1000)
            return
          }
        }

        if (motionBuffer.current.length > maxFrames) {
          setDynamicState('waiting')
          motionBuffer.current = []
          setHoldProgress(0)
          setDebugInfo('Timeout - restarting')
        }
      }
    } else {
      // Static gesture recognition - get ALL predictions for trained letters
      const allResults = await predictTopN(model, landmarkArray, 26)

      // Filter to only show letters we have samples for, plus top prediction
      const trainedLetters = new Set(Object.keys(letterCounts))
      const relevantResults = allResults.filter(r => trainedLetters.has(r.letter) || r.confidence > 0.01)
      setTopPredictions(relevantResults.slice(0, 10))

      const result = allResults[0]
      setConfidence(result.confidence)

      // Build debug string - show all trained letters
      const trainedPreds = allResults
        .filter(r => trainedLetters.has(r.letter))
        .map(r => `${r.letter}:${(r.confidence * 100).toFixed(1)}%`)
        .join(' ')
      setDebugInfo(trainedPreds)

      if (result.confidence > 0.7) {
        setCurrentPrediction(result.letter)

        if (result.letter === selectedLetter) {
          if (!correctStartTime.current) {
            correctStartTime.current = now
          }
          const elapsed = now - correctStartTime.current
          setHoldProgress(Math.min(elapsed / 1000, 1))

          if (elapsed >= 1000) {
            setHoldProgress(1)
            setTimeout(() => {
              setHoldProgress(0)
              correctStartTime.current = null
            }, 500)
          }
        } else {
          correctStartTime.current = null
          setHoldProgress(0)
        }
      } else {
        setCurrentPrediction(null)
        correctStartTime.current = null
        setHoldProgress(0)
      }
    }
  }, [model, selectedLetter, isDynamic, dynamicState])

  const handleHandLost = useCallback(() => {
    setCurrentPrediction(null)
    setHoldProgress(0)
    correctStartTime.current = null
    if (isDynamic) {
      setDynamicState('waiting')
      motionBuffer.current = []
    }
  }, [isDynamic])

  const hintLandmarks = showHint ? getHintLandmarks() : null

  // Get sample counts for display
  const getSampleCount = useCallback((letter: string) => {
    if (dynamicLettersRef.current.has(letter)) {
      return dynamicSamplesRef.current.filter(s => s.letter === letter).length
    }
    return letterCounts[letter] || 0
  }, [letterCounts])

  // Get training sample count (what was actually trained - excludes dynamic letters)
  const getTrainingSampleCount = useCallback((letter: string) => {
    if (dynamicLettersRef.current.has(letter)) {
      return 0 // Dynamic letters aren't in the static model
    }
    return letterCounts[letter] || 0
  }, [letterCounts])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-white">Free Practice</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Camera */}
        <div className="lg:col-span-2">
          <div className="relative">
            <HandTracker
              className="aspect-video w-full"
              onLandmarks={handleLandmarks}
              onHandLost={handleHandLost}
            />

            {/* Hint overlay */}
            {showHint && hintLandmarks && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
              >
                {/* Draw connections */}
                {[
                  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
                  [0, 5], [5, 6], [6, 7], [7, 8], // Index
                  [0, 9], [9, 10], [10, 11], [11, 12], // Middle
                  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
                  [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
                  [5, 9], [9, 13], [13, 17], // Palm
                ].map(([a, b], i) => (
                  <line
                    key={i}
                    x1={1 - hintLandmarks[a][0]}
                    y1={hintLandmarks[a][1]}
                    x2={1 - hintLandmarks[b][0]}
                    y2={hintLandmarks[b][1]}
                    stroke="rgba(168, 85, 247, 0.6)"
                    strokeWidth="0.008"
                  />
                ))}
                {/* Draw landmarks */}
                {hintLandmarks.map((lm, i) => (
                  <circle
                    key={i}
                    cx={1 - lm[0]}
                    cy={lm[1]}
                    r="0.012"
                    fill="rgba(168, 85, 247, 0.8)"
                  />
                ))}
              </svg>
            )}
          </div>

          {/* Controls and feedback */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedLetter && (
                <>
                  <div className={`text-3xl font-bold ${
                    isDynamic ? 'text-purple-400' : 'text-mint-400'
                  }`}>
                    {selectedLetter}
                  </div>
                  <button
                    onClick={() => setShowHint(!showHint)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      showHint
                        ? 'bg-purple-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {showHint ? 'Hide Hint' : 'Show Hint'}
                  </button>
                </>
              )}
            </div>

            {/* Status */}
            <div className="text-right">
              {isDynamic ? (
                <div className={`text-sm font-medium ${
                  dynamicState === 'completed' ? 'text-mint-400' :
                  dynamicState === 'tracking' ? 'text-purple-400' : 'text-gray-500'
                }`}>
                  {dynamicState === 'waiting' && 'Start the motion'}
                  {dynamicState === 'tracking' && 'Keep moving...'}
                  {dynamicState === 'completed' && '✓ Recognized!'}
                </div>
              ) : currentPrediction ? (
                <div className={`text-sm font-medium ${
                  currentPrediction === selectedLetter ? 'text-mint-400' : 'text-gray-400'
                }`}>
                  {currentPrediction === selectedLetter ? '✓ Correct!' : `Detected: ${currentPrediction}`}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  {selectedLetter ? 'Show the sign' : 'Select a letter'}
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {holdProgress > 0 && (
            <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  isDynamic ? 'bg-purple-500' : 'bg-mint-500'
                }`}
                style={{ width: `${holdProgress * 100}%` }}
              />
            </div>
          )}

          {/* Debug info - Top predictions */}
          {!isDynamic && topPredictions.length > 0 && (
            <div className="mt-3 bg-gray-900 rounded-lg p-3 border border-gray-800">
              <div className="text-xs text-gray-500 mb-2">Top predictions:</div>
              <div className="space-y-1">
                {topPredictions.slice(0, 5).map((pred, i) => (
                  <div key={pred.letter} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 w-4">{pred.index}</span>
                    <span className={`w-6 text-sm font-bold ${
                      pred.letter === selectedLetter ? 'text-mint-400' : 'text-gray-400'
                    }`}>
                      {pred.letter}
                    </span>
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          pred.letter === selectedLetter ? 'bg-mint-500' :
                          i === 0 ? 'bg-purple-500' : 'bg-gray-600'
                        }`}
                        style={{ width: `${pred.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-12 text-right">
                      {(pred.confidence * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-gray-600 w-16 text-right">
                      ({getTrainingSampleCount(pred.letter)} smp)
                    </span>
                  </div>
                ))}
              </div>
              {selectedLetter && !topPredictions.find(p => p.letter === selectedLetter) && (
                <div className="mt-2 text-xs text-red-400">
                  {selectedLetter} not in top 5 predictions
                </div>
              )}
            </div>
          )}

          {/* Dynamic debug info */}
          {isDynamic && debugInfo && (
            <div className="mt-2 text-xs text-gray-600 font-mono">
              {debugInfo}
            </div>
          )}
        </div>

        {/* Letter grid */}
        <div className="space-y-3">
          <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
            <div className="grid grid-cols-7 gap-1.5">
              {alphabet.map((letter) => {
                const isDyn = dynamicLettersRef.current.has(letter)
                const count = getSampleCount(letter)
                const hasData = count > 0

                return (
                  <button
                    key={letter}
                    onClick={() => setSelectedLetter(letter)}
                    className={`aspect-square rounded font-semibold text-sm transition-all relative ${
                      selectedLetter === letter
                        ? 'bg-purple-500 text-white'
                        : hasData && isDyn
                        ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'
                        : hasData
                        ? 'bg-mint-500/10 text-mint-400 hover:bg-mint-500/20 border border-mint-500/20'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-750 hover:text-gray-300'
                    }`}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Selected letter info */}
          {selectedLetter && (
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold text-white">{selectedLetter}</span>
                {isDynamic && (
                  <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded">
                    Dynamic ↺
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                {getSampleCount(selectedLetter)} {isDynamic ? 'recordings' : 'samples'}
              </div>
              {getSampleCount(selectedLetter) === 0 && (
                <p className="text-xs text-red-400 mt-2">
                  No samples recorded. Go to Record tab first.
                </p>
              )}
            </div>
          )}

          {/* Debug: Total samples in storage */}
          <div className="bg-gray-900/50 rounded-xl p-3 border border-gray-800/50 text-xs">
            <div className="text-gray-500 mb-1">Stored samples:</div>
            <div className="text-gray-400 mb-2">
              {totalStaticSamples} static, {totalDynamicSamples} dynamic
            </div>
            <div className="flex flex-wrap gap-1">
              {storedLetters.map(letter => (
                <span key={letter} className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">
                  {letter}:{letterCounts[letter] || 0}
                </span>
              ))}
            </div>
            <div className="mt-2 text-gray-500">
              Model trained for: {getTrainedLetters().join(', ') || 'none'}
            </div>
            <div className="text-gray-600">
              Index mapping: {getTrainedLetters().map((l, i) => `${i}→${l}`).join(' ')}
            </div>
          </div>

          {/* Tips */}
          <div className="text-xs text-gray-600 px-1">
            {isDynamic
              ? 'Line up with the hint, then complete the motion'
              : 'Match your hand to the purple hint overlay'}
          </div>
        </div>
      </div>
    </div>
  )
}
