import { ContextExtractor } from './contextExtractor';
import { ComposerInjector } from './composerInjector';
import { EditTracker } from './editTracker';
import { GeneratedReplyCandidate } from '../types';
import { devLog } from '../utils/logger';

export class ReplyWidget {
  static injectButton(tweetEl: HTMLElement) {
    // Avoid double injection
    if (tweetEl.querySelector('.echox-action-btn')) return;

    // Find action group (reply, retweet, like, etc.)
    const actionGroup = tweetEl.querySelector('div[role="group"]');
    if (!actionGroup) return;

    const btnWrapper = document.createElement('div');
    btnWrapper.className = 'echox-action-btn-wrapper';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'echox-action-btn';
    btn.setAttribute('aria-label', 'EchoX - Reply As Me');
    btn.title = 'Reply in your authentic voice (EchoX)';

    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path d="M12 2L14.4 7.6L20 10L14.4 12.4L12 18L9.6 12.4L4 10L9.6 7.6L12 2Z"/>
        <path d="M19 15L20.2 17.8L23 19L20.2 20.2L19 23L17.8 20.2L15 19L17.8 17.8L19 15Z"/>
      </svg>
      <span class="echox-btn-text">AI Reply</span>
    `;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.toggleReplyPopover(tweetEl, btnWrapper);
    });

    btnWrapper.appendChild(btn);

    // Insert right after the native Reply button if found
    const replyBtn = actionGroup.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
    if (replyBtn) {
      const parentContainer = replyBtn.closest('div.css-175oi2r') || replyBtn;
      parentContainer.insertAdjacentElement('afterend', btnWrapper);
    } else {
      actionGroup.insertBefore(btnWrapper, actionGroup.firstChild);
    }
  }

  private static async toggleReplyPopover(tweetEl: HTMLElement, _triggerEl: HTMLElement) {
    const existing = tweetEl.querySelector('.echox-popover');
    if (existing) {
      existing.remove();
      return;
    }

    // Create popover
    const popover = document.createElement('div');
    popover.className = 'echox-popover';
    popover.innerHTML = `
      <div class="echox-popover-header">
        <div class="echox-title">
          <span class="echox-sparkle">✨</span>
          <span>EchoX Voice Studio</span>
          <span class="echox-model-tag">Gemini 3.5</span>
          <span class="echox-demo-badge" style="display: none;">Demo Mode</span>
        </div>
        <button class="echox-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="echox-status">
        <div class="echox-spinner"></div>
        <span>Gathering post context...</span>
      </div>
      <div class="echox-candidates" style="display: none;"></div>
      <div class="echox-error" style="display: none;"></div>
    `;

    // Stop all clicks inside popover from bubbling to the tweet article (prevents unwanted navigation)
    popover.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Insert popover directly below the action bar inside the main tweet column (full width)
    const actionGroup = tweetEl.querySelector('div[role="group"]');
    if (actionGroup && actionGroup.parentElement) {
      actionGroup.insertAdjacentElement('afterend', popover);
    } else {
      tweetEl.appendChild(popover);
    }

    popover.querySelector('.echox-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.remove();
    });

    const statusEl = popover.querySelector('.echox-status') as HTMLElement;
    const candidatesEl = popover.querySelector('.echox-candidates') as HTMLElement;
    const errorEl = popover.querySelector('.echox-error') as HTMLElement;
    const demoBadge = popover.querySelector('.echox-demo-badge') as HTMLElement;

    try {
      // 1. Get settings
      const settingsRes = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      const settings = settingsRes?.settings || {};

      if (!settings.geminiApiKey) {
        demoBadge.style.display = 'inline-block';
        demoBadge.title = 'Add your Gemini API Key in the extension popup to enable personalized AI generation.';
      }

      // 2. Extract context
      statusEl.querySelector('span')!.textContent = settings.smartGrokEnabled
        ? 'Extracting context with Grok...'
        : 'Analyzing tweet context...';

      const context = await ContextExtractor.extractSmartContext(
        tweetEl,
        !!settings.smartGrokEnabled,
        settings.autoCloseGrokDrawer ?? true
      );

      devLog('UI', `Clicked [Reply As Me] on post by @${context.handle}: "${context.text.slice(0, 50)}..."`);

      // 3. Request LLM reply generation
      statusEl.querySelector('span')!.textContent = 'Generating replies in your voice...';

      devLog('LLM', `Requesting 3 stance options (model: ${settings.model || 'auto'})...`);

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_REPLIES',
        context
      });

      if (!response.success) {
        devLog('ERROR', `Generation failed: ${response.error}`);
        throw new Error(response.error || 'Failed to generate replies');
      }

      devLog('LLM', `Received ${response.candidates?.length} candidates from Gemini:`, response.candidates);

      statusEl.style.display = 'none';
      candidatesEl.style.display = 'flex';
      this.renderCandidates(candidatesEl, response.candidates, tweetEl, context.text, popover);
    } catch (err: any) {
      statusEl.style.display = 'none';
      errorEl.style.display = 'block';
      errorEl.textContent = err.message || 'Something went wrong.';
    }
  }

  private static renderCandidates(
    container: HTMLElement,
    candidates: GeneratedReplyCandidate[],
    tweetEl: HTMLElement,
    tweetText: string,
    popover: HTMLElement
  ) {
    container.innerHTML = '';

    candidates.forEach((cand) => {
      const card = document.createElement('div');
      card.className = `echox-candidate-card echox-stance-${cand.stance}`;
      card.title = 'Click to insert into reply composer';
      card.innerHTML = `
        <div class="echox-candidate-meta">
          <span class="echox-stance-tag echox-tag-${cand.stance}">${cand.emoji} ${cand.label}</span>
          <span class="echox-char-count">${cand.text.length} chars</span>
        </div>
        <div class="echox-candidate-text">${cand.text}</div>
        <div class="echox-candidate-actions">
          <button class="echox-copy-btn" title="Copy reply to clipboard">📋 Copy</button>
          <button class="echox-insert-btn">Insert Reply ↵</button>
        </div>
      `;

      // Copy handler
      const copyBtn = card.querySelector('.echox-copy-btn') as HTMLElement;
      copyBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        devLog('UI', `Copied reply text: "${cand.text}"`);
        try {
          await navigator.clipboard.writeText(cand.text);
          const orig = copyBtn.textContent;
          copyBtn.textContent = '✓ Copied';
          setTimeout(() => { copyBtn.textContent = orig; }, 1500);
        } catch {
          // Fallback copy
          const textarea = document.createElement('textarea');
          textarea.value = cand.text;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
          copyBtn.textContent = '✓ Copied';
          setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
        }
      });

      // Single, debounced insert handler
      let hasInserted = false;
      const doInsert = async (e: Event) => {
        if ((e.target as HTMLElement).closest('.echox-copy-btn')) return;
        e.stopPropagation();
        e.preventDefault();

        if (hasInserted) return;
        hasInserted = true;

        // 1. Immediately remove all EchoX popovers from the DOM so zero extension components overlap or linger!
        document.querySelectorAll('.echox-popover').forEach((p) => p.remove());

        // 2. Inject the text cleanly into the composer
        devLog('INJECTOR', `Selected candidate [${cand.label}]: "${cand.text}"`);
        const success = await ComposerInjector.injectReply(tweetEl, cand.text);
        if (success) {
          const tweetId = ContextExtractor.extractDirectContext(tweetEl).id;
          EditTracker.trackPendingReply(tweetId, cand.text, tweetText);
        }
      };

      card.addEventListener('click', doInsert);

      container.appendChild(card);
    });
  }
}
