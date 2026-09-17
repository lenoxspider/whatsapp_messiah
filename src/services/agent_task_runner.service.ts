import type { WASocket } from '@whiskeysockets/baileys';
import { agentTaskRepo, type AgentTask } from '../db/repositories/agent_task.repo.js';
import { contactRepo } from '../db/repositories/contact.repo.js';
import { messageRepo } from '../db/repositories/message.repo.js';
import { openaiService } from './openai.service.js';
import { presenceSimulator } from '../engine/messiah/presence.js';
import { discordService } from './discord.service.js';
import { systemLogger } from '../server/logger.js';

export class AgentTaskRunner {
  private isProcessing = false;

  async processDueTasks(sock: WASocket): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const dueTasks = agentTaskRepo.getDueTasks();
      if (dueTasks.length === 0) return;

      for (const task of dueTasks) {
        await this.executeProactiveTask(sock, task);
      }
    } catch (err: any) {
      systemLogger.error('AgentRunner', `Error running due tasks: ${err.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeProactiveTask(sock: WASocket, task: AgentTask): Promise<void> {
    const contact = contactRepo.getContact(task.contact_jid);
    const contactName = contact?.name || contact?.phone || task.contact_jid.split('@')[0];
    const contactPhone = contact?.phone || task.contact_jid.split('@')[0];

    systemLogger.info('AgentRunner', `Executing proactive task #${task.id} for ${contactName}: "${task.goal}"`);

    if (!openaiService.isConfigured()) {
      systemLogger.warn('AgentRunner', `OpenAI not configured, cannot generate proactive message for task #${task.id}`);
      return;
    }

    try {
      const history = messageRepo.getRecentChatHistory(task.contact_jid, 6);
      const formattedHistory = history
        .map(m => `${m.from_me ? 'Me' : contactName}: ${m.content || '[Media]'}`)
        .join('\n');

      const systemPrompt = `You are an elite personal ghost assistant managing WhatsApp for the owner.
Your mission is to initiate a conversation with ${contactName} to begin accomplishing this assigned goal:
GOAL: "${task.goal}"

Recent conversation context:
${formattedHistory || 'No prior messages.'}

RULES:
1. Write a natural, human, authentic outreach message to start addressing this goal.
2. Match casual WhatsApp text styling (short, natural tone, lowercase or abbreviations if natural, no corporate fluff, no "I hope this finds you well").
3. DO NOT reveal you are an AI or bot. Speak as the owner.
4. Output ONLY the plain text of the message to send.`;

      const reachOutText = await openaiService.generateChatReply(
        systemPrompt,
        `Start reaching out to ${contactName} to work on: "${task.goal}"`,
        []
      );

      if (!reachOutText) {
        systemLogger.warn('AgentRunner', `Failed to generate message for task #${task.id}`);
        return;
      }

      // Simulate typing latency and send
      await presenceSimulator.simulateTypingAndSend(sock, task.contact_jid, reachOutText, reachOutText.length);

      // Save to database as sent message
      messageRepo.saveMessage({
        id: `agent_${Date.now()}`,
        chatJid: task.contact_jid,
        senderJid: task.contact_jid,
        fromMe: true,
        messageType: 'conversation',
        content: reachOutText,
        rawPayload: { key: { remoteJid: task.contact_jid, fromMe: true } },
        timestamp: Date.now()
      });

      // Advance task status to in_progress
      agentTaskRepo.updateTaskStatus(task.id, 'in_progress', `Initiated outreach: "${reachOutText}"`);

      // Alert owner via Discord
      await discordService.sendAgentTaskAlert({
        type: 'started',
        contactPhone,
        contactName,
        goal: task.goal,
        messageText: reachOutText
      });

      systemLogger.success('AgentRunner', `Proactive task #${task.id} initiated with ${contactName}`);
    } catch (err: any) {
      systemLogger.error('AgentRunner', `Failed task #${task.id} execution: ${err.message}`);
    }
  }
}

export const agentTaskRunner = new AgentTaskRunner();
