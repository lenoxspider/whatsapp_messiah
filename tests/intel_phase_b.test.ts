import { describe, it } from 'node:test';
import assert from 'node:assert';
import { initializeDatabaseSchema } from '../src/db/schema.js';
import { dossierRepo } from '../src/db/repositories/dossier.repo.js';
import { resurrectionService } from '../src/services/resurrection.service.js';
import { dossierService } from '../src/services/dossier.service.js';
import { contactRepo } from '../src/db/repositories/contact.repo.js';

describe('Intel Layer Phase B Verification', () => {
  it('should save, retrieve, and respect TTL on cached contact dossiers', () => {
    initializeDatabaseSchema();

    const testJid = `test_dossier_${Date.now()}@s.whatsapp.net`;

    dossierRepo.saveDossier({
      jid: testJid,
      summary: 'Kofi is a senior backend engineer working on fintech APIs.',
      openCommitments: ['Owner promised to send invoice', 'Kofi will send API docs'],
      toneProfile: 'Warm & Professional',
      topics: ['Fintech', 'Database', 'Docker'],
      messageCountAnalyzed: 45,
      ttlDays: 7
    });

    const cached = dossierRepo.getDossier(testJid, true);
    assert.ok(cached !== null, 'Dossier must be retrievable from cache');
    assert.strictEqual(cached.jid, testJid);
    assert.strictEqual(cached.open_commitments.length, 2);
    assert.strictEqual(cached.tone_profile, 'Warm & Professional');
    assert.strictEqual(cached.topics.length, 3);
    assert.ok(cached.expires_at > Date.now(), 'Expires at must be in the future');

    // Test delete
    const deleted = dossierRepo.deleteDossier(testJid);
    assert.strictEqual(deleted, true);
    assert.strictEqual(dossierRepo.getDossier(testJid), null);
  });

  it('should detect dormant Tier 1 and Tier 2 connections based on cutoff', () => {
    initializeDatabaseSchema();

    const dormantJid = `dormant_${Date.now()}@s.whatsapp.net`;
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    // Save a dormant Tier 1 contact
    contactRepo.upsertContact(dormantJid, '233509998877', 'Old Friend Kwame', 1);
    const db = (contactRepo as any).db;
    db.prepare('UPDATE contacts SET last_interaction = ? WHERE jid = ?').run(thirtyDaysAgo, dormantJid);

    const dormantThreads = resurrectionService.findDormantThreads(14, 2);
    const found = dormantThreads.find(c => c.jid === dormantJid);
    assert.ok(found, 'Dormant contact must be surfaced in cold threads radar');
    assert.ok(found.daysDormant >= 29, 'Days dormant should be at least 29');

    const report = resurrectionService.formatDormantReport(dormantThreads, 14);
    assert.ok(report.includes('Old Friend Kwame'), 'Report must include contact name');
    assert.ok(report.includes('Tier 1 VIP'), 'Report must reflect VIP tier');
  });

  it('should format in-chat dossier card cleanly for !dossier', () => {
    const mockDossier = {
      jid: '233501234567@s.whatsapp.net',
      summary: 'Trusted software collaborator and advisor.',
      openCommitments: ['Send GitHub repository link', 'Review schema proposals'],
      toneProfile: 'Direct & Casual',
      topics: ['Postgres', 'WebSockets', 'Baileys'],
      messageCountAnalyzed: 52,
      cached: true,
      generatedAt: Date.now(),
      expiresAt: Date.now() + 604800000
    };

    const card = dossierService.formatDossierForChat(mockDossier, 'Kofi Boateng', '233501234567');
    assert.ok(card.includes('EXECUTIVE DOSSIER: Kofi Boateng'));
    assert.ok(card.includes('Direct & Casual'));
    assert.ok(card.includes('Send GitHub repository link'));
    assert.ok(card.includes('#Postgres'));
  });
});
