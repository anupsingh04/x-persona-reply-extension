import { getSettings, saveSettings, updatePersona } from '../services/storage';
import { LLMService } from '../services/llmService';
import { adaptiveMemoryService } from '../services/adaptiveMemory';
import { TweetContext, StanceType } from '../types';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handleMessage = async () => {
    try {
      const settings = await getSettings();

      if (message.type === 'GENERATE_REPLIES') {
        const { context } = message as { context: TweetContext; stance?: StanceType };
        const llm = new LLMService({
          apiKey: settings.geminiApiKey,
          model: settings.model
        });

        const candidates = await llm.generateReplies(
          context,
          settings.persona,
          settings.adaptiveMemory || []
        );

        return { success: true, candidates };
      }

      if (message.type === 'ANALYZE_PROFILE_REPLIES') {
        const { replies, handle } = message as { replies: string[]; handle: string };
        const llm = new LLMService({
          apiKey: settings.geminiApiKey,
          model: settings.model
        });

        const persona = await llm.extractPersonaFromReplies(replies, handle);
        await updatePersona(persona);
        return { success: true, persona };
      }

      if (message.type === 'REGISTER_PENDING_REPLY') {
        const { tweetId, originalText, tweetSnippet } = message;
        adaptiveMemoryService.registerPendingReply(tweetId, originalText, tweetSnippet);
        return { success: true };
      }

      if (message.type === 'RECORD_REPLY_EDIT') {
        const { tweetId, finalText } = message;
        const entry = await adaptiveMemoryService.recordSentReply(tweetId, finalText);
        return { success: true, entry };
      }

      if (message.type === 'GET_SETTINGS') {
        return { success: true, settings };
      }

      if (message.type === 'SAVE_SETTINGS') {
        const updated = await saveSettings(message.settings);
        return { success: true, settings: updated };
      }

      return { success: false, error: 'Unknown message type' };
    } catch (err: any) {
      console.error('Service Worker Error:', err);
      return { success: false, error: err.message || String(err) };
    }
  };

  handleMessage().then(sendResponse);
  return true; // Keep message channel open for async response
});
