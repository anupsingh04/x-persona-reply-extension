import { ReplyWidget } from './replyWidget';
import { StyleSync } from './styleSync';

function initObserver() {
  let debounceTimer: number | null = null;

  const scanAndInject = () => {
    const tweets = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]');
    tweets.forEach((tweet) => {
      ReplyWidget.injectButton(tweet);
    });
  };

  // Initial scan
  scanAndInject();

  // Watch for dynamic DOM changes on scroll (debounced to avoid layout thrashing)
  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) return;
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      scanAndInject();
    }, 150);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Listen for commands from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'HARVEST_PROFILE_REPLIES') {
    const replies = StyleSync.harvestProfileReplies();
    sendResponse({ success: true, replies });
  }
  return true;
});

// Run when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initObserver);
} else {
  initObserver();
}
