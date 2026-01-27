import { useState, useCallback, useEffect, useRef } from 'react'
import * as tf from '@tensorflow/tfjs'
import { HandTracker, HandLandmarks } from '../HandTracker'
import { predict, getDynamicLetters, getDynamicSamples, normalizeFrame, positionMatchScore, extractPositions, dtwDistance, DynamicSample } from '../../lib/model'

interface Props {
  letters: string[]
  model: tf.LayersModel
  onComplete: (success: boolean) => void
}

type DynamicState = 'waiting' | 'tracking' | 'completed'

export function SignAllExercise({ letters, model, onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedLetters, setCompletedLetters] = useState<boolean[]>(new Array(letters.length).fill(false))
  const [currentPrediction, setCurrentPrediction] = useState<string | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [dynamicState, setDynamicState] = useState<DynamicState>('waiting')
  const lastPredictionTime = useRef(0)
  const correctStartTime = useRef<number | null>(null)

  // Dynamic gesture refs
  const dynamicLettersRef = useRef<Set<string>>(getDynamicLetters())
  const dynamicSamplesRef = useRef<DynamicSample[]>(getDynamicSamples())
  const motionBuffer = useRef<number[][][]>([])
  const dynamicPositions = useRef<Map<string, { start: number[], end: number[] }>>(new Map())

  const currentLetter = letters[currentIndex]
  const isComplete = completedLetters.every(Boolean)
  const isCurrentDynamic = dynamicLettersRef.current.has(currentLetter)

  // Hold for 1 second to confirm (static only)
  const HOLD_DURATION = 1000

  // Precompute dynamic positions on mount
  useEffect(() => {
    const samples = getDynamicSamples()
    dynamicSamplesRef.current = samples
    dynamicLettersRef.current = getDynamicLetters()

    const positions = new Map<string, { start: number[], end: number[] }>()
    const letterSamples = new Map<string, DynamicSample[]>()

    for (const sample of samples) {
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

  useEffect(() => {
    if (isComplete) {
      onComplete(true)
    }
  }, [isComplete, onComplete])

  // Reset dynamic state when letter changes
  useEffect(() => {
    setDynamicState('waiting')
    motionBuffer.current = []
    setHoldProgress(0)
  }, [currentIndex])

  const markLetterComplete = useCallback(() => {
    setCompletedLetters(prev => {
      const next = [...prev]
      next[currentIndex] = true
      return next
    })
    setHoldProgress(0)
    correctStartTime.current = null
    setDynamicState('waiting')
    motionBuffer.current = []

    // Move to next incomplete letter
    const nextIndex = letters.findIndex((_, i) => i > currentIndex && !completedLetters[i])
    if (nextIndex !== -1) {
      setCurrentIndex(nextIndex)
    } else {
      const anyIncomplete = completedLetters.findIndex((done, i) => !done && i !== currentIndex)
      if (anyIncomplete !== -1) {
        setCurrentIndex(anyIncomplete)
      }
    }
  }, [currentIndex, completedLetters, letters])

  const handleLandmarks = useCallback(async (data: HandLandmarks) => {
    if (isComplete) return

    const now = Date.now()
    if (now - lastPredictionTime.current < 50) return
    lastPredictionTime.current = now

    const landmarkArray = Array.from(data.landmarks).map((lm) => [lm.x, lm.y, lm.z])

    if (isCurrentDynamic) {
      // Dynamic gesture recognition
      const positions = dynamicPositions.current.get(currentLetter)
      if (!positions) {
        setCurrentPrediction(null)
        return
      }

      const { start, end } = positions

      if (dynamicState === 'waiting') {
        const startScore = positionMatchScore(landmarkArray, start)
        setHoldProgress(startScore > 0.5 ? startScore * 0.3 : 0)

        if (startScore > 0.6) {
          setDynamicState('tracking')
          motionBuffer.current = [landmarkArray]
          setCurrentPrediction(currentLetter)
        } else {
          setCurrentPrediction(null)
        }
      } else if (dynamicState === 'tracking') {
        motionBuffer.current.push(landmarkArray)
        setCurrentPrediction(currentLetter)

        const endScore = positionMatchScore(landmarkArray, end)
        const minFrames = 8
        const maxFrames = 90

        // Progress based on frames collected and end position proximity
        const frameProgress = Math.min(motionBuffer.current.length / minFrames, 1)
        const progress = 0.3 + frameProgress * 0.4 + (endScore > 0.5 ? endScore * 0.3 : 0)
        setHoldProgress(Math.min(progress, 0.95))

        if (motionBuffer.current.length >= minFrames && endScore > 0.5) {
          // Verify with DTW
          const letterSamples = dynamicSamplesRef.current.filter(s => s.letter === currentLetter)
          let bestScore = 0

          for (const sample of letterSamples) {
            const normalizedSample = sample.frames.map(f => normalizeFrame(f))
            const normalizedInput = motionBuffer.current.map(f => normalizeFrame(f))
            const dist = dtwDistance(normalizedInput, normalizedSample)
            const score = Math.exp(-dist * 2)
            bestScore = Math.max(bestScore, score)
          }

          if (bestScore > 0.35) {
            setHoldProgress(1)
            setDynamicState('completed')
            setTimeout(() => markLetterComplete(), 200)
            return
          }
        }

        if (motionBuffer.current.length > maxFrames) {
          // Timeout - reset
          setDynamicState('waiting')
          motionBuffer.current = []
          setHoldProgress(0)
        }
      }
    } else {
      // Static gesture recognition
      const result = await predict(model, landmarkArray)

      if (result.confidence > 0.7) {
        setCurrentPrediction(result.letter)

        if (result.letter === currentLetter) {
          if (!correctStartTime.current) {
            correctStartTime.current = now
          }
          const elapsed = now - correctStartTime.current
          setHoldProgress(Math.min(elapsed / HOLD_DURATION, 1))

          if (elapsed >= HOLD_DURATION) {
            markLetterComplete()
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
  }, [model, currentLetter, currentIndex, completedLetters, letters, isComplete, isCurrentDynamic, dynamicState, markLetterComplete])

  const handleHandLost = useCallback(() => {
    setCurrentPrediction(null)
    setHoldProgress(0)
    correctStartTime.current = null
    if (isCurrentDynamic) {
      setDynamicState('waiting')
      motionBuffer.current = []
    }
  }, [isCurrentDynamic])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Camera */}
      <div>
        <HandTracker
          className="aspect-video w-full"
          onLandmarks={handleLandmarks}
          onHandLost={handleHandLost}
        />

        {/* Current prediction feedback */}
        <div className="mt-3 text-center">
          {isCurrentDynamic ? (
            <div className={`text-lg font-medium ${
              dynamicState === 'tracking' ? 'text-purple-400' :
              dynamicState === 'completed' ? 'text-mint-400' : 'text-gray-500'
            }`}>
              {dynamicState === 'waiting' && `Start the motion for ${currentLetter}`}
              {dynamicState === 'tracking' && `Keep moving... ${currentLetter}`}
              {dynamicState === 'completed' && `${currentLetter} ✓`}
            </div>
          ) : currentPrediction ? (
            <div className={`text-lg font-medium ${currentPrediction === currentLetter ? 'text-mint-400' : 'text-gray-400'}`}>
              Signing: {currentPrediction}
              {currentPrediction === currentLetter && ' ✓'}
            </div>
          ) : (
            <div className="text-gray-500">Show the sign for {currentLetter}</div>
          )}
        </div>
      </div>

      {/* Letter cards */}
      <div className="flex flex-col justify-center">
        <h3 className="text-sm text-gray-400 mb-4 text-center">Sign each letter</h3>

        <div className="grid grid-cols-2 gap-3">
          {letters.map((letter, i) => {
            const isActive = i === currentIndex
            const isDone = completedLetters[i]
            const isDynamic = dynamicLettersRef.current.has(letter)

            return (
              <button
                key={i}
                onClick={() => !isDone && setCurrentIndex(i)}
                className={`relative p-6 rounded-xl text-center transition-all ${
                  isDone
                    ? isDynamic
                      ? 'bg-purple-500/20 border-2 border-purple-500/50'
                      : 'bg-mint-500/20 border-2 border-mint-500/50'
                    : isActive
                    ? 'bg-purple-500/20 border-2 border-purple-500'
                    : 'bg-gray-800 border-2 border-gray-700 hover:border-gray-600'
                }`}
              >
                <span className={`text-4xl font-bold ${
                  isDone
                    ? isDynamic ? 'text-purple-400' : 'text-mint-400'
                    : isActive ? 'text-white' : 'text-gray-400'
                }`}>
                  {letter}
                </span>

                {isDone && (
                  <span className={`absolute top-2 right-2 ${isDynamic ? 'text-purple-400' : 'text-mint-400'}`}>✓</span>
                )}

                {/* Dynamic indicator */}
                {isDynamic && !isDone && (
                  <span className="absolute top-2 left-2 text-purple-400 text-xs">↺</span>
                )}

                {/* Hold/motion progress ring */}
                {isActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <svg className="w-20 h-20 -rotate-90">
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        fill="none"
                        stroke="rgba(168, 85, 247, 0.3)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        fill="none"
                        stroke="#a855f7"
                        strokeWidth="4"
                        strokeDasharray="226 226"
                        strokeDashoffset={226 - (holdProgress * 226)}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.1s ease-out' }}
                      />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          {isCurrentDynamic
            ? 'Complete the motion from start to end'
            : 'Hold each sign for 1 second to confirm'}
        </p>
      </div>
    </div>
  )
}
