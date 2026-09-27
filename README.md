# EchoX: Persona-Based Reply Extension for X (Twitter)

A Chrome Extension (Manifest V3) that generates authentic, in-character replies to posts on X (Twitter). EchoX uses **Gemini 3.8 Flash** combined with **Smart Grok Context Extraction** to understand the deep background of threads, news, and links without consuming unnecessary tokens.

---

## ✨ Key Features

1. **Smart Grok & Direct Context Extraction**:
   - For simple text tweets: Instant DOM extraction with 0 latency.
   - For complex posts, external links (`t.co`), quote tweets, and threads: Automatically clicks the native Grok button on X to extract Grok's real-time explanation, then auto-dismisses the drawer.
2. **Anti-AI-Slop & Typography Persona DNA**:
   - Learns your authentic voice from your past replies (`x.com/<handle>/with_replies`).
   - Captures your true casing (e.g. all-lowercase), punctuation quirks (e.g. no trailing periods), median sentence length, and vocabulary.
   - Strictly bans corporate AI phrases (*"Spot on!", "Couldn't agree more!", "Fascinating perspective"*) and cliché emojis.
3. **Stance Chips (3 Options per Tweet)**:
   - `[🤝 Casual Banter]`
   - `[🧠 Insightful / Value-Add]`
   - `[🔥 Hot Take / Witty]`
4. **Adaptive Memory**:
   - When you insert a suggested reply and edit it before tweeting, EchoX logs the difference locally to refine your personal voice model over time.
5. **Human-in-the-Loop Safe Injection**:
   - Injects the chosen candidate directly into X's native Draft.js editor (`div[role="textbox"]`), allowing you to review or tweak before posting.

---

## 🛠️ Project Structure

```
x-persona-reply-extension/
├── manifest.json                  # Manifest V3 specification
├── package.json                   # Dependencies & build scripts
├── build.js                       # Fast bundler (esbuild) targeting Chrome 100+
├── dist/                          # Ready-to-load unpacked Chrome extension
└── src/
    ├── types/                     # TypeScript data interfaces
    ├── services/
    │   ├── llmService.ts          # Gemini 3.8 Flash API integration
    │   ├── personaEngine.ts       # Voice analysis & anti-slop prompt builder
    │   ├── adaptiveMemory.ts      # Edit diff tracking & learning
    │   └── storage.ts             # Typed chrome.storage wrapper
    ├── background/
    │   └── serviceWorker.ts       # Service worker handling LLM requests & storage
    ├── content/
    │   ├── index.ts               # Content script entry & DOM observer
    │   ├── grokScraper.ts         # Automated Grok explanation extraction
    │   ├── contextExtractor.ts    # Smart router (Direct vs Grok)
    │   ├── replyWidget.ts         # Inline "Reply As Me" button & popover
    │   ├── composerInjector.ts    # Draft.js contenteditable injector
    │   ├── editTracker.ts         # Monitors edits for Adaptive Memory
    │   ├── styleSync.ts           # Profile reply scraper
    │   └── styles.css             # Extension styling for X (Dark/Dim/Light)
    └── popup/
        ├── index.html             # Persona Studio UI
        ├── popup.ts               # Popup logic & settings
        └── popup.css              # Dark mode styling
```

---

## 🚀 Setup & Installation

### 1. Install Dependencies & Build
Open terminal in this directory:
```powershell
npm install
npm run build
```
This generates the packaged extension in the `dist/` directory.

### 2. Load Extension in Google Chrome
1. Open Chrome and go to `chrome://extensions/`.
2. Toggle **Developer mode** (top-right corner) to ON.
3. Click **Load unpacked**.
4. Select the `dist/` directory inside this project folder:
   `C:\Users\anups\.gemini\antigravity\scratch\x-persona-reply-extension\dist`

---

## ⚙️ Configuration & Quick Start

1. Click the **EchoX** icon in the Chrome toolbar to open the **Persona Studio**.
2. Go to the **Settings** tab:
   - Enter your **Gemini API Key** ([Get a free key from Google AI Studio](https://aistudio.google.com/app/apikey)).
   - Default model is set to `gemini-3.8-flash`.
   - Click **Save Settings**.
3. Go to the **Sync Style** tab:
   - Enter your X handle.
   - Navigate to `x.com/your_handle/with_replies` in Chrome and click **Scrape & Analyze Active Page**.
   - Alternatively, paste 5–10 sample replies you've written into the text box and click **Build Voice DNA from Text**.
4. Go to the **Voice DNA** tab to see your extracted profile (casing, tone, vocabulary, and custom rules).

---

## 💻 Using with Antigravity IDE

To resume or modify this project inside **Antigravity IDE**:
1. Open Antigravity IDE.
2. Select **File → Open Folder...** and select:
   `C:\Users\anups\.gemini\antigravity\scratch\x-persona-reply-extension`
3. In the Antigravity Agent sidebar, you can run commands, ask for feature expansions, or type `@` to reference earlier design discussions.
