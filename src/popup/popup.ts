import { AppSettings, PersonaProfile } from '../types';

let currentSettings: AppSettings | null = null;

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await loadSettingsAndPersona();
  bindActions();
});

function initTabs() {
  const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = `tab-${btn.dataset.tab}`;
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  document.getElementById('go-to-sync-btn')?.addEventListener('click', () => {
    document.querySelector<HTMLButtonElement>('[data-tab="sync"]')?.click();
  });
}

async function loadSettingsAndPersona() {
  const res = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  if (res && res.settings) {
    currentSettings = res.settings;
    renderPersona(currentSettings?.persona);
    renderSettings(currentSettings);
  }
}

function renderPersona(persona: PersonaProfile | null | undefined) {
  const emptyEl = document.getElementById('no-persona');
  const detailsEl = document.getElementById('persona-details');

  if (!persona) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (detailsEl) detailsEl.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (detailsEl) detailsEl.style.display = 'flex';

  document.getElementById('dna-handle')!.textContent = `@${persona.handle}`;
  document.getElementById('dna-casing')!.textContent = persona.casing;
  document.getElementById('dna-tone')!.textContent = persona.tone;
  
  const punctInfo = `${persona.punctuation.trailingPeriods ? 'Uses periods' : 'No trailing periods'} • ${persona.punctuation.emojiFrequency} emoji`;
  document.getElementById('dna-punctuation')!.textContent = punctInfo;

  const vocabCloud = document.getElementById('dna-vocab')!;
  vocabCloud.innerHTML = '';
  persona.vocabulary.forEach((word) => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = word;
    vocabCloud.appendChild(span);
  });

  const rulesInput = document.getElementById('dna-custom-rules') as HTMLTextAreaElement;
  if (rulesInput) {
    rulesInput.value = persona.customRules || '';
  }

  // Render Adaptive Memory
  const memList = document.getElementById('dna-memory-list')!;
  if (currentSettings && currentSettings.adaptiveMemory && currentSettings.adaptiveMemory.length > 0) {
    memList.innerHTML = '';
    currentSettings.adaptiveMemory.slice(0, 5).forEach((mem) => {
      const entry = document.createElement('div');
      entry.className = 'memory-entry';
      entry.innerHTML = `
        <span class="diff-from">"${mem.originalText}"</span>
        <span class="diff-to">→ "${mem.editedText}"</span>
      `;
      memList.appendChild(entry);
    });
  }
}

function renderSettings(settings: AppSettings | null) {
  if (!settings) return;

  const keyInput = document.getElementById('api-key-input') as HTMLInputElement;
  const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
  const smartGrok = document.getElementById('smart-grok-toggle') as HTMLInputElement;
  const autoClose = document.getElementById('auto-close-grok-toggle') as HTMLInputElement;

  if (keyInput) keyInput.value = settings.geminiApiKey || '';
  if (modelSelect) modelSelect.value = settings.model || 'gemini-3.8-flash';
  if (smartGrok) smartGrok.checked = settings.smartGrokEnabled ?? true;
  if (autoClose) autoClose.checked = settings.autoCloseGrokDrawer ?? true;
}

function bindActions() {
  // Save Settings
  document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
    const apiKey = (document.getElementById('api-key-input') as HTMLInputElement).value.trim();
    const model = (document.getElementById('model-select') as HTMLSelectElement).value;
    const smartGrokEnabled = (document.getElementById('smart-grok-toggle') as HTMLInputElement).checked;
    const autoCloseGrokDrawer = (document.getElementById('auto-close-grok-toggle') as HTMLInputElement).checked;

    const statusEl = document.getElementById('settings-status')!;
    statusEl.className = 'status-msg';
    statusEl.textContent = 'Saving...';

    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: {
        geminiApiKey: apiKey,
        model,
        smartGrokEnabled,
        autoCloseGrokDrawer
      }
    });

    if (res.success) {
      currentSettings = res.settings;
      statusEl.className = 'status-msg success';
      statusEl.textContent = 'Settings saved successfully!';
    } else {
      statusEl.className = 'status-msg error';
      statusEl.textContent = res.error || 'Failed to save.';
    }
  });

  // Save Custom Persona Rules
  document.getElementById('save-rules-btn')?.addEventListener('click', async () => {
    if (!currentSettings || !currentSettings.persona) return;
    const rules = (document.getElementById('dna-custom-rules') as HTMLTextAreaElement).value.trim();
    currentSettings.persona.customRules = rules;

    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: { persona: currentSettings.persona }
    });

    alert('Custom instructions updated!');
  });

  // 1-Click Profile Sync
  document.getElementById('sync-profile-btn')?.addEventListener('click', async () => {
    const handleInput = (document.getElementById('sync-handle-input') as HTMLInputElement).value.trim();
    const statusEl = document.getElementById('sync-status')!;
    statusEl.className = 'status-msg';
    statusEl.textContent = 'Scraping replies from active X tab...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error('No active browser tab found.');
      }

      const res = await chrome.tabs.sendMessage(tab.id, { type: 'HARVEST_PROFILE_REPLIES' });
      if (!res || !res.replies || res.replies.length === 0) {
        throw new Error('No replies found on active page. Make sure you are on x.com/your_handle/with_replies.');
      }

      statusEl.textContent = `Analyzing ${res.replies.length} replies with Gemini 3.8 Flash...`;

      const analysisRes = await chrome.runtime.sendMessage({
        type: 'ANALYZE_PROFILE_REPLIES',
        replies: res.replies,
        handle: handleInput || 'you'
      });

      if (!analysisRes.success) {
        throw new Error(analysisRes.error || 'Failed to analyze replies.');
      }

      statusEl.className = 'status-msg success';
      statusEl.textContent = 'Voice DNA synthesized successfully!';
      await loadSettingsAndPersona();
      document.querySelector<HTMLButtonElement>('[data-tab="persona"]')?.click();
    } catch (err: any) {
      statusEl.className = 'status-msg error';
      statusEl.textContent = err.message || 'Sync failed.';
    }
  });

  // Manual Samples Analysis
  document.getElementById('analyze-manual-btn')?.addEventListener('click', async () => {
    const text = (document.getElementById('manual-samples-input') as HTMLTextAreaElement).value.trim();
    const statusEl = document.getElementById('sync-status')!;
    if (!text) {
      alert('Please paste some sample replies first.');
      return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 3);
    statusEl.className = 'status-msg';
    statusEl.textContent = `Analyzing ${lines.length} samples with Gemini...`;

    try {
      const analysisRes = await chrome.runtime.sendMessage({
        type: 'ANALYZE_PROFILE_REPLIES',
        replies: lines,
        handle: 'you'
      });

      if (!analysisRes.success) {
        throw new Error(analysisRes.error || 'Analysis failed.');
      }

      statusEl.className = 'status-msg success';
      statusEl.textContent = 'Voice DNA generated!';
      await loadSettingsAndPersona();
      document.querySelector<HTMLButtonElement>('[data-tab="persona"]')?.click();
    } catch (err: any) {
      statusEl.className = 'status-msg error';
      statusEl.textContent = err.message || 'Analysis failed.';
    }
  });
}
