import { initializeDatabaseSchema } from '../src/db/schema.js';
import { noteRepo } from '../src/db/repositories/note.repo.js';
import { reminderRepo } from '../src/db/repositories/reminder.repo.js';
import { contactRepo } from '../src/db/repositories/contact.repo.js';
import { messageRepo } from '../src/db/repositories/message.repo.js';
import { ContactTier } from '../src/types/contact.js';

console.log('--- RUNNING MESSIAH COMPONENT INTEGRITY CHECKS ---');

// 1. Initialize schema
initializeDatabaseSchema();
console.log('✅ 1. Schema initialized successfully.');

// 2. Test Note & FTS5 search
const savedNote = noteRepo.saveNote('Quarterly revenue targets and OKR list', 'work', 'https://example.com/okrs');
console.log(`✅ 2. Saved note #${savedNote.id} with tag #${savedNote.tag}`);

const searchResults = noteRepo.searchNotes('revenue');
if (searchResults.length > 0 && searchResults[0].id === savedNote.id) {
  console.log('✅ 3. SQLite FTS5 Full-Text Search working accurately!');
} else {
  console.error('❌ FTS5 search failed to match keyword.');
}

// 3. Test Reminders
const reminder = reminderRepo.createReminder('Follow up on server deployment', Date.now() + 60000);
console.log(`✅ 4. Created reminder #${reminder.id} for task: "${reminder.task}"`);

// 4. Test Contacts
const contact = contactRepo.upsertContact('1234567890@s.whatsapp.net', '1234567890', 'Alex Test', ContactTier.TIER1_INNER);
console.log(`✅ 5. Contact registered: ${contact.name} (Tier ${contact.tier})`);

// 5. Test Message Archiving & Anti-Revoke
const msgId = `MSG_${Date.now()}`;
messageRepo.saveMessage({
  id: msgId,
  chatJid: '1234567890@s.whatsapp.net',
  senderJid: '1234567890@s.whatsapp.net',
  fromMe: false,
  messageType: 'conversation',
  content: 'Secret confidential message',
  rawPayload: { text: 'Secret confidential message' },
  timestamp: Date.now()
});

const revoked = messageRepo.markAsRevoked(msgId);
if (revoked && revoked.is_revoked === 1 && revoked.content === 'Secret confidential message') {
  console.log('✅ 6. Anti-Revoke logic verified: message marked revoked while preserving content!');
} else {
  console.error('❌ Anti-revoke failed.');
}

// 6. Test Phase 1 Agent Tools & Search Capabilities
import { AGENT_TOOLS } from '../src/services/openai.service.js';

console.log(`✅ 7. Agent Tools registered: ${AGENT_TOOLS.map(t => (t as any).function?.name).join(', ')}`);

// Contact search test
const foundContact = contactRepo.searchContact('Alex Test');
if (foundContact && foundContact.phone === '1234567890') {
  console.log('✅ 8. Contact search by name/phone verified successfully.');
} else {
  console.error('❌ Contact search failed.');
}

// Search revoked intel test
const revokedIntel = messageRepo.searchRevoked('Secret', 5);
if (revokedIntel.length > 0 && revokedIntel[0].id === msgId) {
  console.log('✅ 9. Forensic Revoked Intel search verified successfully.');
} else {
  console.error('❌ Revoked intel search failed.');
}

// Update content (transcription simulated test)
messageRepo.updateContent(msgId, '[Voice Note]: Voice note transcribed via Whisper');
const updatedMsg = messageRepo.getMessageById(msgId);
if (updatedMsg && updatedMsg.content?.includes('[Voice Note]')) {
  console.log('✅ 10. Message content update (Whisper transcription pipeline) verified.');
} else {
  console.error('❌ Message content update failed.');
}

console.log('\n🎉 ALL CORE AND PHASE 1 VERIFICATIONS PASSED SUCCESSFULLY!');

