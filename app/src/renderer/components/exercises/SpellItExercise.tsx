import { useState, useCallback, useRef, useEffect } from 'react'
import * as tf from '@tensorflow/tfjs'
import { HandTracker, HandLandmarks } from '../HandTracker'
import { predict, getDynamicLetters, getDynamicSamples, normalizeFrame, positionMatchScore, extractPositions, dtwDistance, DynamicSample } from '../../lib/model'

interface Props {
  word: string
  model: tf.LayersModel
  onComplete: (success: boolean) => void
}

type DynamicState = 'waiting' | 'tracking' | 'completed'

export function SpellItExercise({ word, model, onComplete }: Props) {
  const letters = word.split('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [completedLetters, setCompletedLetters] = useState<string[]>([])
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
  const isComplete = completedLetters.length === letters.length
  const isCurrentDynamic = currentLetter ? dynamicLettersRef.current.has(currentLetter) : false

  const HOLD_DURATION = 800

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

        const frameProgress = Math.min(motionBuffer.current.length / minFrames, 1)
        const progress = 0.3 + frameProgress * 0.4 + (endScore > 0.5 ? endScore * 0.3 : 0)
        setHoldProgress(Math.min(progress, 0.95))

        if (motionBuffer.current.length >= minFrames && endScore > 0.5) {
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
            setTimeout(() => {
              setCompletedLetters(prev => [...prev, currentLetter])
              setCurrentIndex(prev => prev + 1)
              setHoldProgress(0)
              setDynamicState('waiting')
              motionBuffer.current = []
            }, 200)
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

        if (result.letter === currentLetter) {
          if (!correctStartTime.current) {
            correctStartTime.current = now
          }
          const elapsed = now - correctStartTime.current
          setHoldProgress(Math.min(elapsed / HOLD_DURATION, 1))

          if (elapsed >= HOLD_DURATION) {
            setCompletedLetters(prev => [...prev, currentLetter])
            setCurrentIndex(prev => prev + 1)
            setHoldProgress(0)
            correctStartTime.current = null
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
  }, [model, currentLetter, isComplete, isCurrentDynamic, dynamicState])

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

        {/* Progress bar */}
        {holdProgress > 0 && (
          <div className="mt-3 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-100"
              style={{ width: `${holdProgress * 100}%`, transition: 'width 0.1s ease-out' }}
            />
          </div>
        )}
      </div>

      {/* Word display */}
      <div className="flex flex-col justify-center items-center">
        <h3 className="text-sm text-gray-400 mb-6">Spell this word</h3>

        <div className="flex gap-2 mb-8">
          {letters.map((letter, i) => {
            const isDone = i < completedLetters.length
            const isActive = i === currentIndex
            const isDynamic = dynamicLettersRef.current.has(letter)

            return (
              <div
                key={i}
                className={`relative w-14 h-16 rounded-lg flex items-center justify-center text-2xl font-bold transition-all ${
                  isDone
                    ? isDynamic
                      ? 'bg-purple-500/20 text-purple-400 border-2 border-purple-500/50'
                      : 'bg-mint-500/20 text-mint-400 border-2 border-mint-500/50'
                    : isActive
                    ? 'bg-purple-500/20 text-white border-2 border-purple-500'
                    : 'bg-gray-800 text-gray-500 border-2 border-gray-700'
                }`}
              >
                {isDone ? letter : isActive ? letter : '?'}
                {isDynamic && !isDone && isActive && (
                  <span className="absolute top-1 right-1 text-purple-400 text-xs">↺</span>
                )}
              </div>
            )
          })}
        </div>

        {isCurrentDynamic ? (
          <div className={`text-lg ${
            dynamicState === 'tracking' ? 'text-purple-400' :
            dynamicState === 'completed' ? 'text-mint-400' : 'text-gray-500'
          }`}>
            {dynamicState === 'waiting' && `Start motion for ${currentLetter}`}
            {dynamicState === 'tracking' && `Keep moving...`}
            {dynamicState === 'completed' && `${currentLetter} ✓`}
          </div>
        ) : currentPrediction ? (
          <div className={`text-lg ${currentPrediction === currentLetter ? 'text-mint-400' : 'text-gray-400'}`}>
            Signing: {currentPrediction}
          </div>
        ) : null}

        <p className="text-xs text-gray-500 mt-4">
          {isCurrentDynamic
            ? `Complete motion for letter ${currentIndex + 1} of ${letters.length}`
            : `Sign letter ${currentIndex + 1} of ${letters.length}`}
        </p>
      </div>
    </div>
  )
}
