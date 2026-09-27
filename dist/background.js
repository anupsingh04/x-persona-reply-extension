// src/services/storage.ts
var DEFAULT_BANNED_PHRASES = [
  "Spot on!",
  "Couldn't agree more!",
  "Fascinating perspective",
  "Great insight!",
  "This!",
  "Here is why:",
  "Let that sink in.",
  "Read that again.",
  "Interesting take!"
];
var DEFAULT_SETTINGS = {
  geminiApiKey: "",
  model: "gemini-3.5-flash-lite",
  smartGrokEnabled: true,
  autoCloseGrokDrawer: true,
  persona: {
    handle: "you",
    tone: "casual, insightful, dry humor, tech-savvy",
    casing: "lowercase",
    punctuation: {
      trailingPeriods: false,
      emojiFrequency: "low",
      preferredEmojis: ["\u{1F440}", "\u{1F4AF}"]
    },
    avgLengthWords: 12,
    vocabulary: ["ngl", "tbh", "imo", "clean", "wild"],
    bannedPhrases: DEFAULT_BANNED_PHRASES,
    customRules: "Never sound like an AI assistant. Keep it punchy and direct.",
    fewShotSamples: [
      "fair point tbh, curious how this scales",
      "ngl looks super clean",
      "the latency difference here is wild"
    ],
    lastUpdated: Date.now()
  },
  adaptiveMemory: []
};
async function getSettings() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      resolve(DEFAULT_SETTINGS);
      return;
    }
    chrome.storage.local.get(["settings"], (result) => {
      if (result.settings) {
        resolve({ ...DEFAULT_SETTINGS, ...result.settings });
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    });
  });
}
async function saveSettings(settings) {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings: updated }, () => {
      resolve(updated);
    });
  });
}
async function addAdaptiveMemory(entry) {
  const settings = await getSettings();
  const memories = [entry, ...settings.adaptiveMemory || []].slice(0, 50);
  await saveSettings({ adaptiveMemory: memories });
}
async function updatePersona(persona) {
  await saveSettings({ persona });
}

// src/services/personaEngine.ts
function buildPersonaSystemPrompt(persona, adaptiveMemories = []) {
  if (!persona) {
    return `You are a real human writing a natural reply on X (formerly Twitter).
CRITICAL RULES:
- Never speak like a corporate AI assistant.
- Ban clich\xE9 praise (e.g., "Spot on!", "Couldn't agree more!", "Great insight!").
- Keep replies punchy, conversational, and direct (under 25 words).
- Match modern internet typography.`;
  }
  const memoryContext = adaptiveMemories.length > 0 ? `
RECENT USER EDITS (LEARN FROM THESE ADJUSTMENTS):
${adaptiveMemories.slice(0, 5).map((m) => `- Changed "${m.originalText}" -> "${m.editedText}"`).join("\n")}` : "";
  const fewShotContext = persona.fewShotSamples.length > 0 ? `
AUTHENTIC SAMPLES WRITTEN BY THE USER:
${persona.fewShotSamples.map((s) => `"${s}"`).join("\n")}` : "";
  const bannedPhrases = Array.from(/* @__PURE__ */ new Set([...DEFAULT_BANNED_PHRASES, ...persona.bannedPhrases || []]));
  return `You are ghostwriting a reply on X for @${persona.handle}. You must write EXACTLY like them.

USER VOICE PROFILE:
- Tone: ${persona.tone}
- Casing: ${persona.casing === "lowercase" ? "Strictly all-lowercase (never capitalize sentences or first letters unless intentional)" : persona.casing}
- Trailing period: ${persona.punctuation.trailingPeriods ? "Uses periods at ends of short replies" : "Never use trailing periods on single-sentence replies"}
- Emoji style: ${persona.punctuation.emojiFrequency} frequency. Allowed emojis: ${persona.punctuation.preferredEmojis.length ? persona.punctuation.preferredEmojis.join(" ") : "None"}
- Typical reply length: around ${persona.avgLengthWords} words.
- Natural vocabulary/slang: ${persona.vocabulary.join(", ")}
${persona.customRules ? `- Specific User Guidelines: ${persona.customRules}` : ""}

ANTI-SLOP DIRECTIVES (STRICTLY FORBIDDEN):
- Banned phrases: ${bannedPhrases.join(", ")}
- No generic cheerleading, no numbered lists, no hashtags, no "Here is why:" tropes.
- Do NOT sound eager to please or academic. Speak like a real person typing on a phone.${memoryContext}${fewShotContext}`;
}
function parsePersonaAnalysisJson(rawJson, handle) {
  try {
    const cleaned = rawJson.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      handle,
      tone: parsed.tone || "casual, conversational, dry humor",
      casing: parsed.casing || "lowercase",
      punctuation: {
        trailingPeriods: parsed.punctuation?.trailingPeriods ?? false,
        emojiFrequency: parsed.punctuation?.emojiFrequency || "low",
        preferredEmojis: parsed.punctuation?.preferredEmojis || []
      },
      avgLengthWords: parsed.avgLengthWords || 12,
      vocabulary: parsed.vocabulary || ["ngl", "tbh", "idk", "w/"],
      bannedPhrases: DEFAULT_BANNED_PHRASES,
      customRules: parsed.customRules || "",
      fewShotSamples: parsed.fewShotSamples || [],
      lastUpdated: Date.now()
    };
  } catch (e) {
    console.error("Failed to parse persona JSON:", e);
    return {
      handle,
      tone: "casual, insightful, tech-savvy",
      casing: "lowercase",
      punctuation: {
        trailingPeriods: false,
        emojiFrequency: "low",
        preferredEmojis: []
      },
      avgLengthWords: 12,
      vocabulary: ["ngl", "tbh", "imo"],
      bannedPhrases: DEFAULT_BANNED_PHRASES,
      customRules: "",
      fewShotSamples: [],
      lastUpdated: Date.now()
    };
  }
}

