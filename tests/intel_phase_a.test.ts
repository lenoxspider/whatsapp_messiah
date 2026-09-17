import { describe, it } from 'node:test';
import assert from 'node:assert';
import { initializeDatabaseSchema } from '../src/db/schema.js';
import { messageEditRepo } from '../src/db/repositories/message_edit.repo.js';
import { messageRepo } from '../src/db/repositories/message.repo.js';
import { identityService } from '../src/services/identity.service.js';

describe('Intel Layer Phase A Verification', () => {
  it('should record and retrieve message edits with diffs', () => {
    initializeDatabaseSchema();

    const testMsgId = `edit_test_${Date.now()}`;
    const chatJid = '233501234567@s.whatsapp.net';
    const senderJid = '233501234567@s.whatsapp.net';

    // Insert edit record
    const id = messageEditRepo.recordEdit({
      messageId: testMsgId,
      chatJid,
      senderJid,
      originalContent: "I'll pay you 500 tomorrow",
      editedContent: "I'll pay you 200 next week",
      timestamp: Date.now()
    });

    assert.ok(id > 0, 'Edit record ID should be positive');

    const edits = messageEditRepo.getEditsForMessage(testMsgId);
    assert.strictEqual(edits.length, 1);
    assert.strictEqual(edits[0].original_content, "I'll pay you 500 tomorrow");
    assert.strictEqual(edits[0].edited_content, "I'll pay you 200 next week");
  });

  it('should check prior message history for anomaly radar', () => {
    initializeDatabaseSchema();

    const uniqueUnknownJid = `unknown_${Date.now()}@s.whatsapp.net`;
    // Should be false before any message
    assert.strictEqual(messageRepo.hasPriorMessages(uniqueUnknownJid), false);

    // Save a message from this sender
    messageRepo.saveMessage({
      id: `msg_${Date.now()}`,
      chatJid: uniqueUnknownJid,
      senderJid: uniqueUnknownJid,
      fromMe: false,
      messageType: 'conversation',
      content: 'Hello stranger',
      rawPayload: {},
      timestamp: Date.now()
    });

    // Now hasPriorMessages should return true
    assert.strictEqual(messageRepo.hasPriorMessages(uniqueUnknownJid), true);

    const stats = messageRepo.getMessageStats(uniqueUnknownJid);
    assert.strictEqual(stats.totalCount, 1);
    assert.ok(stats.firstSeen !== null);
  });

  it('should format an identity profile card correctly', () => {
    const mockProfile = {
      jid: '233501112233@s.whatsapp.net',
      phone: '233501112233',
      pushName: 'Kwame Tech',
      savedName: 'Kwame Mensah',
      tier: 2,
      totalMessages: 42,
      firstSeen: Date.now() - (30 * 24 * 60 * 60 * 1000),
      lastSeen: Date.now(),
      sharedGroups: [
        {
          id: '123456@g.us',
          subject: 'Accra Tech Founders',
          memberCount: 156,
          isAdmin: true
        }
      ]
    };

    const card = identityService.formatIdentityCard(mockProfile);
    assert.ok(card.includes('Kwame Mensah'), 'Card must include display name');
    assert.ok(card.includes('+233501112233'), 'Card must include phone number');
    assert.ok(card.includes('Tier 2'), 'Card must include tier');
    assert.ok(card.includes('Accra Tech Founders'), 'Card must include shared group');
    assert.ok(card.includes('Admin'), 'Card must reflect admin status');
  });
});
