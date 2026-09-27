import { devLog } from '../utils/logger';

export class ComposerInjector {
  /**
   * Safely opens reply box if needed and inserts text cleanly into Twitter Draft.js composer
   */
  static async injectReply(tweetEl: HTMLElement, text: string): Promise<boolean> {
    try {
      devLog('INJECTOR', `Locating Draft.js composer...`);

      // 1. First, make sure any previously hidden composer containers are restored to visible!
      document.querySelectorAll<HTMLElement>('[data-testid="tweetTextarea_0_label"]').forEach((el) => {
        if (el.style.display === 'none') {
          el.style.display = '';
        }
      });

      let composer = this.findComposer(tweetEl);

      // If not open, trigger native reply button
      if (!composer) {
        const replyBtn = tweetEl.querySelector<HTMLElement>(
          'button[data-testid="reply"], div[data-testid="reply"]'
        );
        if (replyBtn) {
          devLog('INJECTOR', `Opening native reply box via click on reply button...`);
          replyBtn.click();
          composer = await this.waitForComposer(2000);
        }
      }

      if (!composer) {
        devLog('ERROR', 'Could not locate Twitter reply composer in DOM');
        console.warn('EchoX: Could not find Twitter reply composer');
        return false;
      }

      // Ensure composer and all parent containers are visible
      let parent = composer.parentElement;
      while (parent && parent !== document.body) {
        if (parent.style.display === 'none') {
          parent.style.display = '';
        }
        parent = parent.parentElement;
      }
      composer.style.display = '';

      // Scroll into view & focus composer
      composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      composer.focus();
      await new Promise((r) => setTimeout(r, 60));

      // 2. Select existing contents so new text cleanly replaces it
      document.execCommand('selectAll', false, null);

      // 3. Insert text cleanly using DataTransfer Paste (the native Draft.js mechanism)
      let pasteWorked = false;
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        });
        composer.dispatchEvent(pasteEvent);

        // Allow React/Draft.js a tick to process the synthetic paste
        await new Promise((r) => setTimeout(r, 80));
        if (composer.textContent && composer.textContent.includes(text.slice(0, 15))) {
          pasteWorked = true;
        }
      } catch (e) {
        devLog('INJECTOR', 'Clipboard paste dispatch error', e);
      }

      // Fallback: If DataTransfer paste was not committed, use execCommand insertText
      if (!pasteWorked) {
        devLog('INJECTOR', 'Paste did not commit text, using insertText fallback...');
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        await new Promise((r) => setTimeout(r, 50));
      }

      // 4. Place cursor at the end of the inserted reply
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {}

      // 5. Hide ONLY the actual placeholder text element (.public-DraftEditorPlaceholder-root), NEVER the composer container
      const placeholder = composer.closest('[data-testid="tweetTextarea_0_label"]')?.querySelector<HTMLElement>(
        '.public-DraftEditorPlaceholder-root'
      ) || document.querySelector<HTMLElement>('.public-DraftEditorPlaceholder-root');
      if (placeholder && composer.textContent?.trim().length) {
        placeholder.style.display = 'none';
      }

      // 6. Dispatch standard DOM update events (without raw data to prevent duplication)
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      composer.dispatchEvent(new Event('change', { bubbles: true }));

      // 7. Ensure Twitter's native Reply button is enabled
      setTimeout(() => {
        const replySubmitBtn = document.querySelector<HTMLButtonElement>(
          'button[data-testid="tweetButtonInline"], button[data-testid="tweetButton"]'
        );
        if (replySubmitBtn) {
          replySubmitBtn.removeAttribute('disabled');
          replySubmitBtn.setAttribute('aria-disabled', 'false');
        }
      }, 50);

      devLog('INJECTOR', `✔ Text cleanly inserted into X composer with preview visible!`);
      return true;
    } catch (err) {
      devLog('ERROR', `Failed to inject reply: ${err}`);
      console.error('EchoX: Failed to inject reply:', err);
      return false;
    }
  }

  static findComposer(tweetEl?: HTMLElement): HTMLElement | null {
    // 1. Check active modal dialog first (highest priority when reply modal is open)
    const modalBox = document.querySelector<HTMLElement>(
      'div[role="dialog"] div[data-testid="tweetTextarea_0"], div[role="dialog"] div[role="textbox"][contenteditable="true"]'
    );
    if (modalBox) return modalBox;

    // 2. Check in immediate container
    if (tweetEl) {
      const inlineBox = tweetEl.querySelector<HTMLElement>(
        'div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'
      );
      if (inlineBox) return inlineBox;
    }

    // 3. Check page inline reply box
    const globalBox = document.querySelector<HTMLElement>(
      'div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'
    );
    return globalBox;
  }

  private static async waitForComposer(timeoutMs: number): Promise<HTMLElement | null> {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const box = this.findComposer();
        if (box) {
          clearInterval(check);
          resolve(box);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(check);
          resolve(null);
        }
      }, 100);
    });
  }
}
