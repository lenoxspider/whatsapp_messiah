import type { CommandHandler, CommandContext } from '../../../types/command.js';
import { agentTaskRepo } from '../../../db/repositories/agent_task.repo.js';
import { contactRepo } from '../../../db/repositories/contact.repo.js';

export const taskCommand: CommandHandler = {
  name: 'task',
  description: 'Assign or schedule a goal/task to the WhatsApp Agent (!task <contact> [in Xm/h] <goal>)',
  usage: '!task <contact> [in <delay>] <goal> | !tasks | !task cancel <id> | !task done <id>',

  async execute({ sock, message, args, fullArgs }: CommandContext): Promise<void> {
    const sub = args[0]?.toLowerCase();

    // 1. List tasks: !task list OR !tasks
    if (!sub || sub === 'list') {
      const tasks = agentTaskRepo.listTasks('all', 15);
      if (tasks.length === 0) {
        await sock.sendMessage(message.chatJid, {
          text: '📋 *No Agent Tasks Found*\n\nAssign one with:\n`!task <contact> Ask if the project files are ready`'
        });
        return;
      }

      let text = `📋 *WhatsApp Agent Task Manifest (${tasks.length})*\n\n`;
      for (const t of tasks) {
        const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : t.status === 'pending' ? '⏳' : '❌';
        const contactLabel = t.contact_name || t.contact_phone || t.contact_jid.split('@')[0];
        const schedTime = new Date(t.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        text += `${icon} *[#${t.id}] ${contactLabel}* (${t.status.toUpperCase()})\n`;
        text += `   🎯 Goal: "${t.goal}"\n`;
        if (t.summary) {
          text += `   📝 Intel: ${t.summary}\n`;
        } else {
          text += `   ⏰ Scheduled: ${schedTime}\n`;
        }
        text += '\n';
      }

      text += `_Commands:_\n• \`!task cancel <id>\`\n• \`!task done <id>\``;
      await sock.sendMessage(message.chatJid, { text: text.trim() });
      return;
    }

    // 2. Cancel task
    if (sub === 'cancel') {
      const id = parseInt(args[1], 10);
      if (!id) {
        await sock.sendMessage(message.chatJid, { text: '⚠️ Please provide a valid task ID: `!task cancel <id>`' });
        return;
      }
      agentTaskRepo.updateTaskStatus(id, 'cancelled', 'Cancelled by owner');
      await sock.sendMessage(message.chatJid, { text: `❌ Agent task #${id} cancelled.` });
      return;
    }

    // 3. Mark task as done
    if (sub === 'done' || sub === 'complete') {
      const id = parseInt(args[1], 10);
      if (!id) {
        await sock.sendMessage(message.chatJid, { text: '⚠️ Please provide a valid task ID: `!task done <id>`' });
        return;
      }
      agentTaskRepo.updateTaskStatus(id, 'completed', 'Manually marked done by owner');
      await sock.sendMessage(message.chatJid, { text: `✅ Agent task #${id} marked as completed.` });
      return;
    }

    // 4. Create new task:
    // Formats:
    // !task <contact> in 20m <goal>
    // !task <contact> <goal>
    const rest = fullArgs.trim();

    // Check for "in <number>(m|h|d)" inside the input
    const timeMatch = rest.match(/^(.*?)\s+in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\s+(.+)$/i);

    let targetQuery = '';
    let goal = '';
    let scheduledAt = Date.now();

    if (timeMatch) {
      targetQuery = timeMatch[1].trim();
      const value = parseInt(timeMatch[2], 10);
      const unit = timeMatch[3].toLowerCase();
      goal = timeMatch[4].trim();

      let multiplier = 60 * 1000;
      if (unit.startsWith('h')) multiplier = 60 * 60 * 1000;
      if (unit.startsWith('d')) multiplier = 24 * 60 * 60 * 1000;

      scheduledAt = Date.now() + (value * multiplier);
    } else {
      // Direct task: first word is contact, remainder is goal
      targetQuery = args[0];
      goal = args.slice(1).join(' ').trim();
    }

    if (!targetQuery || !goal) {
      await sock.sendMessage(message.chatJid, {
        text: '⚠️ Usage:\n• `!task Alex Ask if he has sent the invoice`\n• `!task Alex in 2h Check if he is free for a call`'
      });
      return;
    }

    const contact = contactRepo.searchContact(targetQuery);
    if (!contact) {
      await sock.sendMessage(message.chatJid, {
        text: `❌ Could not find contact matching: "${targetQuery}". Please verify name or phone number.`
      });
      return;
    }

    const task = agentTaskRepo.createTask(contact.jid, goal, scheduledAt);
    const targetTimeStr = new Date(scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isImmediate = scheduledAt <= Date.now() + 5000;

    await sock.sendMessage(message.chatJid, {
      text: `🤖 *Agent Task Delegated [#${task.id}]*\n\n` +
            `• Contact: *${contact.name || contact.phone}* (+${contact.phone})\n` +
            `• Goal: "${goal}"\n` +
            `• Timing: *${isImmediate ? 'Immediate Execution' : `Scheduled for ${targetTimeStr}`}*\n\n` +
            `The agent will reach out in character, guide the conversation toward this outcome, and alert you on Discord once completed!`
    });
  }
};
