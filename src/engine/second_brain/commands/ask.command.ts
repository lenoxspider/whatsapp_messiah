import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { openaiService } from '../../../services/openai.service.js';
import { noteRepo } from '../../../db/repositories/note.repo.js';

export const askCommand: CommandHandler = {
  name: 'ask',
  description: 'Ask OpenAI a question with relevant context from your saved notes',
  usage: '!ask <question>',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const query = fullArgs.trim();
    if (!query) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage: `!ask <your question>`'
      });
      return;
    }

    // Try finding relevant notes to enrich context
    const relatedNotes = noteRepo.searchNotes(query, 3);
    const contextText = relatedNotes
      .map((n, i) => `[Note ${i + 1}] (${n.tag}): ${n.content}`)
      .join('\n');

    try {
      const reply = await openaiService.askSecondBrain(query, contextText);
      await sock.sendMessage(message.chatJid, { text: reply });
    } catch (err: any) {
      await sock.sendMessage(message.chatJid, {
        text: `❌ OpenAI Error: ${err.message || 'Failed to generate response'}`
      });
    }
  }
};
