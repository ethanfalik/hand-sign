import { useState, useEffect, useRef } from 'react'
import { UMAP } from 'umap-js'
import { Sample } from '../lib/model'

interface Props {
  samples: Sample[]
  highlightLetters?: string[] // Letters to highlight (e.g., ['I', 'A'])
}

// Normalize landmarks (same as in model.ts)
function normalizeLandmarks(landmarks: number[][]): number[] {
  const wrist = landmarks[0]
  const normalized: number[] = []

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (const [x, y] of landmarks) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  const scaleX = maxX - minX || 1
  const scaleY = maxY - minY || 1
  const scale = Math.max(scaleX, scaleY)

  for (const [x, y, z] of landmarks) {
    normalized.push((x - wrist[0]) / scale)
    normalized.push((y - wrist[1]) / scale)
    normalized.push(z)
  }

  return normalized
}

// 26 distinct colors for A-Z
const LETTER_COLORS: Record<string, string> = {
  A: '#e6194b', // red
  B: '#3cb44b', // green
  C: '#ffe119', // yellow
  D: '#4363d8', // blue
  E: '#f58231', // orange
  F: '#911eb4', // purple
  G: '#46f0f0', // cyan
  H: '#f032e6', // magenta
  I: '#bcf60c', // lime
  J: '#fabebe', // pink
  K: '#008080', // teal
  L: '#e6beff', // lavender
  M: '#9a6324', // brown
  N: '#fffac8', // beige
  O: '#800000', // maroon
  P: '#aaffc3', // mint
  Q: '#808000', // olive
  R: '#ffd8b1', // apricot
  S: '#000075', // navy
  T: '#808080', // gray
  U: '#ffffff', // white
  V: '#ff4500', // orange-red
  W: '#00ced1', // dark turquoise
  X: '#ff1493', // deep pink
  Y: '#32cd32', // lime green
  Z: '#ffa500', // orange
}

function getLetterColor(letter: string, _isHighlighted: boolean, highlightLetters: string[]): string {
  if (highlightLetters.length > 0) {
    if (!highlightLetters.includes(letter)) {
      return 'rgba(128, 128, 128, 0.2)' // Dim non-highlighted
    }
  }
  return LETTER_COLORS[letter] || '#ffffff'
}

export default function UmapVisualization({ samples, highlightLetters = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isComputing, setIsComputing] = useState(false)
  const [embedding, setEmbedding] = useState<number[][] | null>(null)
  const [sampleLetters, setSampleLetters] = useState<string[]>([])
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; letter: string } | null>(null)

  // Subsample for performance (max 2000 points)
  const maxSamples = 2000
  const subsampledIndices = samples.length > maxSamples
    ? Array.from({ length: maxSamples }, () => Math.floor(Math.random() * samples.length))
    : samples.map((_, i) => i)

  const computeUmap = async () => {
    setIsComputing(true)

    // Prepare data
    const data: number[][] = []
    const letters: string[] = []

    for (const idx of subsampledIndices) {
      const sample = samples[idx]
      data.push(normalizeLandmarks(sample.landmarks))
      letters.push(sample.letter)
    }

    setSampleLetters(letters)

    // Run UMAP
    const umap = new UMAP({
      nNeighbors: 15,
      minDist: 0.1,
      nComponents: 2,
    })

    const result = await umap.fitAsync(data)
    setEmbedding(result)
    setIsComputing(false)
  }

  // Draw the visualization
  useEffect(() => {
    if (!embedding || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const padding = 40

    // Clear
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, width, height)

    // Find bounds
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (const [x, y] of embedding) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }

    const scaleX = (width - 2 * padding) / (maxX - minX || 1)
    const scaleY = (height - 2 * padding) / (maxY - minY || 1)

    // Draw points
    for (let i = 0; i < embedding.length; i++) {
      const [x, y] = embedding[i]
      const letter = sampleLetters[i]

      const px = padding + (x - minX) * scaleX
      const py = padding + (y - minY) * scaleY

      ctx.beginPath()
      ctx.arc(px, py, 3, 0, Math.PI * 2)
      ctx.fillStyle = getLetterColor(letter, highlightLetters.includes(letter), highlightLetters)
      ctx.fill()
    }

    // Draw legend
    const uniqueLetters = [...new Set(sampleLetters)].sort()
    const legendX = width - 100
    let legendY = 20

    ctx.font = '12px monospace'
    for (const letter of uniqueLetters) {
      if (highlightLetters.length > 0 && !highlightLetters.includes(letter)) continue

      ctx.fillStyle = getLetterColor(letter, true, highlightLetters)
      ctx.beginPath()
      ctx.arc(legendX, legendY, 5, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.fillText(letter, legendX + 12, legendY + 4)
      legendY += 18
    }

  }, [embedding, sampleLetters, highlightLetters])

  // Handle mouse hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!embedding || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const width = canvas.width
    const height = canvas.height
    const padding = 40

    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    for (const [x, y] of embedding) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }

    const scaleX = (width - 2 * padding) / (maxX - minX || 1)
    const scaleY = (height - 2 * padding) / (maxY - minY || 1)

    // Find closest point
    let closest: { x: number; y: number; letter: string; dist: number } | null = null
    for (let i = 0; i < embedding.length; i++) {
      const [x, y] = embedding[i]
      const px = padding + (x - minX) * scaleX
      const py = padding + (y - minY) * scaleY
      const dist = Math.sqrt((px - mouseX) ** 2 + (py - mouseY) ** 2)

      if (dist < 10 && (!closest || dist < closest.dist)) {
        closest = { x: px, y: py, letter: sampleLetters[i], dist }
      }
    }

    setHoveredPoint(closest ? { x: closest.x, y: closest.y, letter: closest.letter } : null)
  }

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-medium">UMAP Visualization</h3>
        <button
          onClick={computeUmap}
          disabled={isComputing || samples.length === 0}
          className="px-3 py-1 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {isComputing ? 'Computing...' : 'Generate'}
        </button>
      </div>

      {samples.length === 0 && (
        <p className="text-gray-500 text-sm">No samples to visualize</p>
      )}

      {samples.length > 0 && !embedding && !isComputing && (
        <p className="text-gray-500 text-sm">Click Generate to create UMAP visualization</p>
      )}

      {isComputing && (
        <div className="flex items-center justify-center h-64">
          <div className="text-purple-400">Computing UMAP embedding...</div>
        </div>
      )}

      {embedding && (
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={500}
            height={400}
            className="w-full rounded-lg"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredPoint(null)}
          />
          {hoveredPoint && (
            <div
              className="absolute bg-black/80 text-white px-2 py-1 rounded text-sm pointer-events-none"
              style={{ left: hoveredPoint.x + 10, top: hoveredPoint.y - 20 }}
            >
              {hoveredPoint.letter}
            </div>
          )}
        </div>
      )}

      {highlightLetters.length > 0 && (
        <p className="text-gray-500 text-xs mt-2">
          Highlighting: {highlightLetters.join(', ')} (other letters dimmed)
        </p>
      )}
    </div>
  )
}
