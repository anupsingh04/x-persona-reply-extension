import { PersonaProfile, AdaptiveMemoryEntry } from '../types';
import { DEFAULT_BANNED_PHRASES } from './storage';

export function buildPersonaSystemPrompt(
  persona: PersonaProfile | null,
  adaptiveMemories: AdaptiveMemoryEntry[] = []
): string {
  if (!persona) {
    return `You are a real human writing a natural reply on X (formerly Twitter).
CRITICAL RULES:
- Never speak like a corporate AI assistant.
- Ban cliché praise (e.g., "Spot on!", "Couldn't agree more!", "Great insight!").
- Keep replies punchy, conversational, and direct (under 25 words).
- Match modern internet typography.`;
  }

  const memoryContext = adaptiveMemories.length > 0
    ? `\nRECENT USER EDITS (LEARN FROM THESE ADJUSTMENTS):
${adaptiveMemories.slice(0, 5).map(m => `- Changed "${m.originalText}" -> "${m.editedText}"`).join('\n')}`
    : '';

  const fewShotContext = persona.fewShotSamples.length > 0
    ? `\nAUTHENTIC SAMPLES WRITTEN BY THE USER:
${persona.fewShotSamples.map(s => `"${s}"`).join('\n')}`
    : '';

  const bannedPhrases = Array.from(new Set([...DEFAULT_BANNED_PHRASES, ...(persona.bannedPhrases || [])]));

  return `You are ghostwriting a reply on X for @${persona.handle}. You must write EXACTLY like them.

USER VOICE PROFILE:
- Tone: ${persona.tone}
- Casing: ${persona.casing === 'lowercase' ? 'Strictly all-lowercase (never capitalize sentences or first letters unless intentional)' : persona.casing}
- Trailing period: ${persona.punctuation.trailingPeriods ? 'Uses periods at ends of short replies' : 'Never use trailing periods on single-sentence replies'}
- Emoji style: ${persona.punctuation.emojiFrequency} frequency. Allowed emojis: ${persona.punctuation.preferredEmojis.length ? persona.punctuation.preferredEmojis.join(' ') : 'None'}
- Typical reply length: around ${persona.avgLengthWords} words.
- Natural vocabulary/slang: ${persona.vocabulary.join(', ')}
${persona.customRules ? `- Specific User Guidelines: ${persona.customRules}` : ''}

ANTI-SLOP DIRECTIVES (STRICTLY FORBIDDEN):
- Banned phrases: ${bannedPhrases.join(', ')}
- No generic cheerleading, no numbered lists, no hashtags, no "Here is why:" tropes.
- Do NOT sound eager to please or academic. Speak like a real person typing on a phone.${memoryContext}${fewShotContext}`;
}

export function parsePersonaAnalysisJson(rawJson: string, handle: string): PersonaProfile {
  try {
    const cleaned = rawJson.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      handle,
      tone: parsed.tone || 'casual, conversational, dry humor',
      casing: parsed.casing || 'lowercase',
      punctuation: {
        trailingPeriods: parsed.punctuation?.trailingPeriods ?? false,
        emojiFrequency: parsed.punctuation?.emojiFrequency || 'low',
        preferredEmojis: parsed.punctuation?.preferredEmojis || []
      },
      avgLengthWords: parsed.avgLengthWords || 12,
      vocabulary: parsed.vocabulary || ['ngl', 'tbh', 'idk', 'w/'],
      bannedPhrases: DEFAULT_BANNED_PHRASES,
      customRules: parsed.customRules || '',
      fewShotSamples: parsed.fewShotSamples || [],
      lastUpdated: Date.now()
    };
  } catch (e) {
    console.error('Failed to parse persona JSON:', e);
    return {
      handle,
      tone: 'casual, insightful, tech-savvy',
      casing: 'lowercase',
      punctuation: {
        trailingPeriods: false,
        emojiFrequency: 'low',
        preferredEmojis: []
      },
      avgLengthWords: 12,
      vocabulary: ['ngl', 'tbh', 'imo'],
      bannedPhrases: DEFAULT_BANNED_PHRASES,
      customRules: '',
      fewShotSamples: [],
      lastUpdated: Date.now()
    };
  }
}
