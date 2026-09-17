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

    // Retrieve matching or recent vault notes
    const relatedNotes = noteRepo.searchNotesAdvanced(query, 5);
    const notesContext = relatedNotes
      .map((n, i) => `• [${n.tag}] ${n.content} (${new Date(n.created_at).toLocaleDateString()})`)
      .join('\n');

    // Retrieve active pending reminders if query asks about tasks/schedule/reminders
    let reminderContext = '';
    const lower = query.toLowerCase();
    if (lower.includes('remind') || lower.includes('task') || lower.includes('todo') || lower.includes('schedule') || lower.includes('due') || lower.includes('today') || lower.includes('tomorrow')) {
      const db = (noteRepo as any).db;
      try {
        const pending = db.prepare("SELECT task, trigger_at FROM reminders WHERE status = 'pending' ORDER BY trigger_at ASC LIMIT 5").all();
        if (pending && pending.length > 0) {
          reminderContext = `\nActive Reminders in Queue:\n` + pending.map((r: any) => `• "${r.task}" scheduled for ${new Date(r.trigger_at).toLocaleString()}`).join('\n');
        }
      } catch {}
    }

    const fullContext = (notesContext ? `Notes Archive:\n${notesContext}` : '') + (reminderContext ? `\n${reminderContext}` : '');

    try {
      const reply = await openaiService.askSecondBrain(query, fullContext);
      await sock.sendMessage(message.chatJid, { text: reply });
    } catch (err: any) {
      await sock.sendMessage(message.chatJid, {
        text: `❌ OpenAI Error: ${err.message || 'Failed to generate response'}`
      });
    }
  }
};
