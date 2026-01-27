import { useState, useCallback, useEffect } from 'react'
import * as tf from '@tensorflow/tfjs'
import { HandTracker, HandLandmarks } from './components/HandTracker'
import { ExerciseRunner, ExerciseResult } from './components/ExerciseRunner'
import { FreePractice } from './components/FreePractice'
import UmapVisualization from './components/UmapVisualization'
import {
  trainModel,
  saveModel,
  loadModel,
  hasStoredModel,
  deleteStoredModel,
  TrainingProgress,
  Sample,
  DynamicSample,
  getDynamicLetters,
  setDynamicLetters,
  getDynamicSamples,
  saveDynamicSamples,
} from './lib/model'
import { generateCurriculum, Lesson } from './lib/lessons'

type Mode = 'home' | 'record' | 'train' | 'practice'

function App() {
  const [mode, setMode] = useState<Mode>('home')

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <button
            onClick={() => setMode('home')}
            className="text-xl font-semibold text-white hover:text-purple-300 transition-colors"
          >
            SignLingo
          </button>
          <nav className="flex gap-1">
            <NavButton active={mode === 'record'} onClick={() => setMode('record')}>
              Record
            </NavButton>
            <NavButton active={mode === 'train'} onClick={() => setMode('train')}>
              Train
            </NavButton>
            <NavButton active={mode === 'practice'} onClick={() => setMode('practice')}>
              Practice
            </NavButton>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {mode === 'home' && <HomePage onNavigate={setMode} />}
        {mode === 'record' && <RecordPage />}
        {mode === 'train' && <TrainPage />}
        {mode === 'practice' && <PracticePage />}
      </main>
    </div>
  )
}