// src/utils/logger.ts
function devLog(tag, message, data) {
  if (data !== void 0) {
    console.log(`[EchoX:${tag}] ${message}`, data);
  } else {
    console.log(`[EchoX:${tag}] ${message}`);
  }
  try {
    fetch("http://127.0.0.1:3999/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag,
        message,
        data: data !== void 0 ? data : void 0,
        timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString()
      })
    }).catch(() => {
    });
  } catch {
  }
}

// src/services/llmService.ts
var LLMService = class {
  apiKey;
  model;
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || "gemini-3.5-flash-lite";
  }
  async generateReplies(context, persona, adaptiveMemories = []) {
    if (!this.apiKey) {
      devLog("GEMINI", "No API key set - generating smart contextual preview candidates.");
      return this.generateDemoCandidates(context);
    }
    devLog("GEMINI", `Generating 3 replies for post by @${context.handle} with persona:`, {
      tone: persona?.tone || "default",
      casing: persona?.casing || "lowercase",
      adaptiveEditsCount: adaptiveMemories.length
    });
    const systemPrompt = buildPersonaSystemPrompt(persona, adaptiveMemories);
    let contextDetails = `POST AUTHOR: @${context.handle} (${context.author})
POST TEXT:
"${context.text}"`;
    if (context.isQuoteTweet && context.quoteText) {
      contextDetails += `
QUOTED TWEET:
"${context.quoteText}"`;
    }
    if (context.mediaAlt && context.mediaAlt.length > 0) {
      contextDetails += `
MEDIA DESCRIPTIONS: ${context.mediaAlt.join("; ")}`;
    }
    if (context.grokExplanation) {
      contextDetails += `

GROK BACKGROUND CONTEXT & EXPLANATION:
${context.grokExplanation}`;
    }
    const prompt = `${contextDetails}

TASK:
Write 3 natural reply options for this post matching the Persona Profile.
Output ONLY a valid JSON array of objects with the following schema:
[
  {
    "stance": "casual",
    "label": "Casual Banter",
    "emoji": "\u{1F91D}",
    "text": "your reply here"
  },
  {
    "stance": "insightful",
    "label": "Insightful",
    "emoji": "\u{1F9E0}",
    "text": "your reply here"
  },
  {
    "stance": "witty",
    "label": "Hot Take",
    "emoji": "\u{1F525}",
    "text": "your reply here"
  }
]`;
    const rawResponse = await this.callGemini(prompt, systemPrompt);
    const candidates = this.parseCandidates(rawResponse);
    devLog("GEMINI", `Successfully generated ${candidates.length} candidates:`, candidates.map((c) => `[${c.label}]: "${c.text}"`));
    return candidates;
  }
  generateDemoCandidates(context) {
    const textLower = (context.text || "").toLowerCase();
    const isQuestion = (context.text || "").includes("?");
    const isTech = /code|build|bug|deploy|ai|model|llm|stack|perf|rust|python|typescript|dev/i.test(textLower);
    if (isQuestion) {
      return [
        {
          stance: "casual",
          label: "Casual Banter",
          emoji: "\u{1F91D}",
          text: "depends on the setup tbh, usually the simpler option wins"
        },
        {
          stance: "insightful",
          label: "Insightful",
          emoji: "\u{1F9E0}",
          text: "biggest tradeoff is probably maintainability over raw speed at this scale"
        },
        {
          stance: "witty",
          label: "Hot Take",
          emoji: "\u{1F525}",
          text: "neither, just ship the mvp and let users break it first"
        }
      ];
    }
    if (isTech) {
      return [
        {
          stance: "casual",
          label: "Casual Banter",
          emoji: "\u{1F91D}",
          text: "honestly super clean, need to test this workflow"
        },
        {
          stance: "insightful",
          label: "Insightful",
          emoji: "\u{1F9E0}",
          text: "the latency profile here is pretty impressive, especially on cold starts"
        },
        {
          stance: "witty",
          label: "Hot Take",
          emoji: "\u{1F525}",
          text: "looks great until you hit production edge cases at 2am"
        }
      ];
    }
    return [
      {
        stance: "casual",
        label: "Casual Banter",
        emoji: "\u{1F91D}",
        text: "fair point tbh, hadn't thought about it like that"
      },
      {
        stance: "insightful",
        label: "Insightful",
        emoji: "\u{1F9E0}",
        text: "the second-order effect of this is what makes it interesting long term"
      },
      {
        stance: "witty",
        label: "Hot Take",
        emoji: "\u{1F525}",
        text: "wild take but honestly not far off"
      }
    ];
  }
  async extractPersonaFromReplies(replies, handle) {
    if (!this.apiKey) {
      throw new Error("Gemini API key is required to analyze profile style.");
    }
    devLog("GEMINI", `Synthesizing Voice DNA from ${replies.length} replies for @${handle}...`);
    const systemPrompt = `You are an expert computational linguist and social media voice profiler.
Your job is to analyze a user's recent replies on X and extract their exact writing voice, typography, and personality quirks.`;
    const prompt = `Analyze these ${replies.length} recent replies written by @${handle} on X:

${replies.map((r, i) => `${i + 1}. "${r}"`).join("\n")}

Extract a JSON profile with this EXACT format:
{
  "tone": "short description of their vibe (e.g. dry sarcastic, highly technical, warm and curious)",
  "casing": "lowercase" | "standard" | "mixed",
  "punctuation": {
    "trailingPeriods": false,
    "emojiFrequency": "none" | "low" | "medium" | "high",
    "preferredEmojis": ["emoji1", "emoji2"]
  },
  "avgLengthWords": 10,
  "vocabulary": ["frequently used slang, abbreviations, phrases"],
  "customRules": "specific negative or positive stylistic rules",
  "fewShotSamples": ["select the 6-8 most distinctive, authentic replies from the provided list"]
}`;
    const raw = await this.callGemini(prompt, systemPrompt);
    const persona = parsePersonaAnalysisJson(raw, handle);
    devLog("GEMINI", `Voice DNA synthesized successfully for @${handle}:`, {
      tone: persona.tone,
      casing: persona.casing,
      vocabulary: persona.vocabulary
    });
    return persona;
  }
  async callGemini(prompt, systemInstruction) {
    const modelsToTry = [
      this.model || "gemini-3.5-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash"
    ];
    const uniqueModels = Array.from(new Set(modelsToTry));
    let lastError = "";
    for (const model of uniqueModels) {
      try {
        devLog("GEMINI", `Sending request to model: ${model}...`);
        const startTime = Date.now();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        const body = {
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            temperature: 0.8,
            responseMimeType: "application/json"
          }
        };
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const err = await response.text();
          if (response.status === 503 || response.status === 429 || response.status === 404) {
            devLog("GEMINI", `Model ${model} returned ${response.status} (Busy / Unavailable). Auto-falling back to next model...`);
            lastError = err;
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          throw new Error(`Gemini API error (${response.status}): ${err}`);
        }
        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidate) {
          throw new Error("Empty response from Gemini API.");
        }
        const duration = Date.now() - startTime;
        devLog("GEMINI", `\u2714 Model ${model} responded in ${duration}ms!`);
        return candidate;
      } catch (err) {
        if (err.message && (err.message.includes("503") || err.message.includes("429") || err.message.includes("404"))) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        throw err;
      }
    }
    devLog("ERROR", `All Gemini fallback models exhausted: ${lastError}`);
    throw new Error(`All Gemini models temporarily unavailable (${lastError || "Please try again in a moment"}).`);
  }
  parseCandidates(rawJson) {
    try {
      const cleaned = rawJson.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item) => ({
          stance: item.stance || "casual",
          label: item.label || "Reply",
          emoji: item.emoji || "\u{1F4AC}",
          text: item.text || ""
        }));
      }
      throw new Error("Invalid candidates format");
    } catch (e) {
      console.error("Failed to parse reply candidates:", e, rawJson);
      return [
        { stance: "casual", label: "Casual", emoji: "\u{1F91D}", text: "fair point" },
        { stance: "insightful", label: "Insightful", emoji: "\u{1F9E0}", text: "wonder how this scales with edge cases" },
        { stance: "witty", label: "Hot Take", emoji: "\u{1F525}", text: "wild take but not wrong" }
      ];
    }
  }
};

