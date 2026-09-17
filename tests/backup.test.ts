import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { backupService } from '../src/services/backup.service.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('🧪 Running Backup & Disaster Recovery Test Suite...\n');

  // Test 1: Generate Full Backup Archive
  console.log('[Test 1] Create Full Backup Archive');
  const backupResult = await backupService.createBackup({ label: 'unittest', includeMedia: true });
  assert(fs.existsSync(backupResult.filePath), `Archive created on disk at ${backupResult.filePath}`);
  assert(backupResult.sizeBytes > 0, `Archive size is non-zero (${backupResult.sizeBytes} bytes)`);
  assert(backupResult.manifest.appName === 'whatsapp_messiah', 'Manifest appName is whatsapp_messiah');
  assert(typeof backupResult.manifest.sha256Checksum === 'string', 'SHA-256 checksum calculated');

  // Test 2: Inspect Zip Contents
  console.log('\n[Test 2] Validate Zip Archive Structure');
  const zip = new AdmZip(backupResult.filePath);
  const entries = zip.getEntries().map(e => e.entryName);
  
  assert(entries.includes('manifest.json'), 'Archive contains manifest.json');
  assert(entries.some(e => e.includes('messiah.db')), 'Archive contains SQLite database snapshot (messiah.db)');
  
  const manifestData = JSON.parse(zip.getEntry('manifest.json')!.getData().toString('utf-8'));
  assert(manifestData.version === '1.0.0', 'Manifest version is 1.0.0');
  assert(manifestData.includesMedia === true, 'Manifest indicates media included');

  // Test 3: List Local Backups
  console.log('\n[Test 3] List Backups API');
  const backups = backupService.listBackups();
  assert(backups.length > 0, `Found ${backups.length} local backups`);
  assert(backups[0].filename === backupResult.filename, 'Latest backup is first in list');
  assert(backups[0].formattedSize.length > 0, `Formatted size present: ${backups[0].formattedSize}`);

  // Test 4: Restore Validation & Manifest Extraction
  console.log('\n[Test 4] Restore Validation');
  const restoreResult = await backupService.restoreBackup(backupResult.filePath);
  assert(restoreResult.success === true, 'restoreBackup succeeded');
  assert(restoreResult.restoredFiles.length > 0, `Restored ${restoreResult.restoredFiles.length} files`);
  assert(restoreResult.manifest !== null, 'Restored manifest verified');

  // Cleanup unit test backup
  try {
    if (fs.existsSync(backupResult.filePath)) {
      fs.unlinkSync(backupResult.filePath);
    }
  } catch {}

  console.log(`\n================================`);
  console.log(`Backup Suite Results: ${passed} Passed, ${failed} Failed`);
  console.log(`================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
