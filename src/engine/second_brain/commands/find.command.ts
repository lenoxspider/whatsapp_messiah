import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { noteRepo } from '../../../db/repositories/note.repo.js';
import { openaiService } from '../../../services/openai.service.js';

export const findCommand: CommandHandler = {
  name: 'find',
  description: 'Hybrid semantic + keyword search over your saved notes and vault captures',
  usage: '!find <query>',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const query = fullArgs.trim();
    if (!query) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage: `!find <keyword or concept>`'
      });
      return;
    }

    let queryVector: Float32Array | null = null;
    if (openaiService.isConfigured()) {
      queryVector = await openaiService.createEmbedding(query);
    }

    const results = noteRepo.searchHybrid(query, 5, queryVector);

    if (results.length === 0) {
      await sock.sendMessage(message.chatJid, {
        text: `🔍 No notes found matching: "*${query}*"`
      });
      return;
    }

    let response = `🔍 *Search Results for "${query}":*\n\n`;
    results.forEach((note, index) => {
      const date = new Date(note.created_at).toLocaleDateString();
      response += `*${index + 1}.* \`#${note.tag}\` _(${date})_\n${note.content}\n\n`;
    });

    await sock.sendMessage(message.chatJid, { text: response.trim() });
  }
};