// src/services/adaptiveMemory.ts
var AdaptiveMemoryService = class {
  activePendingReplies = /* @__PURE__ */ new Map();
  registerPendingReply(tweetId, originalText, tweetSnippet) {
    this.activePendingReplies.set(tweetId, { originalText, tweetSnippet });
  }
  async recordSentReply(tweetId, finalSubmittedText) {
    const pending = this.activePendingReplies.get(tweetId);
    if (!pending) return null;
    const trimmedOriginal = pending.originalText.trim();
    const trimmedFinal = finalSubmittedText.trim();
    if (trimmedOriginal === trimmedFinal) {
      this.activePendingReplies.delete(tweetId);
      return null;
    }
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      originalText: trimmedOriginal,
      editedText: trimmedFinal,
      tweetSnippet: pending.tweetSnippet.slice(0, 100)
    };
    await addAdaptiveMemory(entry);
    this.activePendingReplies.delete(tweetId);
    return entry;
  }
};
var adaptiveMemoryService = new AdaptiveMemoryService();

// src/background/serviceWorker.ts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handleMessage = async () => {
    try {
      const settings = await getSettings();
      if (message.type === "GENERATE_REPLIES") {
        const { context } = message;
        const llm = new LLMService({
          apiKey: settings.geminiApiKey,
          model: settings.model
        });
        const candidates = await llm.generateReplies(
          context,
          settings.persona,
          settings.adaptiveMemory || []
        );
        return { success: true, candidates };
      }
      if (message.type === "ANALYZE_PROFILE_REPLIES") {
        const { replies, handle } = message;
        const llm = new LLMService({
          apiKey: settings.geminiApiKey,
          model: settings.model
        });
        const persona = await llm.extractPersonaFromReplies(replies, handle);
        await updatePersona(persona);
        return { success: true, persona };
      }
      if (message.type === "REGISTER_PENDING_REPLY") {
        const { tweetId, originalText, tweetSnippet } = message;
        adaptiveMemoryService.registerPendingReply(tweetId, originalText, tweetSnippet);
        return { success: true };
      }
      if (message.type === "RECORD_REPLY_EDIT") {
        const { tweetId, finalText } = message;
        const entry = await adaptiveMemoryService.recordSentReply(tweetId, finalText);
        return { success: true, entry };
      }
      if (message.type === "GET_SETTINGS") {
        return { success: true, settings };
      }
      if (message.type === "SAVE_SETTINGS") {
        const updated = await saveSettings(message.settings);
        return { success: true, settings: updated };
      }
      return { success: false, error: "Unknown message type" };
    } catch (err) {
      console.error("Service Worker Error:", err);
      return { success: false, error: err.message || String(err) };
    }
  };
  handleMessage().then(sendResponse);
  return true;
});