function NavButton({
  children,
  active,
  onClick
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-purple-500/20 text-purple-300'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function HomePage({ onNavigate }: { onNavigate: (mode: Mode) => void }) {
  return (
    <div className="text-center py-16">
      <h1 className="text-4xl font-bold text-white mb-3">
        Learn Sign Language
      </h1>
      <p className="text-lg text-gray-400 mb-10 max-w-md mx-auto">
        Master ASL fingerspelling with interactive lessons and real-time hand tracking
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
        <ActionCard
          step="1"
          title="Record"
          description="Build your training dataset"
          onClick={() => onNavigate('record')}
        />
        <ActionCard
          step="2"
          title="Train"
          description="Train the AI model"
          onClick={() => onNavigate('train')}
        />
        <ActionCard
          step="3"
          title="Practice"
          description="Test your skills"
          onClick={() => onNavigate('practice')}
        />
      </div>
    </div>
  )
}

function ActionCard({
  step,
  title,
  description,
  onClick
}: {
  step: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="bg-gray-900 border border-gray-800 hover:border-gray-700 text-white p-5 rounded-xl text-left transition-colors group"
    >
      <span className="text-xs font-medium text-purple-400 mb-1 block">Step {step}</span>
      <h3 className="text-lg font-semibold mb-1 group-hover:text-purple-300 transition-colors">{title}</h3>
      <p className="text-gray-500 text-sm">{description}</p>
    </button>
  )
}

function RecordPage() {
  const [clearMenuOpen, setClearMenuOpen] = useState(false)
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [samples, setSamples] = useState<Sample[]>(() => {
    const saved = localStorage.getItem('signlingo-samples')
    return saved ? JSON.parse(saved) : []
  })
  const [currentSessionSamples, setCurrentSessionSamples] = useState<Sample[]>([])

  // Dynamic gesture state
  const [dynamicLetters, setDynamicLettersState] = useState<Set<string>>(() => getDynamicLetters())
  const [dynamicSamples, setDynamicSamples] = useState<DynamicSample[]>(() => getDynamicSamples())
  const [currentDynamicFrames, setCurrentDynamicFrames] = useState<number[][][]>([])
  const [currentSessionDynamicSamples, setCurrentSessionDynamicSamples] = useState<DynamicSample[]>([])

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  const isDynamicMode = selectedLetter ? dynamicLetters.has(selectedLetter) : false

  useEffect(() => {
    localStorage.setItem('signlingo-samples', JSON.stringify(samples))
  }, [samples])

  useEffect(() => {
    saveDynamicSamples(dynamicSamples)
  }, [dynamicSamples])

  useEffect(() => {
    setDynamicLetters(dynamicLetters)
  }, [dynamicLetters])

  useEffect(() => {
    if (isRecording) setClearMenuOpen(false)
  }, [isRecording])

  useEffect(() => {
    if (!clearMenuOpen) return

    const close = () => setClearMenuOpen(false)
    window.addEventListener('click', close)

    return () => window.removeEventListener('click', close)
  }, [clearMenuOpen])


  const handleLandmarks = useCallback((data: HandLandmarks) => {
    if (!isRecording || !selectedLetter) return

    const landmarkArray = Array.from(data.landmarks).map((lm) => [lm.x, lm.y, lm.z])

    if (dynamicLetters.has(selectedLetter)) {
      // Dynamic mode: collect frames into current dynamic recording
      setCurrentDynamicFrames((prev) => [...prev, landmarkArray])
    } else {
      // Static mode: add individual samples
      const newSample: Sample = {
        letter: selectedLetter,
        landmarks: landmarkArray,
        timestamp: data.timestamp,
      }
      setCurrentSessionSamples((prev) => [...prev, newSample])
    }
  }, [isRecording, selectedLetter, dynamicLetters])

  const handleStartRecording = () => {
    if (!selectedLetter) return
    setIsRecording(true)
    if (isDynamicMode) {
      setCurrentDynamicFrames([])
    } else {
      setCurrentSessionSamples([])
    }
  }

  const handleStopRecording = () => {
    setIsRecording(false)

    if (isDynamicMode && selectedLetter) {
      // Save the dynamic recording as a sample if we have enough frames
      if (currentDynamicFrames.length >= 5) {
        const newDynamicSample: DynamicSample = {
          letter: selectedLetter,
          frames: currentDynamicFrames,
          timestamp: Date.now(),
        }
        setCurrentSessionDynamicSamples((prev) => [...prev, newDynamicSample])
      }
      setCurrentDynamicFrames([])
    } else {
      setSamples((prev) => [...prev, ...currentSessionSamples])
      setCurrentSessionSamples([]) // Clear to avoid double-counting
    }
  }

  const handleSaveDynamicSession = () => {
    setDynamicSamples((prev) => [...prev, ...currentSessionDynamicSamples])
    setCurrentSessionDynamicSamples([])
  }

  const handleUndo = () => {
    if (isDynamicMode) {
      if (currentSessionDynamicSamples.length > 0) {
        setCurrentSessionDynamicSamples((prev) => prev.slice(0, -1))
      }
    } else {
      if (currentSessionSamples.length > 0) {
        setCurrentSessionSamples((prev) => prev.slice(0, -10))
      }
    }
  }

  const handleClearSession = () => {
    if (isDynamicMode) {
      setCurrentSessionDynamicSamples([])
      setCurrentDynamicFrames([])
    } else {
      setCurrentSessionSamples([])
    }
  }

  const handleClearAll = () => {
    if (confirm('Clear all recorded samples (static and dynamic)?')) {
      setSamples([])
      setCurrentSessionSamples([])
      setDynamicSamples([])
      setCurrentSessionDynamicSamples([])
      setCurrentDynamicFrames([])
    }
  }

  const handleClearLetter = () => {
    if (!selectedLetter) return

    const isDynamic = dynamicLetters.has(selectedLetter)
    if (confirm(`Clear all ${isDynamic ? 'dynamic' : 'static'} samples for "${selectedLetter}"?`)) {
      if (isDynamic) {
        setDynamicSamples((prev) => prev.filter((s) => s.letter !== selectedLetter))
        setCurrentSessionDynamicSamples((prev) =>
          prev.filter((s) => s.letter !== selectedLetter)
        )
      } else {
        setSamples((prev) => prev.filter((s) => s.letter !== selectedLetter))
        setCurrentSessionSamples((prev) =>
          prev.filter((s) => s.letter !== selectedLetter)
        )
      }
      setSelectedLetter(null)
    }
  }

  const handleToggleDynamic = () => {
    if (!selectedLetter) return

    setDynamicLettersState((prev) => {
      const next = new Set(prev)
      if (next.has(selectedLetter)) {
        next.delete(selectedLetter)
      } else {
        next.add(selectedLetter)
      }
      return next
    })
    // Clear session when switching modes
    setCurrentSessionSamples([])
    setCurrentSessionDynamicSamples([])
    setCurrentDynamicFrames([])
  }




  // Count static samples
  const staticLetterCounts = [...samples, ...currentSessionSamples].reduce((acc, s) => {
    acc[s.letter] = (acc[s.letter] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Count dynamic samples (count recordings, not frames)
  const dynamicLetterCounts = [...dynamicSamples, ...currentSessionDynamicSamples].reduce((acc, s) => {
    acc[s.letter] = (acc[s.letter] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Get the appropriate count for the selected letter
  const getLetterCount = (letter: string) => {
    if (dynamicLetters.has(letter)) {
      return dynamicLetterCounts[letter] || 0
    }
    return staticLetterCounts[letter] || 0
  }

  const totalStaticSamples = samples.length + currentSessionSamples.length
  const totalDynamicSamples = dynamicSamples.length + currentSessionDynamicSamples.length
  const totalSamples = totalStaticSamples + totalDynamicSamples

  // Letters with data (either static or dynamic depending on mode)
  const lettersWithData = new Set([
    ...Object.keys(staticLetterCounts).filter(l => !dynamicLetters.has(l)),
    ...Object.keys(dynamicLetterCounts).filter(l => dynamicLetters.has(l))
  ])

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Camera feed with hand tracking */}
        <div className="lg:col-span-2">
          <HandTracker
            className="aspect-video w-full"
            onLandmarks={handleLandmarks}
            isRecording={isRecording}
          />

          {/* Recording controls */}
          <div className="mt-3 flex items-center justify-center gap-3">
            {selectedLetter ? (
              <>
                <div className="text-center mr-2">
                  <div className={`text-3xl font-bold ${isDynamicMode ? 'text-purple-400' : 'text-mint-400'}`}>
                    {selectedLetter}
                  </div>
                  <div className="text-xs text-gray-500">
                    {getLetterCount(selectedLetter)} {isDynamicMode ? 'recordings' : 'samples'}
                  </div>
                </div>

                {isRecording ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleStopRecording}
                      className="bg-red-500/20 text-red-400 hover:bg-red-500/30 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      <span className="w-2 h-2 bg-red-400 rounded-sm"></span>
                      Stop {isDynamicMode ? `(${currentDynamicFrames.length} frames)` : `(${currentSessionSamples.length})`}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {(isDynamicMode ? currentSessionDynamicSamples.length > 0 : currentSessionSamples.length > 0) && (
                      <>
                        <button
                          onClick={handleUndo}
                          className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          Undo
                        </button>
                        <button
                          onClick={handleClearSession}
                          className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          Clear
                        </button>
                        {isDynamicMode && (
                          <button
                            onClick={handleSaveDynamicSession}
                            className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                          >
                            Save ({currentSessionDynamicSamples.length})
                          </button>
                        )}
                      </>
                    )}
                    <button
                      onClick={handleStartRecording}
                      className={`${isDynamicMode ? 'bg-purple-500 hover:bg-purple-600' : 'bg-mint-500 hover:bg-mint-600'} text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors`}
                    >
                      <span className="w-2 h-2 bg-white rounded-full"></span>
                      Record
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-gray-500 text-sm">Select a letter to start →</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          {/* Dynamic toggle (when letter selected) */}
          {selectedLetter && !isRecording && (
            <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm font-medium text-white">Dynamic Gesture</span>
                  <p className="text-xs text-gray-500">Record motion (for J, Z, etc.)</p>
                </div>
                <div
                  onClick={handleToggleDynamic}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    isDynamicMode ? 'bg-purple-500' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      isDynamicMode ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </label>
            </div>
          )}

          {/* Letter grid */}
          <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
            <div className="grid grid-cols-7 gap-1.5">
              {alphabet.map((letter) => {
                const isDynamic = dynamicLetters.has(letter)
                const count = isDynamic ? (dynamicLetterCounts[letter] || 0) : (staticLetterCounts[letter] || 0)
                const hasData = count > 0

                return (
                  <button
                    key={letter}
                    onClick={() => {
                      if (!isRecording) {
                        setSelectedLetter(letter)
                        setCurrentSessionSamples([])
                        setCurrentSessionDynamicSamples([])
                        setCurrentDynamicFrames([])
                      }
                    }}
                    disabled={isRecording}
                    className={`aspect-square rounded font-semibold text-sm transition-all relative ${
                      selectedLetter === letter
                        ? 'bg-purple-500 text-white'
                        : hasData && isDynamic
                        ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20'
                        : hasData
                        ? 'bg-mint-500/10 text-mint-400 hover:bg-mint-500/20 border border-mint-500/20'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-750 hover:text-gray-300'
                    } ${isRecording ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Stats row */}
          <div className="bg-gray-900 rounded-xl px-4 py-3 border border-gray-800 flex items-center justify-between">
            {/* Left: stats */}
            <div className="text-sm">
              <span className="text-gray-500">Samples: </span>
              <span className="text-white font-medium">{totalSamples}</span>
              <span className="text-gray-700 mx-2">|</span>
              <span className="text-gray-500">Letters: </span>
              <span className="text-white font-medium">
                {lettersWithData.size}/26
              </span>
            </div>

            {/* Right: Clear dropdown */}
            {totalSamples > 0 && !isRecording && (
              <div className="relative">
                {/* Trigger */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setClearMenuOpen((o) => !o)
                  }}
                  className="h-6 px-1 text-red-400/70 hover:text-red-400 text-xs font-medium transition-colors"
                >
                  Clear
                </button>

                {/* Dropdown */}
                {clearMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-1/2 -translate-x-1/2 mt-2 w-36 bg-gray-900 border border-gray-800 rounded-lg shadow-lg overflow-hidden z-20"
                  >
                    {selectedLetter && getLetterCount(selectedLetter) > 0 && (
                      <button
                        onClick={() => {
                          handleClearLetter()
                          setClearMenuOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-gray-800"
                      >
                        Clear {selectedLetter}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        handleClearAll()
                        setClearMenuOpen(false)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-gray-800"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="text-xs text-gray-600 px-1">
            {isDynamicMode
              ? 'Dynamic: Start → Motion → End • Multiple recordings improve accuracy'
              : 'More samples = More accuracy • Hold steady • Vary position slightly'}
          </div>
        </div>
      </div>
    </div>
  )
}

function TrainPage() {
  const [samples] = useState<Sample[]>(() => {
    const saved = localStorage.getItem('signlingo-samples')
    return saved ? JSON.parse(saved) : []
  })
  const [dynamicSamples] = useState<DynamicSample[]>(() => getDynamicSamples())
  const [dynamicLetters] = useState<Set<string>>(() => getDynamicLetters())
  const [isTraining, setIsTraining] = useState(false)
  const [progress, setProgress] = useState<TrainingProgress | null>(null)
  const [trainingComplete, setTrainingComplete] = useState(false)
  const [finalAccuracy, setFinalAccuracy] = useState<number | null>(null)
  const [hasModel, setHasModel] = useState(hasStoredModel)

  // Count static samples (excluding dynamic letters)
  const staticLetterCounts = samples.reduce((acc, s) => {
    if (!dynamicLetters.has(s.letter)) {
      acc[s.letter] = (acc[s.letter] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  // Count dynamic samples
  const dynamicLetterCounts = dynamicSamples.reduce((acc, s) => {
    acc[s.letter] = (acc[s.letter] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const staticLettersCount = Object.keys(staticLetterCounts).length
  const dynamicLettersCount = Object.keys(dynamicLetterCounts).length
  const uniqueLetters = staticLettersCount + dynamicLettersCount
  const totalStaticSamples = Object.values(staticLetterCounts).reduce((a, b) => a + b, 0)
  const totalDynamicSamples = dynamicSamples.length
  const avgPerLetter = uniqueLetters > 0 ? Math.round((totalStaticSamples + totalDynamicSamples) / uniqueLetters) : 0

  // Need at least 2 letters with samples for training
  const canTrain = uniqueLetters >= 2 && (totalStaticSamples >= 20 || totalDynamicSamples >= 2)

  const handleTrain = async () => {
    if (!canTrain) return

    setIsTraining(true)
    setTrainingComplete(false)
    setProgress(null)

    try {
      // Filter out samples for letters that are marked as dynamic
      const staticSamples = samples.filter(s => !dynamicLetters.has(s.letter))
      const result = await trainModel(staticSamples, (p) => {
        setProgress(p)
      })

      await saveModel(result.model)
      setFinalAccuracy(result.accuracy)
      setTrainingComplete(true)
      setHasModel(true)

      // Clean up the model from memory
      result.model.dispose()
    } catch (err) {
      console.error('Training error:', err)
    } finally {
      setIsTraining(false)
    }
  }

  const handleDeleteModel = () => {
    if (confirm('Delete the trained model?')) {
      deleteStoredModel()
      setHasModel(false)
      setTrainingComplete(false)
      setFinalAccuracy(null)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Data summary */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Training Data</h3>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <div className="text-2xl font-bold text-mint-400">{totalStaticSamples}</div>
            <div className="text-xs text-gray-500">Static samples</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-400">{totalDynamicSamples}</div>
            <div className="text-xs text-gray-500">Dynamic recordings</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{uniqueLetters}/26</div>
            <div className="text-xs text-gray-500">Letters</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{avgPerLetter}</div>
            <div className="text-xs text-gray-500">Avg per letter</div>
          </div>
        </div>

        {/* Letter coverage */}
        <div className="flex flex-wrap gap-1">
          {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => {
            const isDynamic = dynamicLetters.has(letter)
            const count = isDynamic ? (dynamicLetterCounts[letter] || 0) : (staticLetterCounts[letter] || 0)
            return (
              <div
                key={letter}
                className={`w-6 h-6 rounded text-xs font-medium flex items-center justify-center ${
                  count > 0 && isDynamic
                    ? 'bg-purple-500/20 text-purple-400'
                    : count > 0
                    ? 'bg-mint-500/20 text-mint-400'
                    : 'bg-gray-800 text-gray-600'
                }`}
                title={`${letter}: ${count} ${isDynamic ? 'recordings' : 'samples'}${isDynamic ? ' (dynamic)' : ''}`}
              >
                {letter}
              </div>
            )
          })}
        </div>
      </div>

      {/* Training controls */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-4">
        {!canTrain && (
          <div className="text-center py-4">
            <p className="text-gray-400 mb-2">Not enough data to train</p>
            <p className="text-xs text-gray-600">
              Need at least 2 letters with 10+ samples each
            </p>
          </div>
        )}

        {canTrain && !isTraining && !trainingComplete && (
          <div className="text-center">
            <button
              onClick={handleTrain}
              className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              Start Training
            </button>
            <p className="text-xs text-gray-600 mt-3">
              This will train a neural network on your recorded samples
            </p>
          </div>
        )}

        {isTraining && progress && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Training...</span>
              <span className="text-white">
                Epoch {progress.epoch}/{progress.totalEpochs}
              </span>
            </div>

            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${(progress.epoch / progress.totalEpochs) * 100}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold text-white">
                  {((progress.valAccuracy ?? progress.accuracy) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">Val Accuracy</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-white">
                  {(progress.valLoss ?? progress.loss).toFixed(4)}
                </div>
                <div className="text-xs text-gray-500">Val Loss</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center mt-2 opacity-60">
              <div>
                <div className="text-sm text-gray-400">
                  {(progress.accuracy * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-600">Train Acc</div>
              </div>
              <div>
                <div className="text-sm text-gray-400">
                  {progress.loss.toFixed(4)}
                </div>
                <div className="text-xs text-gray-600">Train Loss</div>
              </div>
            </div>
          </div>
        )}

        {trainingComplete && finalAccuracy !== null && (
          <div className="text-center">
            <div className="text-mint-400 text-4xl mb-2">✓</div>
            <p className="text-white font-medium mb-1">Training Complete</p>
            <p className="text-2xl font-bold text-mint-400 mb-3">
              {(finalAccuracy * 100).toFixed(1)}% val accuracy
            </p>
            <p className="text-xs text-gray-500">
              Model saved. Go to Practice to test it!
            </p>
          </div>
        )}
      </div>

      {/* Model management */}
      {hasModel && !isTraining && (
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">Saved Model</p>
            <p className="text-xs text-gray-500">Ready for practice</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleTrain}
              disabled={!canTrain}
              className="text-purple-400 hover:text-purple-300 text-sm font-medium disabled:opacity-40 transition-colors"
            >
              Retrain
            </button>
            <button
              onClick={handleDeleteModel}
              className="text-red-400/70 hover:text-red-400 text-sm font-medium transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* UMAP Visualization */}
      {samples.length > 0 && (
        <div className="mt-4">
          <UmapVisualization samples={samples} />
        </div>
      )}
    </div>
  )
}

function PracticePage() {
  const [model, setModel] = useState<tf.LayersModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [curriculum] = useState(() => generateCurriculum())
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [exerciseResults, setExerciseResults] = useState<ExerciseResult[] | null>(null)
  const [skipTestPrompt, setSkipTestPrompt] = useState<{ unit: typeof curriculum[0], lesson: Lesson } | null>(null)
  const [freePracticeMode, setFreePracticeMode] = useState(false)
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('signlingo-completed-lessons')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })

  useEffect(() => {
    let mounted = true
    let loadedModel: tf.LayersModel | null = null

    loadModel().then((m) => {
      if (mounted) {
        loadedModel = m
        setModel(m)
        setLoading(false)
      } else if (m) {
        m.dispose()
      }
    })

    return () => {
      mounted = false
      if (loadedModel) {
        loadedModel.dispose()
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('signlingo-completed-lessons', JSON.stringify([...completedLessons]))
  }, [completedLessons])

  const handleLessonComplete = (results: ExerciseResult[]) => {
    setExerciseResults(results)
    if (selectedLesson) {
      // Check if this is a skip test
      if (selectedLesson.id.startsWith('skip-test-')) {
        const unitId = selectedLesson.id.replace('skip-test-', '')
        const unit = curriculum.find(u => u.id === unitId)
        if (unit) {
          // Unlock all lessons in this unit
          setCompletedLessons(prev => {
            const next = new Set([...prev])
            unit.lessons.forEach(l => next.add(l.id))
            return next
          })
        }
      } else {
        setCompletedLessons(prev => new Set([...prev, selectedLesson.id]))
      }
    }
  }

  const handleBackToLessons = () => {
    setSelectedLesson(null)
    setExerciseResults(null)
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-400 border-t-transparent mx-auto mb-4"></div>
        <p className="text-gray-500">Loading model...</p>
      </div>
    )
  }

  if (!model) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">🤖</div>
        <h2 className="text-xl font-bold text-white mb-2">No Model Found</h2>
        <p className="text-gray-500 mb-4">
          Train a model first to start practicing
        </p>
      </div>
    )
  }

  // Show exercise results
  if (exerciseResults) {
    const successCount = exerciseResults.filter(r => r.success).length
    const totalCount = exerciseResults.length

    // Find next lesson
    let nextLesson: Lesson | null = null
    if (selectedLesson && !selectedLesson.id.startsWith('skip-test-')) {
      for (const unit of curriculum) {
        const lessonIndex = unit.lessons.findIndex(l => l.id === selectedLesson.id)
        if (lessonIndex !== -1) {
          if (lessonIndex < unit.lessons.length - 1) {
            nextLesson = unit.lessons[lessonIndex + 1]
          } else {
            // Find first lesson of next unit
            const unitIndex = curriculum.indexOf(unit)
            if (unitIndex < curriculum.length - 1) {
              nextLesson = curriculum[unitIndex + 1].lessons[0]
            }
          }
          break
        }
      }
    }

    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="text-6xl mb-4">
          {successCount === totalCount ? '🎉' : '💪'}
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {successCount === totalCount ? 'Perfect!' : 'Lesson Complete'}
        </h2>
        <p className="text-gray-400 mb-6">
          {successCount}/{totalCount} exercises completed
        </p>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleBackToLessons}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Back to Lessons
          </button>
          {nextLesson ? (
            <button
              onClick={() => {
                setExerciseResults(null)
                setSelectedLesson(nextLesson)
              }}
              className="bg-mint-500 text-white px-6 py-3 rounded-xl font-medium btn-float"
            >
              Next Lesson
            </button>
          ) : (
            <button
              onClick={handleBackToLessons}
              className="bg-mint-500 text-white px-6 py-3 rounded-xl font-medium btn-float"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    )
  }

  // Show exercise runner
  if (selectedLesson) {
    return (
      <ExerciseRunner
        exercises={selectedLesson.exercises}
        model={model}
        onComplete={handleLessonComplete}
        onExit={handleBackToLessons}
      />
    )
  }

  // Show free practice mode
  if (freePracticeMode) {
    return (
      <FreePractice
        model={model}
        onBack={() => setFreePracticeMode(false)}
      />
    )
  }

  // Show lesson selection - curved path design
  return (
    <div className="max-w-lg mx-auto px-4">
      {/* Free Practice button */}
      <button
        onClick={() => setFreePracticeMode(true)}
        className="w-full mb-6 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl p-4 flex items-center justify-between transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400 text-xl">
            🎯
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-white group-hover:text-purple-300 transition-colors">Free Practice</h3>
            <p className="text-xs text-gray-500">Practice any letter with hints</p>
          </div>
        </div>
        <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {/* Skip test prompt modal */}
      {skipTestPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-sm w-full border border-gray-800">
            <h3 className="text-xl font-bold text-white mb-2">Skip Ahead?</h3>
            <p className="text-gray-400 text-sm mb-6">
              Take a quick test to unlock <span className="text-purple-400">{skipTestPrompt.unit.title}</span>.
              You'll need to sign letters from this unit correctly.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSkipTestPrompt(null)}
                className="flex-1 py-3 rounded-xl font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const unitLessons = skipTestPrompt.unit.lessons
                  const skipTestLesson: Lesson = {
                    id: `skip-test-${skipTestPrompt.unit.id}`,
                    title: `${skipTestPrompt.unit.title} Skip Test`,
                    description: 'Pass to unlock this unit',
                    newLetters: [],
                    availableLetters: unitLessons.flatMap(l => l.newLetters),
                    exercises: [
                      {
                        type: 'sign-all',
                        letters: unitLessons.flatMap(l => l.newLetters).slice(0, 4),
                      },
                      {
                        type: 'sign-all',
                        letters: unitLessons.flatMap(l => l.newLetters).slice(2, 6),
                      },
                    ],
                  }
                  setSelectedLesson(skipTestLesson)
                  setSkipTestPrompt(null)
                }}
                className="flex-1 bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl font-medium btn-float transition-colors"
              >
                Take Test
              </button>
            </div>
          </div>
        </div>
      )}

      {curriculum.map((unit, unitIndex) => {
        const unitLessons = unit.lessons
        const allUnitCompleted = unitLessons.every(l => completedLessons.has(l.id))
        const anyUnitStarted = unitLessons.some(l => completedLessons.has(l.id))

        // Check if this unit is locked (previous unit not completed)
        const prevUnit = unitIndex > 0 ? curriculum[unitIndex - 1] : null
        const prevUnitCompleted = !prevUnit || prevUnit.lessons.every(l => completedLessons.has(l.id))
        const unitLocked = !prevUnitCompleted && unitIndex > 0

        return (
          <div key={unit.id} className="mb-12">
            {/* Unit header */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${
                allUnitCompleted
                  ? 'bg-mint-500 text-white'
                  : anyUnitStarted
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-gray-800 text-gray-400'
              }`}>
                {unitIndex + 1}
              </div>
              <div>
                <h3 className="font-semibold text-white">{unit.title}</h3>
                <p className="text-xs text-gray-500">
                  {unitLessons.filter(l => completedLessons.has(l.id)).length}/{unitLessons.length} lessons
                </p>
              </div>
            </div>

            {/* Curved path with lesson nodes */}
            <div className="relative">
              {/* Connecting line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gray-800 -translate-x-1/2 rounded-full" />

              <div className="relative space-y-4">
                {unitLessons.map((lesson, index) => {
                  const isCompleted = completedLessons.has(lesson.id)
                  const prevLesson = index > 0 ? unitLessons[index - 1] : null
                  const prevUnitLastLesson = unitIndex > 0
                    ? curriculum[unitIndex - 1].lessons.slice(-1)[0]
                    : null
                  const prerequisite = prevLesson || prevUnitLastLesson
                  const isLocked = !!(prerequisite && !completedLessons.has(prerequisite.id) && (index > 0 || unitIndex > 0))

                  // First lesson of a locked unit = skip test opportunity
                  const isSkipTestNode = unitLocked && index === 0

                  // Alternate left/right for curved path effect
                  const isLeft = index % 2 === 0

                  // Is this the next lesson to do?
                  const isNext = !isCompleted && !isLocked

                  return (
                    <div
                      key={lesson.id}
                      className={`flex items-center gap-4 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}
                    >
                      {/* Spacer for offset */}
                      <div className="flex-1" />

                      {/* Lesson node */}
                      <button
                        onClick={() => {
                          if (isSkipTestNode) {
                            setSkipTestPrompt({ unit, lesson })
                          } else if (!isLocked) {
                            setSelectedLesson(lesson)
                          }
                        }}
                        disabled={isLocked && !isSkipTestNode}
                        className={`lesson-node relative z-10 w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ${
                          isLocked && !isSkipTestNode
                            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            : isSkipTestNode
                            ? 'bg-purple-600 text-white glow-ring cursor-pointer'
                            : isCompleted
                            ? 'bg-mint-500 text-white'
                            : isNext
                            ? 'bg-purple-500 text-white animate-bounce-subtle'
                            : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {isLocked && !isSkipTestNode ? (
                          <span className="text-2xl">🔒</span>
                        ) : isSkipTestNode ? (
                          <span className="text-2xl">⚡</span>
                        ) : isCompleted ? (
                          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          lesson.newLetters[0] || '★'
                        )}
                      </button>

                      {/* Lesson info */}
                      <div className={`flex-1 ${isLeft ? 'text-left' : 'text-right'}`}>
                        <div className={`text-sm font-medium ${
                          isLocked && !isSkipTestNode ? 'text-gray-600' : isSkipTestNode ? 'text-purple-400' : 'text-white'
                        }`}>
                          {isSkipTestNode ? 'Skip Test' : lesson.title}
                        </div>
                        <div className={`text-xs ${isLocked ? 'text-gray-700' : 'text-gray-500'}`}>
                          {isSkipTestNode ? 'Tap to unlock unit' : `${lesson.exercises.length} exercises`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default App
