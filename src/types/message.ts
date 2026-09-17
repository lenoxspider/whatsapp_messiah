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
  media_path?: string | null;
  media_mimetype?: string | null;
  is_view_once?: number;
}

export interface CallRecord {
  id: string;
  caller_jid: string;
  is_video: number;
  timestamp: number;
  action_taken: string;
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
  mediaPath?: string | null;
  mediaMimeType?: string | null;
  isViewOnce?: boolean;
}
