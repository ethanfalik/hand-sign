import { useEffect, useRef, useState, useCallback } from 'react'
import { Hands, Results, NormalizedLandmarkList } from '@mediapipe/hands'

export interface HandLandmarks {
  landmarks: NormalizedLandmarkList
  timestamp: number
}

interface HandTrackerProps {
  onLandmarks?: (landmarks: HandLandmarks) => void
  onHandLost?: () => void
  isRecording?: boolean
  className?: string
}

export function HandTracker({ onLandmarks, onHandLost, isRecording = false, className = '' }: HandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handsRef = useRef<Hands | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [handDetected, setHandDetected] = useState(false)

  // Use refs for callbacks to avoid reinitializing MediaPipe when callbacks change
  const onLandmarksRef = useRef(onLandmarks)
  const onHandLostRef = useRef(onHandLost)
  const isRecordingRef = useRef(isRecording)

  // Keep refs in sync with props
  useEffect(() => {
    onLandmarksRef.current = onLandmarks
  }, [onLandmarks])

  useEffect(() => {
    onHandLostRef.current = onHandLost
  }, [onHandLost])

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  const onResults = useCallback((results: Results) => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height)
    ctx.restore()

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      setHandDetected(true)

      for (const landmarks of results.multiHandLandmarks) {
        drawConnections(ctx, landmarks, canvas.width, canvas.height, isRecordingRef.current)
        drawLandmarks(ctx, landmarks, canvas.width, canvas.height, isRecordingRef.current)

        if (onLandmarksRef.current) {
          onLandmarksRef.current({
            landmarks,
            timestamp: Date.now(),
          })
        }
      }
    } else {
      setHandDetected(false)
      if (onHandLostRef.current) {
        onHandLostRef.current()
      }
    }
  }, [])

  useEffect(() => {
    let stream: MediaStream | null = null
    let animationId: number
    let isMounted = true

    async function init() {
      try {
        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
          },
        })

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.5,
        })

        hands.onResults(onResults)
        handsRef.current = hands

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
        })

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream

          try {
            await videoRef.current.play()
          } catch (playError) {
            if (playError instanceof Error && playError.name === 'AbortError') {
              return
            }
            throw playError
          }

          if (!isMounted) return
          setIsLoading(false)

          const processFrame = async () => {
            if (!isMounted) return
            if (videoRef.current && handsRef.current && !videoRef.current.paused) {
              await handsRef.current.send({ image: videoRef.current })
            }
            animationId = requestAnimationFrame(processFrame)
          }
          processFrame()
        }
      } catch (err) {
        if (!isMounted) return
        console.error('Hand tracker error:', err)
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            setError('Camera access denied. Please allow camera access.')
          } else if (err.name === 'NotFoundError') {
            setError('No camera found.')
          } else {
            setError(`Error: ${err.message}`)
          }
        } else {
          setError('Failed to initialize hand tracking')
        }
        setIsLoading(false)
      }
    }

    init()

    return () => {
      isMounted = false
      if (animationId) cancelAnimationFrame(animationId)
      if (stream) stream.getTracks().forEach((track) => track.stop())
      if (handsRef.current) handsRef.current.close()
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [onResults])

  if (error) {
    return (
      <div className={`bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div className="text-4xl mb-4">📷</div>
          <p className="text-red-400 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative rounded-xl overflow-hidden bg-gray-900 ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-400 border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-500">Loading hand tracking...</p>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="absolute opacity-0 pointer-events-none"
        playsInline
        muted
      />

      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover"
      />

      {/* Status indicator */}
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-gray-900/70 backdrop-blur-sm px-2.5 py-1 rounded-lg">
        <div className={`w-1.5 h-1.5 rounded-full ${handDetected ? 'bg-mint-400' : 'bg-gray-600'}`}></div>
        <span className="text-gray-400 text-xs">
          {handDetected ? 'Hand detected' : 'No hand'}
        </span>
      </div>

      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-500/20 px-2.5 py-1 rounded-lg">
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></div>
          <span className="text-red-400 text-xs">REC</span>
        </div>
      )}
    </div>
  )
}

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmarkList,
  width: number,
  height: number,
  isRecording: boolean
) {
  ctx.strokeStyle = isRecording ? 'rgba(192, 132, 252, 0.6)' : 'rgba(134, 239, 172, 0.5)'
  ctx.lineWidth = 2

  for (const [start, end] of HAND_CONNECTIONS) {
    const startLandmark = landmarks[start]
    const endLandmark = landmarks[end]

    const x1 = (1 - startLandmark.x) * width
    const y1 = startLandmark.y * height
    const x2 = (1 - endLandmark.x) * width
    const y2 = endLandmark.y * height

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
}

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmarkList,
  width: number,
  height: number,
  isRecording: boolean
) {
  // Soft mint when normal, light purple when recording
  const color = isRecording ? '#c084fc' : '#86efac'

  for (let i = 0; i < landmarks.length; i++) {
    const landmark = landmarks[i]
    const x = (1 - landmark.x) * width
    const y = landmark.y * height

    // Main dot only - no glow
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
  }
}
