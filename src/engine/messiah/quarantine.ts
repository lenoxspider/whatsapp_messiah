import fs from 'node:fs';
import path from 'node:path';

const QUARANTINE_DIR = path.resolve(process.cwd(), 'data', 'quarantine');

export interface QuarantineRecord {
  timestamp: string;
  msgId: string | null;
  context: string;
  error: string;
  stack?: string | null;
  rawBase64: string;
  binaryFile: string;
}

/**
 * Dumps raw failed payload bytes and error context to `data/quarantine/`
 * for offline inspection and decoding.
 */
export function quarantineFailedPayload(
  payload: Buffer | Uint8Array | string,
  msgId: string | undefined | null,
  error: Error | any,
  contextInfo = 'Protobuf Decode Failure'
): string {
  try {
    if (!fs.existsSync(QUARANTINE_DIR)) {
      fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeId = msgId ? String(msgId).replace(/[^a-zA-Z0-9_-]/g, '') : 'unknown';
    const baseFilename = `quarantine_${timestamp}_${safeId}`;

    let buf: Buffer;
    if (Buffer.isBuffer(payload)) {
      buf = payload;
    } else if (payload instanceof Uint8Array) {
      buf = Buffer.from(payload);
    } else if (typeof payload === 'string') {
      buf = Buffer.from(payload, payload.length % 4 === 0 ? 'base64' : 'utf-8');
    } else {
      buf = Buffer.from(JSON.stringify(payload));
    }

    // 1. Write raw binary payload artifact
    const binPath = path.join(QUARANTINE_DIR, `${baseFilename}.bin`);
    fs.writeFileSync(binPath, buf);

    // 2. Write metadata JSON
    const metaPath = path.join(QUARANTINE_DIR, `${baseFilename}.json`);
    const record: QuarantineRecord = {
      timestamp: new Date().toISOString(),
      msgId: msgId || null,
      context: contextInfo,
      error: error?.message || String(error),
      stack: error?.stack || null,
      rawBase64: buf.toString('base64'),
      binaryFile: `${baseFilename}.bin`
    };
    fs.writeFileSync(metaPath, JSON.stringify(record, null, 2));

    console.warn(`[Quarantine] 🚨 Quarantine record created: ${metaPath}`);
    return metaPath;
  } catch (qErr: any) {
    console.error(`[Quarantine] Failed to write quarantine file:`, qErr.message);
    return '';
  }
}
