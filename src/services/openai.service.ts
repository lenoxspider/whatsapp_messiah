import OpenAI from 'openai';
import { env } from '../config/env.js';

class OpenAIService {
  private client: OpenAI | null = null;

  constructor() {
    if (env.openaiApiKey) {
      this.client = new OpenAI({ apiKey: env.openaiApiKey });
    }
  }

  private getClient(): OpenAI {
    if (!this.client) {
      if (!env.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is not set in environment.');
      }
      this.client = new OpenAI({ apiKey: env.openaiApiKey });
    }
    return this.client;
  }

  async generateChatReply(
    systemPrompt: string,
    userMessage: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<string> {
    const client = this.getClient();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content } as OpenAI.Chat.ChatCompletionMessageParam)),
      { role: 'user', content: userMessage }
    ];

    const response = await client.chat.completions.create({
      model: env.openaiModel,
      messages,
      temperature: 0.7,
      max_tokens: 300
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  async askSecondBrain(query: string, contextualNotes: string = ''): Promise<string> {
    const client = this.getClient();

    const systemPrompt = `You are the user's personal Second Brain AI assistant running inside their WhatsApp.
Be concise, direct, helpful, and formatted for mobile reading.
${contextualNotes ? `Relevant notes/memories from the user's personal archive:\n${contextualNotes}` : ''}`;

    const response = await client.chat.completions.create({
      model: env.openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      temperature: 0.5,
      max_tokens: 600
    });

    return response.choices[0]?.message?.content?.trim() || 'No response generated.';
  }
}

export const openaiService = new OpenAIService();
