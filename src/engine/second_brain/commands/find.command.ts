import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { noteRepo } from '../../../db/repositories/note.repo.js';

export const findCommand: CommandHandler = {
  name: 'find',
  description: 'Search through your saved notes and captures using full-text search',
  usage: '!find <query>',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    const query = fullArgs.trim();
    if (!query) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage: `!find <keyword or phrase>`'
      });
      return;
    }

    const results = noteRepo.searchNotes(query, 5);

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
