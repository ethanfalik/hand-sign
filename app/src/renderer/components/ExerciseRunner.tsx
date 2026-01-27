import { useState } from 'react'
import * as tf from '@tensorflow/tfjs'
import { Exercise, getExerciseTypeName } from '../lib/lessons'
import {
  SignAllExercise,
  SpellItExercise,
  QuickFireExercise,
  FillGapExercise,
  MemoryChainExercise,
} from './exercises'

interface Props {
  exercises: Exercise[]
  model: tf.LayersModel
  onComplete: (results: ExerciseResult[]) => void
  onExit: () => void
}

export interface ExerciseResult {
  exercise: Exercise
  success: boolean
  score?: number
}

const ENCOURAGEMENTS = [
  'Great job!',
  'You got it!',
  'Perfect!',
  'Nice work!',
  'Excellent!',
  'Keep it up!',
  'Amazing!',
  'Well done!',
]

function getRandomEncouragement(): string {
  return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]
}

export function ExerciseRunner({ exercises, model, onComplete, onExit }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [results, setResults] = useState<ExerciseResult[]>([])
  const [phase, setPhase] = useState<'exercise' | 'celebration'>('exercise')
  const [encouragement, setEncouragement] = useState('')
  const [lastScore, setLastScore] = useState<number | undefined>()

  const currentExercise = exercises[currentIndex]
  const isLastExercise = currentIndex === exercises.length - 1
  const progress = ((currentIndex) / exercises.length) * 100

  const handleExerciseComplete = (success: boolean, score?: number) => {
    const result: ExerciseResult = {
      exercise: currentExercise,
      success,
      score,
    }

    setResults(prev => [...prev, result])
    setEncouragement(getRandomEncouragement())
    setLastScore(score)
    setPhase('celebration')
  }

  const handleContinue = () => {
    if (isLastExercise) {
      onComplete([...results])
    } else {
      setCurrentIndex(prev => prev + 1)
      setPhase('exercise')
    }
  }

  // Celebration screen between exercises
  if (phase === 'celebration') {
    return (
      <div className="max-w-md mx-auto">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-mint-500 transition-all duration-500 ease-out"
              style={{ width: `${((currentIndex + 1) / exercises.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Celebration */}
        <div className="text-center py-6">
          <div className="relative inline-block mb-4">
            {/* Green circle background */}
            <div className="w-20 h-20 rounded-full bg-mint-500 flex items-center justify-center animate-scale-in">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-1">{encouragement}</h2>

          {lastScore !== undefined && (
            <p className="text-purple-400 mb-1">Score: {lastScore}</p>
          )}

          <p className="text-gray-500 text-sm mb-6">
            {currentIndex + 1} of {exercises.length} complete
          </p>

          <button
            onClick={handleContinue}
            className="w-full bg-mint-500 text-white py-4 rounded-2xl font-semibold text-lg btn-float"
          >
            {isLastExercise ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  // Exercise screen
  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onExit}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-mint-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Exercise type label */}
      <div className="text-center mb-4">
        <span className="text-sm text-gray-500">{getExerciseTypeName(currentExercise.type)}</span>
      </div>

      {/* Render the appropriate exercise component */}
      {renderExercise(currentExercise, model, handleExerciseComplete)}
    </div>
  )
}

function renderExercise(
  exercise: Exercise,
  model: tf.LayersModel,
  onComplete: (success: boolean, score?: number) => void
) {
  switch (exercise.type) {
    case 'sign-all':
      return (
        <SignAllExercise
          letters={exercise.letters || []}
          model={model}
          onComplete={onComplete}
        />
      )

    case 'spell-it':
      return (
        <SpellItExercise
          word={exercise.word || ''}
          model={model}
          onComplete={onComplete}
        />
      )

    case 'quick-fire':
      return (
        <QuickFireExercise
          letters={exercise.letters || []}
          timeLimit={exercise.timeLimit || 30}
          model={model}
          onComplete={onComplete}
        />
      )

    case 'fill-gap':
      return (
        <FillGapExercise
          word={exercise.word || ''}
          gapIndex={exercise.gapIndex || 0}
          model={model}
          onComplete={onComplete}
        />
      )

    case 'memory-chain':
      return (
        <MemoryChainExercise
          sequence={exercise.sequence || []}
          model={model}
          onComplete={onComplete}
        />
      )

    default:
      return <div>Unknown exercise type</div>
  }
}
