export type StanceType = 'casual' | 'insightful' | 'witty';

export interface PersonaProfile {
  handle: string;
  name?: string;
  tone: string;
  casing: 'lowercase' | 'standard' | 'mixed';
  punctuation: {
    trailingPeriods: boolean;
    emojiFrequency: 'none' | 'low' | 'medium' | 'high';
    preferredEmojis: string[];
  };
  avgLengthWords: number;
  vocabulary: string[];
  bannedPhrases: string[];
  customRules: string;
  fewShotSamples: string[];
  lastUpdated: number;
}

export interface TweetContext {
  id: string;
  author: string;
  handle: string;
  text: string;
  mediaAlt: string[];
  hasLinks: boolean;
  hasMedia: boolean;
  isQuoteTweet: boolean;
  quoteText?: string;
  isThread: boolean;
  grokExplanation?: string;
  contextSource: 'direct' | 'grok' | 'hybrid';
}

export interface GeneratedReplyCandidate {
  stance: StanceType;
  label: string;
  emoji: string;
  text: string;
}

export interface AdaptiveMemoryEntry {
  id: string;
  timestamp: number;
  originalText: string;
  editedText: string;
  tweetSnippet: string;
}

export interface AppSettings {
  geminiApiKey: string;
  model: string;
  smartGrokEnabled: boolean;
  autoCloseGrokDrawer: boolean;
  persona: PersonaProfile | null;
  adaptiveMemory: AdaptiveMemoryEntry[];
}

export interface GenerateRepliesRequest {
  context: TweetContext;
  selectedStance?: StanceType;
}

export interface GenerateRepliesResponse {
  candidates: GeneratedReplyCandidate[];
  error?: string;
}
