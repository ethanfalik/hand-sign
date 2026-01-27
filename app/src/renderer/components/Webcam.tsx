import { useEffect, useRef, useState } from 'react'

interface WebcamProps {
  onFrame?: (video: HTMLVideoElement) => void
  className?: string
}

export function Webcam({ onFrame, className = '' }: WebcamProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let stream: MediaStream | null = null
    let animationId: number
    let isMounted = true

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
        })

        // Check if component is still mounted
        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream

          try {
            await videoRef.current.play()
          } catch (playError) {
            // Ignore AbortError - happens when component unmounts during play()
            if (playError instanceof Error && playError.name === 'AbortError') {
              return
            }
            throw playError
          }

          if (!isMounted) return

          setIsLoading(false)

          // Frame callback loop
          if (onFrame) {
            const processFrame = () => {
              if (!isMounted) return
              if (videoRef.current && !videoRef.current.paused) {
                onFrame(videoRef.current)
              }
              animationId = requestAnimationFrame(processFrame)
            }
            processFrame()
          }
        }
      } catch (err) {
        if (!isMounted) return

        console.error('Camera error:', err)
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError') {
            setError('Camera access denied. Please allow camera access in your browser settings.')
          } else if (err.name === 'NotFoundError') {
            setError('No camera found. Please connect a camera and try again.')
          } else {
            setError(`Camera error: ${err.message}`)
          }
        } else {
          setError('Failed to access camera')
        }
        setIsLoading(false)
      }
    }

    startCamera()

    return () => {
      isMounted = false
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
      // Clear video source to prevent play() errors
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }
  }, [onFrame])

  if (error) {
    return (
      <div className={`bg-coral-100 rounded-2xl flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div className="text-4xl mb-4">📷</div>
          <p className="text-coral-600 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative rounded-2xl overflow-hidden bg-navy-900 ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-navy-800">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-sage-400 border-t-transparent mx-auto mb-4"></div>
            <p className="text-white/60">Starting camera...</p>
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        style={{ transform: 'scaleX(-1)' }}
      />
    </div>
  )
}
