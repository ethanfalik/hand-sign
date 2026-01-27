# SignLingo

A Duolingo-style app for learning ASL (American Sign Language) fingerspelling with real-time hand tracking.

## Quick Start

```bash
cd app
npm install
npm run dev
```

This opens the Electron app in development mode with hot reloading.

## Development Commands

```bash
# Install dependencies (first time only)
cd app
npm install

# Run in development mode (two terminals)
npm run dev:renderer  # Terminal 1: Start Vite dev server
npm run dev:main      # Terminal 2: Start Electron (set NODE_ENV=development)

# Or use the combined command
npm run dev

# Build for production
npm run build

# Run production build
npm run start
```

## Project Structure

```
app/
├── src/
│   ├── main/           # Electron main process
│   │   └── index.ts
│   └── renderer/       # React frontend
│       ├── components/
│       ├── styles/
│       ├── App.tsx
│       └── main.tsx
├── dist/               # Compiled output
└── package.json
```

## Tech Stack

- **Electron** - Cross-platform desktop app
- **React** - UI framework
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **MediaPipe** - Hand landmark detection (coming soon)
- **TensorFlow.js** - ML model training & inference (coming soon)
