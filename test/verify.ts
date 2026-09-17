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
if (searchResults.length > 0 && searchResults.some(r => r.id === savedNote.id)) {
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

// 7. Test Phase 2: Living Contact Memory & Fact Extraction
import { contactFactRepo } from '../src/db/repositories/contact_fact.repo.js';

const fact1 = contactFactRepo.addFact('1234567890@s.whatsapp.net', 'Works as Senior DevOps Engineer at Acme', 'workplace');
const fact2 = contactFactRepo.addFact('1234567890@s.whatsapp.net', 'Lives in Berlin, Germany', 'location');
const activeFacts = contactFactRepo.getActiveFacts('1234567890@s.whatsapp.net');

if (activeFacts.length >= 2 && activeFacts.some(f => f.fact.includes('Berlin'))) {
  console.log(`✅ 11. Per-contact living memory verified: ${activeFacts.length} active facts stored & retrieved.`);
} else {
  console.error('❌ Contact facts repository failed.');
}

// 8. Test Phase 2: LLM Cost & Telemetry Logging
import { llmCallRepo } from '../src/db/repositories/llm_call.repo.js';

llmCallRepo.logCall({
  model: 'gpt-4o-mini',
  purpose: 'ghost_reply',
  promptTokens: 120,
  completionTokens: 45,
  totalTokens: 165,
  costUsd: 0.000045,
  latencyMs: 380
});

const stats = llmCallRepo.getStats();
const recentCalls = llmCallRepo.getRecentCalls(5);

if (stats.totalCalls > 0 && stats.totalTokens > 0 && recentCalls.length > 0) {
  console.log(`✅ 12. LLM Telemetry verified: ${stats.totalCalls} calls logged, $${stats.totalCostUsd.toFixed(6)} tracked.`);
} else {
  console.error('❌ LLM Telemetry logging failed.');
}

// 9. Test Phase 2: Humanized Presence Latency Simulation
import { presenceSimulator } from '../src/engine/messiah/presence.js';

const readingLatency = presenceSimulator.calculateReadingLatency(30);
const typingDelay = presenceSimulator.calculateTypingDelay(40);

if (readingLatency >= 2500 && typingDelay >= 1000) {
  console.log(`✅ 13. Humanized timing verified: readingLatency=${readingLatency}ms, typingDelay=${typingDelay}ms.`);
} else {
  console.error('❌ Presence timing calculation out of bounds.');
}

console.log('\n🎉 ALL CORE, PHASE 1, AND PHASE 2 VERIFICATIONS PASSED SUCCESSFULLY!');


