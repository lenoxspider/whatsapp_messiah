export interface StoredMessage {
  id: string;
  chat_jid: string;
  sender_jid: string;
  from_me: number; // 0 or 1
  message_type: string;
  content: string | null;
  raw_payload_json: string;
  timestamp: number;
  is_revoked: number; // 0 or 1
  revoked_at: number | null;
}

export interface IncomingMessageContext {
  id: string;
  chatJid: string;
  senderJid: string;
  senderPhone: string;
  fromMe: boolean;
  isGroup: boolean;
  messageType: string;
  text: string;
  timestamp: number;
  raw: any;
}
