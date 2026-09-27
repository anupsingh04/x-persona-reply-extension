import { TweetContext, GeneratedReplyCandidate, PersonaProfile, AdaptiveMemoryEntry } from '../types';
import { buildPersonaSystemPrompt, parsePersonaAnalysisJson } from './personaEngine';
import { devLog } from '../utils/logger';

export interface LLMConfig {
  apiKey: string;
  model: string;
}

export class LLMService {
  private apiKey: string;
  private model: string;

  constructor(config: LLMConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-3.5-flash-lite';
  }

  async generateReplies(
    context: TweetContext,
    persona: PersonaProfile | null,
    adaptiveMemories: AdaptiveMemoryEntry[] = []
  ): Promise<GeneratedReplyCandidate[]> {
    if (!this.apiKey) {
      devLog('GEMINI', 'No API key set - generating smart contextual preview candidates.');
      return this.generateDemoCandidates(context);
    }

    devLog('GEMINI', `Generating 3 replies for post by @${context.handle} with persona:`, {
      tone: persona?.tone || 'default',
      casing: persona?.casing || 'lowercase',
      adaptiveEditsCount: adaptiveMemories.length
    });

    const systemPrompt = buildPersonaSystemPrompt(persona, adaptiveMemories);

    let contextDetails = `POST AUTHOR: @${context.handle} (${context.author})\nPOST TEXT:\n"${context.text}"`;
    if (context.isQuoteTweet && context.quoteText) {
      contextDetails += `\nQUOTED TWEET:\n"${context.quoteText}"`;
    }
    if (context.mediaAlt && context.mediaAlt.length > 0) {
      contextDetails += `\nMEDIA DESCRIPTIONS: ${context.mediaAlt.join('; ')}`;
    }
    if (context.grokExplanation) {
      contextDetails += `\n\nGROK BACKGROUND CONTEXT & EXPLANATION:\n${context.grokExplanation}`;
    }

    const prompt = `${contextDetails}

TASK:
Write 3 natural reply options for this post matching the Persona Profile.
Output ONLY a valid JSON array of objects with the following schema:
[
  {
    "stance": "casual",
    "label": "Casual Banter",
    "emoji": "🤝",
    "text": "your reply here"
  },
  {
    "stance": "insightful",
    "label": "Insightful",
    "emoji": "🧠",
    "text": "your reply here"
  },
  {
    "stance": "witty",
    "label": "Hot Take",
    "emoji": "🔥",
    "text": "your reply here"
  }
]`;

    const rawResponse = await this.callGemini(prompt, systemPrompt);
    const candidates = this.parseCandidates(rawResponse);
    devLog('GEMINI', `Successfully generated ${candidates.length} candidates:`, candidates.map(c => `[${c.label}]: "${c.text}"`));
    return candidates;
  }

  generateDemoCandidates(context: TweetContext): GeneratedReplyCandidate[] {
    const textLower = (context.text || '').toLowerCase();
    const isQuestion = (context.text || '').includes('?');
    const isTech = /code|build|bug|deploy|ai|model|llm|stack|perf|rust|python|typescript|dev/i.test(textLower);

    if (isQuestion) {
      return [
        {
          stance: 'casual',
          label: 'Casual Banter',
          emoji: '🤝',
          text: 'depends on the setup tbh, usually the simpler option wins'
        },
        {
          stance: 'insightful',
          label: 'Insightful',
          emoji: '🧠',
          text: 'biggest tradeoff is probably maintainability over raw speed at this scale'
        },
        {
          stance: 'witty',
          label: 'Hot Take',
          emoji: '🔥',
          text: 'neither, just ship the mvp and let users break it first'
        }
      ];
    }

    if (isTech) {
      return [
        {
          stance: 'casual',
          label: 'Casual Banter',
          emoji: '🤝',
          text: 'honestly super clean, need to test this workflow'
        },
        {
          stance: 'insightful',
          label: 'Insightful',
          emoji: '🧠',
          text: 'the latency profile here is pretty impressive, especially on cold starts'
        },
        {
          stance: 'witty',
          label: 'Hot Take',
          emoji: '🔥',
          text: 'looks great until you hit production edge cases at 2am'
        }
      ];
    }

    return [
      {
        stance: 'casual',
        label: 'Casual Banter',
        emoji: '🤝',
        text: 'fair point tbh, hadn\'t thought about it like that'
      },
      {
        stance: 'insightful',
        label: 'Insightful',
        emoji: '🧠',
        text: 'the second-order effect of this is what makes it interesting long term'
      },
      {
        stance: 'witty',
        label: 'Hot Take',
        emoji: '🔥',
        text: 'wild take but honestly not far off'
      }
    ];
  }

