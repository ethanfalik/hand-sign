import { useState, useCallback, useRef, useEffect } from 'react'
import * as tf from '@tensorflow/tfjs'
import { HandTracker, HandLandmarks } from '../HandTracker'
import { predict, getDynamicLetters, getDynamicSamples, normalizeFrame, positionMatchScore, extractPositions, dtwDistance, DynamicSample } from '../../lib/model'

interface Props {
  word: string
  gapIndex: number
  model: tf.LayersModel
  onComplete: (success: boolean) => void
}

type DynamicState = 'waiting' | 'tracking'

export function FillGapExercise({ word, gapIndex, model, onComplete }: Props) {
  const letters = word.split('')
  const missingLetter = letters[gapIndex]
  const [currentPrediction, setCurrentPrediction] = useState<string | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [isWrong, setIsWrong] = useState(false)
  const [dynamicState, setDynamicState] = useState<DynamicState>('waiting')
  const lastPredictionTime = useRef(0)
  const correctStartTime = useRef<number | null>(null)
  const wrongStartTime = useRef<number | null>(null)
  const wrongShownAt = useRef<number | null>(null)

  // Dynamic gesture refs
  const dynamicLettersRef = useRef<Set<string>>(getDynamicLetters())
  const dynamicSamplesRef = useRef<DynamicSample[]>(getDynamicSamples())
  const motionBuffer = useRef<number[][][]>([])
  const dynamicPositions = useRef<Map<string, { start: number[], end: number[] }>>(new Map())

  const isDynamic = dynamicLettersRef.current.has(missingLetter)
  const HOLD_DURATION = 1000

  // Precompute dynamic positions
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

  const handleLandmarks = useCallback(async (data: HandLandmarks) => {
    if (isComplete) return

    const now = Date.now()
    if (now - lastPredictionTime.current < 50) return
    lastPredictionTime.current = now

    const landmarkArray = Array.from(data.landmarks).map((lm) => [lm.x, lm.y, lm.z])

    if (isDynamic) {
      // Dynamic gesture recognition
      const positions = dynamicPositions.current.get(missingLetter)
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
          setCurrentPrediction(missingLetter)
          setIsWrong(false)
        } else {
          setCurrentPrediction(null)
        }
      } else if (dynamicState === 'tracking') {
        motionBuffer.current.push(landmarkArray)
        setCurrentPrediction(missingLetter)

        const endScore = positionMatchScore(landmarkArray, end)
        const minFrames = 8
        const maxFrames = 90

        const frameProgress = Math.min(motionBuffer.current.length / minFrames, 1)
        const progress = 0.3 + frameProgress * 0.4 + (endScore > 0.5 ? endScore * 0.3 : 0)
        setHoldProgress(Math.min(progress, 0.95))

        if (motionBuffer.current.length >= minFrames && endScore > 0.5) {
          const letterSamples = dynamicSamplesRef.current.filter(s => s.letter === missingLetter)
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
            setIsComplete(true)
            return
          }
        }

        if (motionBuffer.current.length > maxFrames) {
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

        if (result.letter === missingLetter) {
          setIsWrong(false)
          wrongStartTime.current = null
          wrongShownAt.current = null
          if (!correctStartTime.current) {
            correctStartTime.current = now
          }
          const elapsed = now - correctStartTime.current
          setHoldProgress(Math.min(elapsed / HOLD_DURATION, 1))

          if (elapsed >= HOLD_DURATION) {
            setIsComplete(true)
          }
        } else {
          correctStartTime.current = null
          setHoldProgress(0)

          if (!wrongShownAt.current || now - wrongShownAt.current > 1000) {
            if (!wrongStartTime.current) {
              wrongStartTime.current = now
            }
            const elapsed = now - wrongStartTime.current
            if (elapsed >= 500) {
              setIsWrong(true)
              wrongShownAt.current = now
              wrongStartTime.current = null
              setTimeout(() => setIsWrong(false), 500)
            }
          }
        }
      } else {
        setCurrentPrediction(null)
        correctStartTime.current = null
        setHoldProgress(0)
      }
    }
  }, [model, missingLetter, isComplete, isDynamic, dynamicState])

  const handleHandLost = useCallback(() => {
    setCurrentPrediction(null)
    setHoldProgress(0)
    correctStartTime.current = null
    wrongStartTime.current = null
    if (isDynamic) {
      setDynamicState('waiting')
      motionBuffer.current = []
    }
  }, [isDynamic])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Camera */}
      <div>
        <HandTracker
          className="aspect-video w-full"
          onLandmarks={handleLandmarks}
          onHandLost={handleHandLost}
        />

        {holdProgress > 0 && (
          <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-mint-400 transition-all duration-100"
              style={{ width: `${holdProgress * 100}%`, transition: 'width 0.1s ease-out' }}
            />
          </div>
        )}
      </div>

      {/* Word display */}
      <div className="flex flex-col justify-center items-center">
        <h3 className="text-sm text-gray-400 mb-6">Sign the missing letter</h3>

        <div className="flex gap-2 mb-8">
          {letters.map((letter, i) => {
            const isGap = i === gapIndex

            return (
              <div
                key={i}
                className={`w-14 h-16 rounded-lg flex items-center justify-center text-2xl font-bold transition-all ${
                  isGap
                    ? isWrong
                      ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
                      : holdProgress > 0
                      ? 'bg-mint-500/20 border-2 border-mint-500 text-mint-400'
                      : 'bg-purple-500/20 border-2 border-purple-500 text-purple-400'
                    : 'bg-gray-800 text-white border-2 border-gray-700'
                }`}
              >
                {isGap ? (currentPrediction || '_') : letter}
              </div>
            )
          })}
        </div>

        {isDynamic ? (
          <div className={`text-lg ${
            dynamicState === 'tracking' ? 'text-purple-400' : 'text-gray-500'
          }`}>
            {dynamicState === 'waiting' ? `Start motion for ${missingLetter}` : 'Keep moving...'}
          </div>
        ) : currentPrediction ? (
          <div className={`text-lg ${
            currentPrediction === missingLetter
              ? 'text-mint-400'
              : isWrong
              ? 'text-red-400'
              : 'text-gray-400'
          }`}>
            Signing: {currentPrediction}
            {currentPrediction === missingLetter && ' ✓'}
            {isWrong && ' ✗'}
          </div>
        ) : null}

        <p className="text-xs text-gray-500 mt-4">
          {isDynamic ? 'Complete the motion for the missing letter' : 'What letter completes the word?'}
        </p>
      </div>
    </div>
  )
}
