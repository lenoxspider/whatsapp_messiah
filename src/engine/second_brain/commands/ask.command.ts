import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { openaiService } from '../../../services/openai.service.js';
import { noteRepo } from '../../../db/repositories/note.repo.js';
import { reminderRepo } from '../../../db/repositories/reminder.repo.js';
import { contactRepo } from '../../../db/repositories/contact.repo.js';
import { messageRepo } from '../../../db/repositories/message.repo.js';

export const askCommand: CommandHandler = {
  name: 'ask',
  description: 'Autonomous Second Brain AI Agent with direct tool-calling over private SQLite',
  usage: '!ask <question or instruction>',

  async execute({ sock, message, fullArgs }: CommandContext): Promise<void> {
    // 1. Strict Security Guard: Only the Owner can execute tool-calling agents
    if (!message.fromMe) {
      console.warn(`[Security Alert] Unauthorized attempt to invoke !ask from non-owner: ${message.senderJid}`);
      return;
    }

    const query = fullArgs.trim();
    if (!query) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage: `!ask <your question or instruction>`\n\n_Examples:_\n• `!ask What did I decide about the VPS?`\n• `!ask Remind me Friday at 2pm to follow up with Kofi`\n• `!ask What deleted messages do we have from John?`\n• `!ask Set contact +233501234567 to Tier 1 VIP`'
      });
      return;
    }

    if (!openaiService.isConfigured()) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ *OpenAI Key Missing*\n\nPlease set your `OPENAI_API_KEY` in `.env` or via your Web Operations Console (`/config`).'
      });
      return;
    }

    // 2. Tool Executor mapping agent function calls directly to SQLite repositories
    const toolExecutor = async (name: string, args: any): Promise<any> => {
      console.log(`[Agent Tool Call] name="${name}" args=${JSON.stringify(args)}`);

      switch (name) {
        case 'search_vault': {
          const limit = Math.min(Number(args.limit) || 5, 10);
          const q = String(args.query || '');
          let queryVector: Float32Array | null = null;
          if (openaiService.isConfigured()) {
            queryVector = await openaiService.createEmbedding(q);
          }
          const notes = noteRepo.searchHybrid(q, limit, queryVector);
          return notes.map(n => ({
            id: n.id,
            tag: n.tag,
            content: n.content,
            created_at: new Date(n.created_at).toISOString()
          }));
        }

        case 'create_note': {
          const content = String(args.content || '').trim();
          if (!content) throw new Error('Content is required');
          const tag = String(args.tag || 'inbox').trim().replace(/^#/, '');
          const saved = noteRepo.saveNote(content, tag);
          if (openaiService.isConfigured()) {
            openaiService.createEmbedding(content).then(emb => {
              if (emb) noteRepo.updateEmbedding(saved.id, emb);
            }).catch(() => {});
          }
          return { id: saved.id, tag: saved.tag, content: saved.content, status: 'saved' };
        }

        case 'set_reminder': {
          const task = String(args.task || '').trim();
          if (!task) throw new Error('Task description is required');
          const timeMs = Date.parse(args.trigger_at_iso);
          if (isNaN(timeMs)) throw new Error(`Invalid trigger_at_iso date format: "${args.trigger_at_iso}"`);
          const r = reminderRepo.createReminder(task, timeMs);
          return {
            id: r.id,
            task: r.task,
            trigger_at: new Date(r.trigger_at).toISOString(),
            status: 'scheduled'
          };
        }

        case 'list_reminders': {
          const limit = Math.min(Number(args.limit) || 10, 25);
          const reminders = reminderRepo.getPendingReminders().slice(0, limit);
          return reminders.map(r => ({
            id: r.id,
            task: r.task,
            trigger_at: new Date(r.trigger_at).toISOString(),
            status: r.status
          }));
        }

        case 'get_contact': {
          const q = String(args.query || '').trim();
          const contact = contactRepo.searchContact(q);
          if (!contact) {
            return { found: false, message: `No contact found matching "${q}"` };
          }
          return {
            found: true,
            jid: contact.jid,
            phone: contact.phone,
            name: contact.name,
            tier: contact.tier,
            last_interaction: contact.last_interaction ? new Date(contact.last_interaction).toISOString() : null
          };
        }

        case 'list_contacts': {
          const limit = Math.min(Number(args.limit) || 20, 50);
          const tier = args.tier ? Number(args.tier) : undefined;
          const totalCount = contactRepo.getContactCount();
          const contacts = contactRepo.listContacts(limit, tier);
          return {
            total_synced_contacts: totalCount,
            returned_count: contacts.length,
            contacts: contacts.map(c => ({
              name: c.name || `+${c.phone}`,
              phone: `+${c.phone}`,
              tier: c.tier,
              autopilot_enabled: c.autopilot_enabled === 1,
              last_interaction: c.last_interaction ? new Date(c.last_interaction).toISOString() : null
            }))
          };
        }

        case 'set_tier': {
          const phone = String(args.phone || '').trim();
          const tier = Number(args.tier);
          if (!phone || isNaN(tier) || tier < 1 || tier > 5) {
            throw new Error('Valid phone and tier (1-5) required');
          }
          let contact = contactRepo.searchContact(phone);
          if (!contact) {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const jid = `${cleanPhone}@s.whatsapp.net`;
            contact = contactRepo.upsertContact(jid, cleanPhone, null, tier as any);
          } else {
            contactRepo.setContactTier(contact.jid, tier as any);
          }
          return {
            success: true,
            contact_jid: contact.jid,
            name: contact.name,
            tier
          };
        }

        case 'search_revoked': {
          const limit = Math.min(Number(args.limit) || 5, 10);
          const revoked = messageRepo.searchRevoked(args.query ? String(args.query) : undefined, limit);
          return revoked.map(m => ({
            id: m.id,
            sender: m.contact_name || m.sender_jid,
            content: m.content || (m.is_view_once ? '[View-Once Media]' : '[Media]'),
            timestamp: new Date(m.timestamp).toISOString(),
            is_view_once: Boolean(m.is_view_once),
            has_media: Boolean(m.media_path)
          }));
        }

        default:
          throw new Error(`Unknown tool "${name}"`);
      }
    };

    try {
      const responseText = await openaiService.runAgentLoop(query, toolExecutor);
      await sock.sendMessage(message.chatJid, { text: responseText });
    } catch (err: any) {
      console.error(`[Agent Execution Error]:`, err);
      await sock.sendMessage(message.chatJid, {
        text: `❌ *Agent Error*: ${err.message || 'Failed to process request.'}`
      });
    }
  }
};

