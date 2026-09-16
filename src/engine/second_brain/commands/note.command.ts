import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { noteRepo } from '../../../db/repositories/note.repo.js';

export const noteCommand: CommandHandler = {
  name: 'note',
  description: 'Save a note or thought into your personal vault',
  usage: '!note <#optional_tag> <content>',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    if (!fullArgs.trim()) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage: `!note <content>` or `!note #work Important meeting notes`'
      });
      return;
    }

    let tag = 'inbox';
    let content = fullArgs.trim();

    // Check if first word is a hashtag
    const match = content.match(/^#(\w+)\s+(.+)$/);
    if (match) {
      tag = match[1];
      content = match[2];
    }

    const saved = noteRepo.saveNote(content, tag);
    await sock.sendMessage(message.chatJid, {
      text: `📝 *Saved Note [#${saved.id}]* \`#${tag}\`\n\n"${content}"`
    });
  }
};
