import { TweetContext } from '../types';
import { GrokScraper } from './grokScraper';
import { devLog } from '../utils/logger';

export class ContextExtractor {
  static extractDirectContext(tweetEl: HTMLElement): TweetContext {
    // 1. Author and handle
    const userNameEl = tweetEl.querySelector('[data-testid="User-Name"]');
    let author = 'Unknown';
    let handle = 'unknown';

    if (userNameEl) {
      const links = userNameEl.querySelectorAll('a');
      if (links.length > 0) {
        author = links[0].textContent?.trim() || author;
        const href = links[0].getAttribute('href') || '';
        handle = href.replace('/', '').trim() || handle;
      }
    }

    // 2. Tweet Text
    const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
    const text = textEl?.textContent?.trim() || '';

    // 3. Media Alt Descriptions
    const mediaImgs = tweetEl.querySelectorAll('img[alt]');
    const mediaAlt: string[] = [];
    mediaImgs.forEach((img) => {
      const alt = img.getAttribute('alt')?.trim();
      if (alt && alt !== 'Image' && alt !== author) {
        mediaAlt.push(alt);
      }
    });

    // 4. Quote Tweet
    const quoteEl = tweetEl.querySelector('div[role="link"] [data-testid="tweetText"]');
    const isQuoteTweet = !!quoteEl;
    const quoteText = quoteEl?.textContent?.trim();

    // 5. Links & Media presence
    const hasLinks = !!tweetEl.querySelector('a[href*="t.co"]');
    const hasMedia = mediaAlt.length > 0 || !!tweetEl.querySelector('video');

    // 6. Thread / Parent context heuristic
    const isThread = !!tweetEl.querySelector('div[aria-label*="thread" i]');

    // Generate unique ID
    const tweetLink = tweetEl.querySelector('a[href*="/status/"]');
    const id = tweetLink?.getAttribute('href')?.split('/status/')[1]?.split('?')[0] || `tweet-${Date.now()}`;

    return {
      id,
      author,
      handle,
      text,
      mediaAlt,
      hasLinks,
      hasMedia,
      isQuoteTweet,
      quoteText,
      isThread,
      contextSource: 'direct'
    };
  }

  static async extractSmartContext(
    tweetEl: HTMLElement,
    smartGrokEnabled: boolean,
    autoCloseDrawer: boolean
  ): Promise<TweetContext> {
    const directContext = this.extractDirectContext(tweetEl);

    // If Grok mode is disabled, return direct immediately
    if (!smartGrokEnabled) {
      devLog('CONTEXT', `Direct context used (Grok mode disabled) for @${directContext.handle}: "${directContext.text.slice(0, 45)}..."`);
      return directContext;
    }

    // Smart heuristic: Grok is triggered ONLY for complex content with external links (articles/news) or dense quote tweets
    const isComplex = directContext.hasLinks || (directContext.isQuoteTweet && (directContext.quoteText?.length || 0) > 80);
    
    if (!isComplex) {
      devLog('CONTEXT', `Direct context used (simple post, 0ms latency) for @${directContext.handle}: "${directContext.text.slice(0, 45)}..."`);
      return directContext;
    }

    // Check if Grok button is available on this post
    const grokBtn = GrokScraper.findGrokButton(tweetEl);
    if (!grokBtn) {
      devLog('CONTEXT', `No Grok button found on tweet; falling back to direct context.`);
      return directContext;
    }

    devLog('GROK', `Engaging Grok for deep background context on complex post...`);
    const grokSummary = await GrokScraper.extractGrokExplanation(tweetEl, autoCloseDrawer);
    if (grokSummary) {
      devLog('GROK', `Grok explanation obtained: "${grokSummary.slice(0, 60)}..."`);
      return {
        ...directContext,
        grokExplanation: grokSummary,
        contextSource: 'hybrid'
      };
    }

    return directContext;
  }
}
