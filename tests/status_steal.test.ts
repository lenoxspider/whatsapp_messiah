import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isStatusStealerTrigger } from '../src/engine/router.js';
import { statusStealRepo } from '../src/db/repositories/status_steal.repo.js';
import { initializeDatabaseSchema } from '../src/db/schema.js';

describe('Status Stealer ("Ghost Capture") Verification', () => {
  it('should normalize and match Unicode variants of the face in clouds emoji', () => {
    const configuredTrigger = '!😶🌫️';

    // Exact match
    assert.strictEqual(isStatusStealerTrigger('!😶🌫️', configuredTrigger), true);

    // ZWJ variant: ! + \u{1F636} + \u{200D} + \u{1F32B} + \u{FE0F}
    assert.strictEqual(isStatusStealerTrigger('!😶‍🌫️', configuredTrigger), true);

    // Bare emoji without variation selectors
    assert.strictEqual(isStatusStealerTrigger('!😶🌫', configuredTrigger), true);

    // With leading / trailing spaces
    assert.strictEqual(isStatusStealerTrigger('  !😶🌫️  ', configuredTrigger), true);

    // Custom text triggers
    assert.strictEqual(isStatusStealerTrigger('!yoink', '!yoink'), true);
    assert.strictEqual(isStatusStealerTrigger('!STEAL', '!steal'), true);

    // Non-matches
    assert.strictEqual(isStatusStealerTrigger('hello there', configuredTrigger), false);
    assert.strictEqual(isStatusStealerTrigger('!ask something', configuredTrigger), false);
    assert.strictEqual(isStatusStealerTrigger('!😶', configuredTrigger), false);
  });

  it('should save, query, and delete captured statuses in SQLite repository', () => {
    initializeDatabaseSchema();

    const testTimestamp = Date.now();
    const id = statusStealRepo.recordSteal({
      statusId: 'test_status_12345',
      contactJid: '233501112233@s.whatsapp.net',
      contactPhone: '233501112233',
      contactName: 'Amina Test',
      content: 'Beautiful sunset in Accra!',
      mediaPath: 'data/media/status_test_12345.jpg',
      mediaType: 'image',
      mimeType: 'image/jpeg',
      timestamp: testTimestamp,
      discordSent: true
    });

    assert.ok(id > 0, 'Record ID should be positive integer');

    const list = statusStealRepo.getCapturedStatuses(10, 0);
    const found = list.find(s => s.id === id);
    assert.ok(found, 'Inserted status must be found in captured statuses list');
    assert.strictEqual(found.contact_phone, '233501112233');
    assert.strictEqual(found.contact_name, 'Amina Test');
    assert.strictEqual(found.content, 'Beautiful sunset in Accra!');
    assert.strictEqual(found.media_type, 'image');

    const totalBefore = statusStealRepo.countCapturedStatuses();
    assert.ok(totalBefore >= 1);

    const deleted = statusStealRepo.deleteCapturedStatus(id);
    assert.strictEqual(deleted, true);

    const afterList = statusStealRepo.getCapturedStatuses(10, 0);
    assert.ok(!afterList.some(s => s.id === id), 'Deleted record should no longer exist');
  });
});
