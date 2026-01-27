import { useState, useCallback, useRef, useEffect } from 'react'
import * as tf from '@tensorflow/tfjs'
import { HandTracker, HandLandmarks } from '../HandTracker'
import { predict, getDynamicLetters, getDynamicSamples, normalizeFrame, positionMatchScore, extractPositions, dtwDistance, DynamicSample } from '../../lib/model'

interface Props {
  letters: string[]
  timeLimit: number
  model: tf.LayersModel
  onComplete: (success: boolean, score?: number) => void
}

type DynamicState = 'waiting' | 'tracking'

export function QuickFireExercise({ letters, timeLimit, model, onComplete }: Props) {
  const [currentLetter, setCurrentLetter] = useState(() => randomLetter(letters))
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(timeLimit)
  const [isActive, setIsActive] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [currentPrediction, setCurrentPrediction] = useState<string | null>(null)
  const [showCorrect, setShowCorrect] = useState(false)
  const [dynamicState, setDynamicState] = useState<DynamicState>('waiting')
  const lastPredictionTime = useRef(0)
  const correctStartTime = useRef<number | null>(null)

  // Dynamic gesture refs
  const dynamicLettersRef = useRef<Set<string>>(getDynamicLetters())
  const dynamicSamplesRef = useRef<DynamicSample[]>(getDynamicSamples())
  const motionBuffer = useRef<number[][][]>([])
  const dynamicPositions = useRef<Map<string, { start: number[], end: number[] }>>(new Map())

  const isCurrentDynamic = dynamicLettersRef.current.has(currentLetter)
  const HOLD_DURATION = 500 // Faster for quick fire

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

  // Countdown timer
  useEffect(() => {
    if (!isActive || isComplete) return

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsComplete(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isActive, isComplete])

  // Complete handler
  useEffect(() => {
    if (isComplete) {
      onComplete(true, score)
    }
  }, [isComplete, score, onComplete])

  // Reset dynamic state when letter changes
  useEffect(() => {
    setDynamicState('waiting')
    motionBuffer.current = []
  }, [currentLetter])

  const markCorrect = useCallback(() => {
    const nextLetter = randomLetter(letters, currentLetter)
    correctStartTime.current = null
    setDynamicState('waiting')
    motionBuffer.current = []

    requestAnimationFrame(() => {
      setScore(prev => prev + 1)
      setCurrentLetter(nextLetter)
      setShowCorrect(true)
      setTimeout(() => setShowCorrect(false), 200)
    })
  }, [letters, currentLetter])

  const handleLandmarks = useCallback(async (data: HandLandmarks) => {
    if (!isActive || isComplete) return

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
        const minFrames = 6 // Faster for quick fire
        const maxFrames = 60

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

          if (bestScore > 0.3) {
            markCorrect()
            return
          }
        }

        if (motionBuffer.current.length > maxFrames) {
          setDynamicState('waiting')
          motionBuffer.current = []
        }
      }
    } else {
      // Static gesture recognition
      const result = await predict(model, landmarkArray)

      if (result.confidence > 0.65) {
        setCurrentPrediction(result.letter)

        if (result.letter === currentLetter) {
          if (!correctStartTime.current) {
            correctStartTime.current = now
          }
          const elapsed = now - correctStartTime.current

          if (elapsed >= HOLD_DURATION) {
            markCorrect()
          }
        } else {
          correctStartTime.current = null
        }
      } else {
        setCurrentPrediction(null)
        correctStartTime.current = null
      }
    }
  }, [model, currentLetter, letters, isActive, isComplete, isCurrentDynamic, dynamicState, markCorrect])

  const handleHandLost = useCallback(() => {
    setCurrentPrediction(null)
    correctStartTime.current = null
    if (isCurrentDynamic) {
      setDynamicState('waiting')
      motionBuffer.current = []
    }
  }, [isCurrentDynamic])

  if (isComplete) {
    return null
  }

  if (!isActive) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">⚡</div>
        <h2 className="text-2xl font-bold text-white mb-2">Quick Fire</h2>
        <p className="text-gray-400 mb-6">
          Sign as many letters as you can in {timeLimit} seconds
        </p>
        <button
          onClick={() => setIsActive(true)}
          className="bg-purple-500 hover:bg-purple-600 text-white px-8 py-3 rounded-lg font-medium transition-colors"
        >
          Start!
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Camera */}
      <div>
        <HandTracker
          className="aspect-video w-full"
          onLandmarks={handleLandmarks}
          onHandLost={handleHandLost}
        />
      </div>

      {/* Game display */}
      <div className="flex flex-col justify-center items-center">
        {/* Timer and score */}
        <div className="flex gap-8 mb-8">
          <div className="text-center">
            <div className={`text-4xl font-bold ${timeLeft <= 5 ? 'text-red-400' : 'text-white'}`}>
              {timeLeft}
            </div>
            <div className="text-xs text-gray-500">seconds</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-400">{score}</div>
            <div className="text-xs text-gray-500">score</div>
          </div>
        </div>

        {/* Current letter */}
        <div className={`relative w-32 h-32 rounded-2xl flex items-center justify-center text-6xl font-bold transition-all ${
          showCorrect
            ? 'bg-mint-500/30 text-mint-400 scale-110'
            : isCurrentDynamic && dynamicState === 'tracking'
            ? 'bg-purple-500/30 text-purple-400'
            : 'bg-gray-800 text-white'
        }`}>
          {currentLetter}
          {isCurrentDynamic && (
            <span className="absolute top-2 right-2 text-purple-400 text-sm">↺</span>
          )}
        </div>

        {isCurrentDynamic ? (
          <div className={`mt-4 text-lg ${dynamicState === 'tracking' ? 'text-purple-400' : 'text-gray-500'}`}>
            {dynamicState === 'waiting' ? 'Start motion' : 'Moving...'}
          </div>
        ) : currentPrediction ? (
          <div className={`mt-4 text-lg ${currentPrediction === currentLetter ? 'text-mint-400' : 'text-gray-500'}`}>
            {currentPrediction}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function randomLetter(letters: string[], exclude?: string): string {
  const available = exclude ? letters.filter(l => l !== exclude) : letters
  return available[Math.floor(Math.random() * available.length)]
}