  async extractPersonaFromReplies(replies: string[], handle: string): Promise<PersonaProfile> {
    if (!this.apiKey) {
      throw new Error('Gemini API key is required to analyze profile style.');
    }

    devLog('GEMINI', `Synthesizing Voice DNA from ${replies.length} replies for @${handle}...`);

    const systemPrompt = `You are an expert computational linguist and social media voice profiler.
Your job is to analyze a user's recent replies on X and extract their exact writing voice, typography, and personality quirks.`;

    const prompt = `Analyze these ${replies.length} recent replies written by @${handle} on X:

${replies.map((r, i) => `${i + 1}. "${r}"`).join('\n')}

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
    devLog('GEMINI', `Voice DNA synthesized successfully for @${handle}:`, {
      tone: persona.tone,
      casing: persona.casing,
      vocabulary: persona.vocabulary
    });
    return persona;
  }

  private async callGemini(prompt: string, systemInstruction: string): Promise<string> {
    const modelsToTry = [
      this.model || 'gemini-3.5-flash-lite',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash'
    ];
    const uniqueModels = Array.from(new Set(modelsToTry));

    let lastError = '';

    for (const model of uniqueModels) {
      try {
        devLog('GEMINI', `Sending request to model: ${model}...`);
        const startTime = Date.now();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        
        const body = {
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json'
          }
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const err = await response.text();
          // Fall back gracefully if a model endpoint is experiencing high demand (503), rate limit (429), or not found (404)
          if (response.status === 503 || response.status === 429 || response.status === 404) {
            devLog('GEMINI', `Model ${model} returned ${response.status} (Busy / Unavailable). Auto-falling back to next model...`);
            lastError = err;
            await new Promise((r) => setTimeout(r, 400));
            continue;
          }
          throw new Error(`Gemini API error (${response.status}): ${err}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidate) {
          throw new Error('Empty response from Gemini API.');
        }

        const duration = Date.now() - startTime;
        devLog('GEMINI', `✔ Model ${model} responded in ${duration}ms!`);
        return candidate;
      } catch (err: any) {
        if (err.message && (err.message.includes('503') || err.message.includes('429') || err.message.includes('404'))) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        throw err;
      }
    }

    devLog('ERROR', `All Gemini fallback models exhausted: ${lastError}`);
    throw new Error(`All Gemini models temporarily unavailable (${lastError || 'Please try again in a moment'}).`);
  }

  private parseCandidates(rawJson: string): GeneratedReplyCandidate[] {
    try {
      const cleaned = rawJson.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(item => ({
          stance: item.stance || 'casual',
          label: item.label || 'Reply',
          emoji: item.emoji || '💬',
          text: item.text || ''
        }));
      }
      throw new Error('Invalid candidates format');
    } catch (e) {
      console.error('Failed to parse reply candidates:', e, rawJson);
      return [
        { stance: 'casual', label: 'Casual', emoji: '🤝', text: 'fair point' },
        { stance: 'insightful', label: 'Insightful', emoji: '🧠', text: 'wonder how this scales with edge cases' },
        { stance: 'witty', label: 'Hot Take', emoji: '🔥', text: 'wild take but not wrong' }
      ];
    }
  }
}
