export class GrokScraper {
  /**
   * Attempts to locate the Grok button on a specific tweet
   */
  static findGrokButton(tweetEl: HTMLElement): HTMLElement | null {
    const selectors = [
      'button[data-testid*="grok"]',
      'button[aria-label*="Grok" i]',
      'button[aria-label*="Explain" i]',
      'div[role="button"][aria-label*="Grok" i]'
    ];

    for (const sel of selectors) {
      const btn = tweetEl.querySelector<HTMLElement>(sel);
      if (btn) return btn;
    }

    // Secondary scan: check svg path or button text within the tweet action bar only
    const actionGroup = tweetEl.querySelector('div[role="group"]');
    if (actionGroup) {
      const buttons = actionGroup.querySelectorAll('button, div[role="button"]');
      for (const btn of buttons) {
        const text = btn.textContent || '';
        const aria = btn.getAttribute('aria-label') || '';
        if (/grok|explain/i.test(text) || /grok|explain/i.test(aria)) {
          return btn as HTMLElement;
        }
      }
    }

    return null;
  }

  /**
   * Clicks Grok button, waits for drawer content, extracts text, and safely dismisses drawer
   */
  static async extractGrokExplanation(
    tweetEl: HTMLElement,
    autoClose: boolean = true,
    timeoutMs: number = 7000
  ): Promise<string | null> {
    const grokBtn = this.findGrokButton(tweetEl);
    if (!grokBtn) {
      console.log('EchoX: No Grok button found on tweet element');
      return null;
    }

    try {
      // Trigger Grok
      grokBtn.click();

      // Wait for Grok drawer container to appear
      const result = await this.waitForGrokResponse(timeoutMs);

      if (autoClose && result.drawerEl) {
        this.closeGrokDrawer(result.drawerEl);
      }

      return result.text;
    } catch (e) {
      console.warn('EchoX: Grok extraction failed or timed out:', e);
      return null;
    }
  }

  private static async waitForGrokResponse(timeoutMs: number): Promise<{ text: string | null; drawerEl: HTMLElement | null }> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      let lastText = '';
      let stableCount = 0;

      const checkInterval = setInterval(() => {
        // Find grok panel / drawer
        const drawerSelectors = [
          '[data-testid="grokDrawer"]',
          '[data-testid="GrokDrawer"]',
          '[aria-label*="Grok" i][role="region"]',
          '[aria-label*="Grok" i][role="dialog"]',
          'div[data-testid="sheetDialog"]'
        ];

        let drawerEl: HTMLElement | null = null;
        for (const sel of drawerSelectors) {
          drawerEl = document.querySelector<HTMLElement>(sel);
          if (drawerEl) break;
        }

        if (drawerEl) {
          // Look for response paragraph elements inside the drawer
          const textBlocks = drawerEl.querySelectorAll('div[dir="auto"], span[dir="auto"], p');
          const combined = Array.from(textBlocks)
            .map(el => el.textContent?.trim() || '')
            .filter(t => t.length > 20 && !/grok|ask grok|subscribe|close/i.test(t))
            .join('\n\n');

          if (combined.length > 30) {
            if (combined === lastText) {
              stableCount++;
              if (stableCount >= 2) {
                clearInterval(checkInterval);
                resolve({ text: combined, drawerEl });
                return;
              }
            } else {
              lastText = combined;
              stableCount = 0;
            }
          }
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          resolve({ text: lastText.length > 20 ? lastText : null, drawerEl });
        }
      }, 500);
    });
  }

  private static closeGrokDrawer(drawerEl: HTMLElement) {
    setTimeout(() => {
      // ONLY search inside the identified Grok drawer element! NEVER search global document!
      const closeButton = drawerEl.querySelector<HTMLElement>(
        'button[aria-label="Close"], button[aria-label*="Dismiss" i], button[data-testid="app-bar-close"], div[role="button"][aria-label="Close"]'
      );
      if (closeButton) {
        closeButton.click();
      }
    }, 200);
  }
}
