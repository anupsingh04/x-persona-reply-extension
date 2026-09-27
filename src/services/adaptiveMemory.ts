import { AdaptiveMemoryEntry } from '../types';
import { addAdaptiveMemory } from './storage';

export class AdaptiveMemoryService {
  private activePendingReplies: Map<string, { originalText: string; tweetSnippet: string }> = new Map();

  registerPendingReply(tweetId: string, originalText: string, tweetSnippet: string) {
    this.activePendingReplies.set(tweetId, { originalText, tweetSnippet });
  }

  async recordSentReply(tweetId: string, finalSubmittedText: string): Promise<AdaptiveMemoryEntry | null> {
    const pending = this.activePendingReplies.get(tweetId);
    if (!pending) return null;

    const trimmedOriginal = pending.originalText.trim();
    const trimmedFinal = finalSubmittedText.trim();

    // If unchanged or drastically different, only record meaningful refinements
    if (trimmedOriginal === trimmedFinal) {
      this.activePendingReplies.delete(tweetId);
      return null;
    }

    const entry: AdaptiveMemoryEntry = {
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
}

export const adaptiveMemoryService = new AdaptiveMemoryService();
