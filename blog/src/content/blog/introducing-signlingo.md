---
title: 'Introducing SignLingo'
description: 'Building a Duolingo-style app for learning ASL fingerspelling'
pubDate: 'Jan 28 2025'
---

SignLingo is a desktop app that teaches American Sign Language (ASL) fingerspelling through interactive lessons — think Duolingo, but for hand signs.

## The Problem

Learning ASL fingerspelling typically requires either:
- In-person classes (expensive, time-consuming)
- Static images/videos (no feedback on your own signing)
- Apps that only quiz you on *recognizing* letters, not *producing* them

SignLingo flips the script: it uses your webcam and machine learning to give you real-time feedback as you practice signing.

## The Tech Stack

We're building with:
- **Electron** for cross-platform desktop support
- **React + TypeScript** for the UI
- **MediaPipe Hands** for hand landmark detection
- **TensorFlow.js** for in-browser ML training and inference
- **Vite** for fast development

The ML model is intentionally simple — just a few dense layers (~115KB total). It runs entirely in the browser with no server required.

## What's Next

- Implementing the full lesson curriculum
- Adding dynamic gesture recognition for letters like J and Z
- Crowdsourcing training data to improve model accuracy
- Building a community leaderboard

Follow along as we build SignLingo in public!
