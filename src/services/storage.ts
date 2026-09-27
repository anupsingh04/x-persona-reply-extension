import { AppSettings, PersonaProfile, AdaptiveMemoryEntry } from '../types';

export const DEFAULT_BANNED_PHRASES = [
  'Spot on!',
  'Couldn\'t agree more!',
  'Fascinating perspective',
  'Great insight!',
  'This!',
  'Here is why:',
  'Let that sink in.',
  'Read that again.',
  'Interesting take!'
];

export const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  model: 'gemini-3.5-flash-lite',
  smartGrokEnabled: true,
  autoCloseGrokDrawer: true,
  persona: {
    handle: 'you',
    tone: 'casual, insightful, dry humor, tech-savvy',
    casing: 'lowercase',
    punctuation: {
      trailingPeriods: false,
      emojiFrequency: 'low',
      preferredEmojis: ['👀', '💯']
    },
    avgLengthWords: 12,
    vocabulary: ['ngl', 'tbh', 'imo', 'clean', 'wild'],
    bannedPhrases: DEFAULT_BANNED_PHRASES,
    customRules: 'Never sound like an AI assistant. Keep it punchy and direct.',
    fewShotSamples: [
      'fair point tbh, curious how this scales',
      'ngl looks super clean',
      'the latency difference here is wild'
    ],
    lastUpdated: Date.now()
  },
  adaptiveMemory: []
};

export async function getSettings(): Promise<AppSettings> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      resolve(DEFAULT_SETTINGS);
      return;
    }
    chrome.storage.local.get(['settings'], (result) => {
      if (result.settings) {
        resolve({ ...DEFAULT_SETTINGS, ...result.settings });
      } else {
        resolve(DEFAULT_SETTINGS);
      }
    });
  });
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings: updated }, () => {
      resolve(updated);
    });
  });
}

export async function addAdaptiveMemory(entry: AdaptiveMemoryEntry): Promise<void> {
  const settings = await getSettings();
  const memories = [entry, ...(settings.adaptiveMemory || [])].slice(0, 50); // Keep latest 50
  await saveSettings({ adaptiveMemory: memories });
}

export async function updatePersona(persona: PersonaProfile): Promise<void> {
  await saveSettings({ persona });
}
