import { useState, useCallback, useRef, useEffect } from 'react'
import * as tf from '@tensorflow/tfjs'
import { HandTracker, HandLandmarks } from '../HandTracker'
import { predict, getDynamicLetters, getDynamicSamples, normalizeFrame, positionMatchScore, extractPositions, dtwDistance, DynamicSample } from '../../lib/model'

interface Props {
  sequence: string[]
  model: tf.LayersModel
  onComplete: (success: boolean) => void
}

type Phase = 'memorize' | 'recall' | 'complete'
type DynamicState = 'waiting' | 'tracking'

export function MemoryChainExercise({ sequence, model, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('memorize')
  const [displayIndex, setDisplayIndex] = useState(0)
  const [inputIndex, setInputIndex] = useState(0)
  const [userSequence, setUserSequence] = useState<string[]>([])
  const [currentPrediction, setCurrentPrediction] = useState<string | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [isWrong, setIsWrong] = useState(false)
  const [dynamicState, setDynamicState] = useState<DynamicState>('waiting')
  const lastPredictionTime = useRef(0)
  const correctStartTime = useRef<number | null>(null)

  // Dynamic gesture refs
  const dynamicLettersRef = useRef<Set<string>>(getDynamicLetters())
  const dynamicSamplesRef = useRef<DynamicSample[]>(getDynamicSamples())
  const motionBuffer = useRef<number[][][]>([])
  const dynamicPositions = useRef<Map<string, { start: number[], end: number[] }>>(new Map())

  const expectedLetter = sequence[inputIndex]
  const isCurrentDynamic = expectedLetter ? dynamicLettersRef.current.has(expectedLetter) : false

  const HOLD_DURATION = 800
  const DISPLAY_DURATION = 1200

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

  // Memorize phase - show each letter
  useEffect(() => {
    if (phase !== 'memorize') return

    const timer = setTimeout(() => {
      if (displayIndex < sequence.length - 1) {
        setDisplayIndex(prev => prev + 1)
      } else {
        // Done showing, switch to recall
        setTimeout(() => setPhase('recall'), 500)
      }
    }, DISPLAY_DURATION)

    return () => clearTimeout(timer)
  }, [phase, displayIndex, sequence.length])

  // Reset dynamic state when letter changes
  useEffect(() => {
    setDynamicState('waiting')
    motionBuffer.current = []
    setHoldProgress(0)
  }, [inputIndex])

  const handleLandmarks = useCallback(async (data: HandLandmarks) => {
    if (phase !== 'recall') return

    const now = Date.now()
    if (now - lastPredictionTime.current < 50) return
    lastPredictionTime.current = now

    const landmarkArray = Array.from(data.landmarks).map((lm) => [lm.x, lm.y, lm.z])

    if (isCurrentDynamic) {
      // Dynamic gesture recognition
      const positions = dynamicPositions.current.get(expectedLetter)
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
          setCurrentPrediction(expectedLetter)
          setIsWrong(false)
        } else {
          setCurrentPrediction(null)
        }
      } else if (dynamicState === 'tracking') {
        motionBuffer.current.push(landmarkArray)
        setCurrentPrediction(expectedLetter)

        const endScore = positionMatchScore(landmarkArray, end)
        const minFrames = 8
        const maxFrames = 90

        const frameProgress = Math.min(motionBuffer.current.length / minFrames, 1)
        const progress = 0.3 + frameProgress * 0.4 + (endScore > 0.5 ? endScore * 0.3 : 0)
        setHoldProgress(Math.min(progress, 0.95))

        if (motionBuffer.current.length >= minFrames && endScore > 0.5) {
          const letterSamples = dynamicSamplesRef.current.filter(s => s.letter === expectedLetter)
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
            const newUserSequence = [...userSequence, expectedLetter]
            setUserSequence(newUserSequence)

            if (newUserSequence.length === sequence.length) {
              setPhase('complete')
              onComplete(true)
            } else {
              setInputIndex(prev => prev + 1)
            }
            setDynamicState('waiting')
            motionBuffer.current = []
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

        if (result.letter === expectedLetter) {
          setIsWrong(false)
          if (!correctStartTime.current) {
            correctStartTime.current = now
          }
          const elapsed = now - correctStartTime.current
          setHoldProgress(Math.min(elapsed / HOLD_DURATION, 1))

          if (elapsed >= HOLD_DURATION) {
            const newUserSequence = [...userSequence, result.letter]
            setUserSequence(newUserSequence)

            if (newUserSequence.length === sequence.length) {
              setPhase('complete')
              onComplete(true)
            } else {
              setInputIndex(prev => prev + 1)
            }
            setHoldProgress(0)
            correctStartTime.current = null
          }
        } else {
          if (!correctStartTime.current) {
            correctStartTime.current = now
          }
          if (now - correctStartTime.current > 500) {
            setIsWrong(true)
            correctStartTime.current = null
            setTimeout(() => setIsWrong(false), 300)
          }
          setHoldProgress(0)
        }
      } else {
        setCurrentPrediction(null)
        correctStartTime.current = null
        setHoldProgress(0)
      }
    }
  }, [model, phase, sequence, inputIndex, userSequence, onComplete, expectedLetter, isCurrentDynamic, dynamicState])

  const handleHandLost = useCallback(() => {
    setCurrentPrediction(null)
    setHoldProgress(0)
    correctStartTime.current = null
    if (isCurrentDynamic) {
      setDynamicState('waiting')
      motionBuffer.current = []
    }
  }, [isCurrentDynamic])

  if (phase === 'complete') {
    return null
  }

  if (phase === 'memorize') {
    return (
      <div className="text-center py-12">
        <h3 className="text-sm text-gray-400 mb-6">Memorize this sequence</h3>

        <div className="flex justify-center gap-3 mb-8">
          {sequence.map((letter, i) => {
            const isDynamic = dynamicLettersRef.current.has(letter)
            return (
              <div
                key={i}
                className={`relative w-16 h-20 rounded-xl flex items-center justify-center text-3xl font-bold transition-all duration-300 ${
                  i === displayIndex
                    ? 'bg-purple-500 text-white scale-110'
                    : i < displayIndex
                    ? 'bg-gray-700 text-gray-400'
                    : 'bg-gray-800 text-gray-600'
                }`}
              >
                {i <= displayIndex ? letter : '?'}
                {isDynamic && i <= displayIndex && (
                  <span className="absolute top-1 right-1 text-white/60 text-xs">↺</span>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-gray-500">
          {displayIndex + 1} of {sequence.length}
        </p>
      </div>
    )
  }

  // Recall phase
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
              className="h-full bg-purple-500 transition-all duration-100"
              style={{ width: `${holdProgress * 100}%`, transition: 'width 0.1s ease-out' }}
            />
          </div>
        )}
      </div>

      {/* Sequence display */}
      <div className="flex flex-col justify-center items-center">
        <h3 className="text-sm text-gray-400 mb-6">Now sign the sequence!</h3>

        <div className="flex justify-center gap-3 mb-8">
          {sequence.map((letter, i) => {
            const isDone = i < userSequence.length
            const isActive = i === inputIndex
            const completedLetter = userSequence[i]
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
                    ? isWrong
                      ? 'bg-red-500/20 text-red-400 border-2 border-red-500'
                      : 'bg-purple-500/20 text-purple-400 border-2 border-purple-500'
                    : 'bg-gray-800 text-gray-600 border-2 border-gray-700'
                }`}
              >
                {isDone ? completedLetter : isActive ? (currentPrediction || '?') : '?'}
                {isDynamic && isActive && !isDone && (
                  <span className="absolute top-0.5 right-0.5 text-purple-400 text-xs">↺</span>
                )}
              </div>
            )
          })}
        </div>

        {isCurrentDynamic ? (
          <p className="text-xs text-gray-500">
            {dynamicState === 'waiting' ? 'Start motion' : 'Keep moving...'} - Letter {inputIndex + 1} of {sequence.length}
          </p>
        ) : (
          <p className="text-xs text-gray-500">
            Letter {inputIndex + 1} of {sequence.length}
          </p>
        )}
      </div>
    </div>
  )
}
