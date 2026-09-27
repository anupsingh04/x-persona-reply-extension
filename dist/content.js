"use strict";
(() => {
  // src/content/grokScraper.ts
  var GrokScraper = class {
    /**
     * Attempts to locate the Grok button on a specific tweet
     */
    static findGrokButton(tweetEl) {
      const selectors = [
        'button[data-testid*="grok"]',
        'button[aria-label*="Grok" i]',
        'button[aria-label*="Explain" i]',
        'div[role="button"][aria-label*="Grok" i]'
      ];
      for (const sel of selectors) {
        const btn = tweetEl.querySelector(sel);
        if (btn) return btn;
      }
      const actionGroup = tweetEl.querySelector('div[role="group"]');
      if (actionGroup) {
        const buttons = actionGroup.querySelectorAll('button, div[role="button"]');
        for (const btn of buttons) {
          const text = btn.textContent || "";
          const aria = btn.getAttribute("aria-label") || "";
          if (/grok|explain/i.test(text) || /grok|explain/i.test(aria)) {
            return btn;
          }
        }
      }
      return null;
    }
    /**
     * Clicks Grok button, waits for drawer content, extracts text, and safely dismisses drawer
     */
    static async extractGrokExplanation(tweetEl, autoClose = true, timeoutMs = 7e3) {
      const grokBtn = this.findGrokButton(tweetEl);
      if (!grokBtn) {
        console.log("EchoX: No Grok button found on tweet element");
        return null;
      }
      try {
        grokBtn.click();
        const result = await this.waitForGrokResponse(timeoutMs);
        if (autoClose && result.drawerEl) {
          this.closeGrokDrawer(result.drawerEl);
        }
        return result.text;
      } catch (e) {
        console.warn("EchoX: Grok extraction failed or timed out:", e);
        return null;
      }
    }
    static async waitForGrokResponse(timeoutMs) {
      const startTime = Date.now();
      return new Promise((resolve) => {
        let lastText = "";
        let stableCount = 0;
        const checkInterval = setInterval(() => {
          const drawerSelectors = [
            '[data-testid="grokDrawer"]',
            '[data-testid="GrokDrawer"]',
            '[aria-label*="Grok" i][role="region"]',
            '[aria-label*="Grok" i][role="dialog"]',
            'div[data-testid="sheetDialog"]'
          ];
          let drawerEl = null;
          for (const sel of drawerSelectors) {
            drawerEl = document.querySelector(sel);
            if (drawerEl) break;
          }
          if (drawerEl) {
            const textBlocks = drawerEl.querySelectorAll('div[dir="auto"], span[dir="auto"], p');
            const combined = Array.from(textBlocks).map((el) => el.textContent?.trim() || "").filter((t) => t.length > 20 && !/grok|ask grok|subscribe|close/i.test(t)).join("\n\n");
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
    static closeGrokDrawer(drawerEl) {
      setTimeout(() => {
        const closeButton = drawerEl.querySelector(
          'button[aria-label="Close"], button[aria-label*="Dismiss" i], button[data-testid="app-bar-close"], div[role="button"][aria-label="Close"]'
        );
        if (closeButton) {
          closeButton.click();
        }
      }, 200);
    }
  };

  // src/utils/logger.ts
  function devLog(tag, message, data) {
    if (data !== void 0) {
      console.log(`[EchoX:${tag}] ${message}`, data);
    } else {
      console.log(`[EchoX:${tag}] ${message}`);
    }
    try {
      fetch("http://127.0.0.1:3999/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag,
          message,
          data: data !== void 0 ? data : void 0,
          timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString()
        })
      }).catch(() => {
      });
    } catch {
    }
  }

  // src/content/contextExtractor.ts
  var ContextExtractor = class {
    static extractDirectContext(tweetEl) {
      const userNameEl = tweetEl.querySelector('[data-testid="User-Name"]');
      let author = "Unknown";
      let handle = "unknown";
      if (userNameEl) {
        const links = userNameEl.querySelectorAll("a");
        if (links.length > 0) {
          author = links[0].textContent?.trim() || author;
          const href = links[0].getAttribute("href") || "";
          handle = href.replace("/", "").trim() || handle;
        }
      }
      const textEl = tweetEl.querySelector('[data-testid="tweetText"]');
      const text = textEl?.textContent?.trim() || "";
      const mediaImgs = tweetEl.querySelectorAll("img[alt]");
      const mediaAlt = [];
      mediaImgs.forEach((img) => {
        const alt = img.getAttribute("alt")?.trim();
        if (alt && alt !== "Image" && alt !== author) {
          mediaAlt.push(alt);
        }
      });
      const quoteEl = tweetEl.querySelector('div[role="link"] [data-testid="tweetText"]');
      const isQuoteTweet = !!quoteEl;
      const quoteText = quoteEl?.textContent?.trim();
      const hasLinks = !!tweetEl.querySelector('a[href*="t.co"]');
      const hasMedia = mediaAlt.length > 0 || !!tweetEl.querySelector("video");
      const isThread = !!tweetEl.querySelector('div[aria-label*="thread" i]');
      const tweetLink = tweetEl.querySelector('a[href*="/status/"]');
      const id = tweetLink?.getAttribute("href")?.split("/status/")[1]?.split("?")[0] || `tweet-${Date.now()}`;
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
        contextSource: "direct"
      };
    }
    static async extractSmartContext(tweetEl, smartGrokEnabled, autoCloseDrawer) {
      const directContext = this.extractDirectContext(tweetEl);
      if (!smartGrokEnabled) {
        devLog("CONTEXT", `Direct context used (Grok mode disabled) for @${directContext.handle}: "${directContext.text.slice(0, 45)}..."`);
        return directContext;
      }
      const isComplex = directContext.hasLinks || directContext.isQuoteTweet && (directContext.quoteText?.length || 0) > 80;
      if (!isComplex) {
        devLog("CONTEXT", `Direct context used (simple post, 0ms latency) for @${directContext.handle}: "${directContext.text.slice(0, 45)}..."`);
        return directContext;
      }
      const grokBtn = GrokScraper.findGrokButton(tweetEl);
      if (!grokBtn) {
        devLog("CONTEXT", `No Grok button found on tweet; falling back to direct context.`);
        return directContext;
      }
      devLog("GROK", `Engaging Grok for deep background context on complex post...`);
      const grokSummary = await GrokScraper.extractGrokExplanation(tweetEl, autoCloseDrawer);
      if (grokSummary) {
        devLog("GROK", `Grok explanation obtained: "${grokSummary.slice(0, 60)}..."`);
        return {
          ...directContext,
          grokExplanation: grokSummary,
          contextSource: "hybrid"
        };
      }
      return directContext;
    }
  };

  // src/content/composerInjector.ts
  var ComposerInjector = class {
    /**
     * Safely opens reply box if needed and inserts text cleanly into Twitter Draft.js composer
     */
    static async injectReply(tweetEl, text) {
      try {
        devLog("INJECTOR", `Locating Draft.js composer...`);
        document.querySelectorAll('[data-testid="tweetTextarea_0_label"]').forEach((el) => {
          if (el.style.display === "none") {
            el.style.display = "";
          }
        });
        let composer = this.findComposer(tweetEl);
        if (!composer) {
          const replyBtn = tweetEl.querySelector(
            'button[data-testid="reply"], div[data-testid="reply"]'
          );
          if (replyBtn) {
            devLog("INJECTOR", `Opening native reply box via click on reply button...`);
            replyBtn.click();
            composer = await this.waitForComposer(2e3);
          }
        }
        if (!composer) {
          devLog("ERROR", "Could not locate Twitter reply composer in DOM");
          console.warn("EchoX: Could not find Twitter reply composer");
          return false;
        }
        let parent = composer.parentElement;
        while (parent && parent !== document.body) {
          if (parent.style.display === "none") {
            parent.style.display = "";
          }
          parent = parent.parentElement;
        }
        composer.style.display = "";
        composer.scrollIntoView({ behavior: "smooth", block: "nearest" });
        composer.focus();
        await new Promise((r) => setTimeout(r, 60));
        document.execCommand("selectAll", false, null);
        let pasteWorked = false;
        try {
          const dt = new DataTransfer();
          dt.setData("text/plain", text);
          const pasteEvent = new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true
          });
          composer.dispatchEvent(pasteEvent);
          await new Promise((r) => setTimeout(r, 80));
          if (composer.textContent && composer.textContent.includes(text.slice(0, 15))) {
            pasteWorked = true;
          }
        } catch (e) {
          devLog("INJECTOR", "Clipboard paste dispatch error", e);
        }
        if (!pasteWorked) {
          devLog("INJECTOR", "Paste did not commit text, using insertText fallback...");
          document.execCommand("selectAll", false, null);
          document.execCommand("insertText", false, text);
          await new Promise((r) => setTimeout(r, 50));
        }
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(composer);
          range.collapse(false);
          selection?.removeAllRanges();
          selection?.addRange(range);
        } catch {
        }
        const placeholder = composer.closest('[data-testid="tweetTextarea_0_label"]')?.querySelector(
          ".public-DraftEditorPlaceholder-root"
        ) || document.querySelector(".public-DraftEditorPlaceholder-root");
        if (placeholder && composer.textContent?.trim().length) {
          placeholder.style.display = "none";
        }
        composer.dispatchEvent(new Event("input", { bubbles: true }));
        composer.dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(() => {
          const replySubmitBtn = document.querySelector(
            'button[data-testid="tweetButtonInline"], button[data-testid="tweetButton"]'
          );
          if (replySubmitBtn) {
            replySubmitBtn.removeAttribute("disabled");
            replySubmitBtn.setAttribute("aria-disabled", "false");
          }
        }, 50);
        devLog("INJECTOR", `\u2714 Text cleanly inserted into X composer with preview visible!`);
        return true;
      } catch (err) {
        devLog("ERROR", `Failed to inject reply: ${err}`);
        console.error("EchoX: Failed to inject reply:", err);
        return false;
      }
    }
    static findComposer(tweetEl) {
      const modalBox = document.querySelector(
        'div[role="dialog"] div[data-testid="tweetTextarea_0"], div[role="dialog"] div[role="textbox"][contenteditable="true"]'
      );
      if (modalBox) return modalBox;
      if (tweetEl) {
        const inlineBox = tweetEl.querySelector(
          'div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'
        );
        if (inlineBox) return inlineBox;
      }
      const globalBox = document.querySelector(
        'div[data-testid="tweetTextarea_0"], div[role="textbox"][contenteditable="true"]'
      );
      return globalBox;
    }
    static async waitForComposer(timeoutMs) {
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
  };

  // src/content/editTracker.ts
  var EditTracker = class {
    static activeTracking = null;
    static clickHandler = null;
    static keyHandler = null;
    static trackPendingReply(tweetId, originalText, tweetSnippet) {
      this.activeTracking = { tweetId, originalText };
      devLog("MEMORY", `Tracking edits for reply on tweet #${tweetId}: "${originalText}"`);
      chrome.runtime.sendMessage({
        type: "REGISTER_PENDING_REPLY",
        tweetId,
        originalText,
        tweetSnippet
      });
      this.attachSendListeners();
    }
    static attachSendListeners() {
      this.cleanupListeners();
      const checkSubmit = () => {
        if (!this.activeTracking) return;
        const composer = ComposerInjector.findComposer();
        const finalText = composer?.textContent?.trim() || "";
        if (finalText && finalText !== this.activeTracking.originalText) {
          devLog("MEMORY", `\u{1F4A1} User edited reply before sending! Learning style refinement:`, {
            original: this.activeTracking.originalText,
            edited: finalText
          });
          chrome.runtime.sendMessage({
            type: "RECORD_REPLY_EDIT",
            tweetId: this.activeTracking.tweetId,
            finalText
          });
        } else {
          devLog("MEMORY", `User sent reply unchanged (100% matched suggestion).`);
        }
        this.activeTracking = null;
        this.cleanupListeners();
      };
      this.clickHandler = (e) => {
        const target = e.target;
        const sendBtn = target.closest(
          'button[data-testid="tweetButton"], button[data-testid="tweetButtonInline"]'
        );
        if (sendBtn) {
          checkSubmit();
        }
      };
      this.keyHandler = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          checkSubmit();
        }
      };
      document.addEventListener("click", this.clickHandler, true);
      document.addEventListener("keydown", this.keyHandler, true);
    }
    static cleanupListeners() {
      if (this.clickHandler) {
        document.removeEventListener("click", this.clickHandler, true);
        this.clickHandler = null;
      }
      if (this.keyHandler) {
        document.removeEventListener("keydown", this.keyHandler, true);
        this.keyHandler = null;
      }
    }
  };

  // src/content/replyWidget.ts
  var ReplyWidget = class {
    static injectButton(tweetEl) {
      if (tweetEl.querySelector(".echox-action-btn")) return;
      const actionGroup = tweetEl.querySelector('div[role="group"]');
      if (!actionGroup) return;
      const btnWrapper = document.createElement("div");
      btnWrapper.className = "echox-action-btn-wrapper";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "echox-action-btn";
      btn.setAttribute("aria-label", "EchoX - Reply As Me");
      btn.title = "Reply in your authentic voice (EchoX)";
      btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        <path d="M12 2L14.4 7.6L20 10L14.4 12.4L12 18L9.6 12.4L4 10L9.6 7.6L12 2Z"/>
        <path d="M19 15L20.2 17.8L23 19L20.2 20.2L19 23L17.8 20.2L15 19L17.8 17.8L19 15Z"/>
      </svg>
      <span class="echox-btn-text">AI Reply</span>
    `;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.toggleReplyPopover(tweetEl, btnWrapper);
      });
      btnWrapper.appendChild(btn);
      const replyBtn = actionGroup.querySelector('button[data-testid="reply"], div[data-testid="reply"]');
      if (replyBtn) {
        const parentContainer = replyBtn.closest("div.css-175oi2r") || replyBtn;
        parentContainer.insertAdjacentElement("afterend", btnWrapper);
      } else {
        actionGroup.insertBefore(btnWrapper, actionGroup.firstChild);
      }
    }
    static async toggleReplyPopover(tweetEl, _triggerEl) {
      const existing = tweetEl.querySelector(".echox-popover");
      if (existing) {
        existing.remove();
        return;
      }
      const popover = document.createElement("div");
      popover.className = "echox-popover";
      popover.innerHTML = `
      <div class="echox-popover-header">
        <div class="echox-title">
          <span class="echox-sparkle">\u2728</span>
          <span>EchoX Voice Studio</span>
          <span class="echox-model-tag">Gemini 3.5</span>
          <span class="echox-demo-badge" style="display: none;">Demo Mode</span>
        </div>
        <button class="echox-close-btn" aria-label="Close">\u2715</button>
      </div>
      <div class="echox-status">
        <div class="echox-spinner"></div>
        <span>Gathering post context...</span>
      </div>
      <div class="echox-candidates" style="display: none;"></div>
      <div class="echox-error" style="display: none;"></div>
    `;
      popover.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      const actionGroup = tweetEl.querySelector('div[role="group"]');
      if (actionGroup && actionGroup.parentElement) {
        actionGroup.insertAdjacentElement("afterend", popover);
      } else {
        tweetEl.appendChild(popover);
      }
      popover.querySelector(".echox-close-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        popover.remove();
      });
      const statusEl = popover.querySelector(".echox-status");
      const candidatesEl = popover.querySelector(".echox-candidates");
      const errorEl = popover.querySelector(".echox-error");
      const demoBadge = popover.querySelector(".echox-demo-badge");
      try {
        const settingsRes = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
        const settings = settingsRes?.settings || {};
        if (!settings.geminiApiKey) {
          demoBadge.style.display = "inline-block";
          demoBadge.title = "Add your Gemini API Key in the extension popup to enable personalized AI generation.";
        }
        statusEl.querySelector("span").textContent = settings.smartGrokEnabled ? "Extracting context with Grok..." : "Analyzing tweet context...";
        const context = await ContextExtractor.extractSmartContext(
          tweetEl,
          !!settings.smartGrokEnabled,
          settings.autoCloseGrokDrawer ?? true
        );
        devLog("UI", `Clicked [Reply As Me] on post by @${context.handle}: "${context.text.slice(0, 50)}..."`);
        statusEl.querySelector("span").textContent = "Generating replies in your voice...";
        devLog("LLM", `Requesting 3 stance options (model: ${settings.model || "auto"})...`);
        const response = await chrome.runtime.sendMessage({
          type: "GENERATE_REPLIES",
          context
        });
        if (!response.success) {
          devLog("ERROR", `Generation failed: ${response.error}`);
          throw new Error(response.error || "Failed to generate replies");
        }
        devLog("LLM", `Received ${response.candidates?.length} candidates from Gemini:`, response.candidates);
        statusEl.style.display = "none";
        candidatesEl.style.display = "flex";
        this.renderCandidates(candidatesEl, response.candidates, tweetEl, context.text, popover);
      } catch (err) {
        statusEl.style.display = "none";
        errorEl.style.display = "block";
        errorEl.textContent = err.message || "Something went wrong.";
      }
    }
    static renderCandidates(container, candidates, tweetEl, tweetText, popover) {
      container.innerHTML = "";
      candidates.forEach((cand) => {
        const card = document.createElement("div");
        card.className = `echox-candidate-card echox-stance-${cand.stance}`;
        card.title = "Click to insert into reply composer";
        card.innerHTML = `
        <div class="echox-candidate-meta">
          <span class="echox-stance-tag echox-tag-${cand.stance}">${cand.emoji} ${cand.label}</span>
          <span class="echox-char-count">${cand.text.length} chars</span>
        </div>
        <div class="echox-candidate-text">${cand.text}</div>
        <div class="echox-candidate-actions">
          <button class="echox-copy-btn" title="Copy reply to clipboard">\u{1F4CB} Copy</button>
          <button class="echox-insert-btn">Insert Reply \u21B5</button>
        </div>
      `;
        const copyBtn = card.querySelector(".echox-copy-btn");
        copyBtn?.addEventListener("click", async (e) => {
          e.stopPropagation();
          devLog("UI", `Copied reply text: "${cand.text}"`);
          try {
            await navigator.clipboard.writeText(cand.text);
            const orig = copyBtn.textContent;
            copyBtn.textContent = "\u2713 Copied";
            setTimeout(() => {
              copyBtn.textContent = orig;
            }, 1500);
          } catch {
            const textarea = document.createElement("textarea");
            textarea.value = cand.text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
            copyBtn.textContent = "\u2713 Copied";
            setTimeout(() => {
              copyBtn.textContent = "\u{1F4CB} Copy";
            }, 1500);
          }
        });
        let hasInserted = false;
        const doInsert = async (e) => {
          if (e.target.closest(".echox-copy-btn")) return;
          e.stopPropagation();
          e.preventDefault();
          if (hasInserted) return;
          hasInserted = true;
          document.querySelectorAll(".echox-popover").forEach((p) => p.remove());
          devLog("INJECTOR", `Selected candidate [${cand.label}]: "${cand.text}"`);
          const success = await ComposerInjector.injectReply(tweetEl, cand.text);
          if (success) {
            const tweetId = ContextExtractor.extractDirectContext(tweetEl).id;
            EditTracker.trackPendingReply(tweetId, cand.text, tweetText);
          }
        };
        card.addEventListener("click", doInsert);
        container.appendChild(card);
      });
    }
  };

  // src/content/styleSync.ts
  var StyleSync = class {
    /**
     * Scrapes replies from the current profile page
     */
    static harvestProfileReplies() {
      const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');
      const replies = [];
      tweetElements.forEach((el) => {
        const textEl = el.querySelector('[data-testid="tweetText"]');
        if (!textEl) return;
        const raw = textEl.textContent?.trim() || "";
        if (raw.length > 5 && !raw.startsWith("http")) {
          const cleaned = raw.replace(/^(@\w+\s*)+/, "").trim();
          if (cleaned.length > 5 && !replies.includes(cleaned)) {
            replies.push(cleaned);
          }
        }
      });
      return replies;
    }
  };

  // src/content/index.ts
  function initObserver() {
    let debounceTimer = null;
    const scanAndInject = () => {
      const tweets = document.querySelectorAll('article[data-testid="tweet"]');
      tweets.forEach((tweet) => {
        ReplyWidget.injectButton(tweet);
      });
    };
    scanAndInject();
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
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "HARVEST_PROFILE_REPLIES") {
      const replies = StyleSync.harvestProfileReplies();
      sendResponse({ success: true, replies });
    }
    return true;
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initObserver);
  } else {
    initObserver();
  }
})();
