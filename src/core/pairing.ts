import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { env } from '../config/env.js';

export async function handlePairing(
  sock: WASocket,
  update: Partial<ConnectionState>,
  isRegistered: boolean
): Promise<void> {
  const { qr } = update;

  // Case 1: Terminal QR Code requested
  if (env.pairingMethod === 'qr' && qr && !isRegistered) {
    console.log('\n[Pairing] Scan this QR code with your WhatsApp camera:');
    qrcode.generate(qr, { small: true });
    return;
  }

  // Case 2: 8-digit Pairing Code requested (ideal for headless VPS over SSH)
  if (env.pairingMethod === 'code' && !isRegistered) {
    if (!env.phoneNumber) {
      console.error('\n[Pairing Error] PHONE_NUMBER is required in .env when PAIRING_METHOD=code.');
      console.error('Format: international digits only, e.g. 15551234567\n');
      return;
    }

    try {
      // Small delay to allow socket registration handshake
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(env.phoneNumber);
          const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

          console.log('\n=============================================================');
          console.log('         WHATSAPP MESSIAH - 8-DIGIT PAIRING CODE            ');
          console.log('=============================================================');
          console.log(`\n  PAIRING CODE:  >>>  ${formattedCode}  <<<`);
          console.log('\n  HOW TO PAIR:');
          console.log('  1. Open WhatsApp on your primary phone');
          console.log('  2. Tap Settings > Linked Devices > Link a Device');
          console.log('  3. Tap "Link with phone number instead"');
          console.log(`  4. Enter the 8-digit code shown above.\n`);
          console.log('=============================================================\n');
        } catch (err) {
          console.error('[Pairing Error] Failed to generate pairing code:', err);
        }
      }, 3000);
    } catch (err) {
      console.error('[Pairing Error]', err);
    }
  }
}
