import { ComposerInjector } from './composerInjector';
import { devLog } from '../utils/logger';

export class EditTracker {
  private static activeTracking: { tweetId: string; originalText: string } | null = null;
  private static clickHandler: ((e: MouseEvent) => void) | null = null;
  private static keyHandler: ((e: KeyboardEvent) => void) | null = null;

  static trackPendingReply(tweetId: string, originalText: string, tweetSnippet: string) {
    this.activeTracking = { tweetId, originalText };
    devLog('MEMORY', `Tracking edits for reply on tweet #${tweetId}: "${originalText}"`);

    // Register with background worker
    chrome.runtime.sendMessage({
      type: 'REGISTER_PENDING_REPLY',
      tweetId,
      originalText,
      tweetSnippet
    });

    this.attachSendListeners();
  }

  private static attachSendListeners() {
    this.cleanupListeners();

    const checkSubmit = () => {
      if (!this.activeTracking) return;

      const composer = ComposerInjector.findComposer();
      const finalText = composer?.textContent?.trim() || '';

      if (finalText && finalText !== this.activeTracking.originalText) {
        devLog('MEMORY', `💡 User edited reply before sending! Learning style refinement:`, {
          original: this.activeTracking.originalText,
          edited: finalText
        });

        chrome.runtime.sendMessage({
          type: 'RECORD_REPLY_EDIT',
          tweetId: this.activeTracking.tweetId,
          finalText
        });
      } else {
        devLog('MEMORY', `User sent reply unchanged (100% matched suggestion).`);
      }

      this.activeTracking = null;
      this.cleanupListeners();
    };

    // 1. Listen for click on Twitter's Tweet / Reply submit button
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const sendBtn = target.closest(
        'button[data-testid="tweetButton"], button[data-testid="tweetButtonInline"]'
      );
      if (sendBtn) {
        checkSubmit();
      }
    };

    // 2. Listen for keyboard submit shortcut (Ctrl+Enter / Cmd+Enter)
    this.keyHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        checkSubmit();
      }
    };

    document.addEventListener('click', this.clickHandler, true);
    document.addEventListener('keydown', this.keyHandler, true);
  }

  private static cleanupListeners() {
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
      this.clickHandler = null;
    }
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  }
}
