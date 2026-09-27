---
description: Context and architecture rules for EchoX Persona-Based Reply Extension
globs: ["**/*"]
---

# EchoX Extension Context & Architecture

This repository contains the Chrome Extension (Manifest V3) **EchoX**, designed to generate authentic persona replies on X (Twitter).

## Key Architecture & Design Decisions
1. **Model**: Gemini 3.8 Flash (`gemini-3.8-flash`) via Google GenAI REST API.
2. **Context Strategy**: Dual mode:
   - Direct DOM text extraction for simple tweets (low latency).
   - Automated Grok explanation extraction via `src/content/grokScraper.ts` for complex news, threads, and external links.
3. **Voice Mimicry & Anti-Slop**:
   - Persona DNA captures casing (strict lowercase / standard), median length, slang, and punctuation.
   - Strictly forbidden: corporate AI praise ("Spot on!", "Couldn't agree more!", "Great insight!"), generic emojis, listicles.
4. **Adaptive Memory**: Tracks before/after diffs when user edits generated text before tweeting.
5. **Human-in-the-Loop**: Injects into native Draft.js editor for user review before posting.

## Project Reference Documents
- `PLAN.md`: Full architectural and technical implementation plan.
- `WALKTHROUGH.md`: Build validation and component breakdown.
- `README.md`: Quick start and setup guide.
