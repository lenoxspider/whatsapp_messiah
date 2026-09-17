import type { WASocket, ConnectionState } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { env } from '../config/env.js';
import { dashboardState } from '../server/state.js';

export async function handlePairing(
  sock: WASocket,
  update: Partial<ConnectionState>,
  isRegistered: boolean
): Promise<void> {
  // If registered or user identity already linked, skip pairing
  if (isRegistered || sock.user?.id) {
    return;
  }

  const { qr } = update;

  // Sync QR code to web dashboard whenever available
  if (qr) {
    dashboardState.setQR(qr);
  }

  // Terminal QR Code if explicitly requested in config
  if (env.pairingMethod === 'qr' && qr) {
    console.log('\n[Pairing] Scan this QR code with your WhatsApp camera:');
    qrcode.generate(qr, { small: true });
  }
}
