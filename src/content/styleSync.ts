export class StyleSync {
  /**
   * Scrapes replies from the current profile page
   */
  static harvestProfileReplies(): string[] {
    const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');
    const replies: string[] = [];

    tweetElements.forEach((el) => {
      const textEl = el.querySelector('[data-testid="tweetText"]');
      if (!textEl) return;

      const raw = textEl.textContent?.trim() || '';
      // Exclude simple link-only posts or very short tweets
      if (raw.length > 5 && !raw.startsWith('http')) {
        // Strip starting @handles
        const cleaned = raw.replace(/^(@\w+\s*)+/, '').trim();
        if (cleaned.length > 5 && !replies.includes(cleaned)) {
          replies.push(cleaned);
        }
      }
    });

    return replies;
  }
}
