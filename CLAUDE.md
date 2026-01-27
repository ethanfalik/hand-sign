# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

## Commands

```bash
# Install dependencies
cd app && npm install

# Run in development mode
cd app && npm run dev

# Or run separately:
cd app && npm run dev:renderer  # Terminal 1: Vite dev server
cd app && npm run dev:main      # Terminal 2: Electron app

# Build for production
cd app && npm run build
```

## Architecture

SignLingo is a Duolingo-style ASL fingerspelling learning app.

**Tech Stack:**
- Electron (cross-platform desktop)
- React + TypeScript (UI)
- Vite (bundler)
- TailwindCSS (styling with custom color palette)
- MediaPipe Hands (hand landmark detection) - coming soon
- TensorFlow.js (in-browser ML training & inference) - coming soon

**Project Structure:**
```
app/
├── src/
│   ├── main/           # Electron main process
│   │   └── index.ts    # Window creation, app lifecycle
│   └── renderer/       # React frontend
│       ├── components/ # React components
│       ├── styles/     # CSS (Tailwind)
│       ├── App.tsx     # Main app component
│       └── main.tsx    # React entry point
├── dist/               # Compiled output
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig*.json
```

**Color Palette:**
- Sage green (#87A878) - Primary actions, success
- Soft teal (#5BA4A4) - Secondary accent
- Warm cream (#FBF7F0) - Background
- Soft coral (#E8998D) - Streak/hearts accent
- Muted navy (#4A5568) - Text

**ML Model (planned):**
- Input: 63 features (21 hand landmarks × 3 coordinates)
- Architecture: Dense(128) → Dense(128) → Dense(26) softmax
- Output: Letter A-Z prediction
- Training: In-browser with TensorFlow.js
- Crowdsourced data with validation (confidence gating, peer review)

## Camera Note

MediaPipe in browser uses `navigator.mediaDevices.getUserMedia()`. If an iPhone is connected via Continuity Camera, it may be selected as default. User can choose camera in the app.
