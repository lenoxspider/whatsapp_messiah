import { EventEmitter } from 'node:events';

export type SocketStatus = 'disconnected' | 'connecting' | 'connected';

export interface ServerStateData {
  status: SocketStatus;
  qrCode: string | null;
  pairingCode: string | null;
  pairedPhone: string | null;
  lastError: string | null;
  connectedAt: number | null;
}

class DashboardState extends EventEmitter {
  private data: ServerStateData = {
    status: 'disconnected',
    qrCode: null,
    pairingCode: null,
    pairedPhone: null,
    lastError: null,
    connectedAt: null
  };

  public requestPairingCodeFn: ((phone: string) => Promise<string>) | null = null;
  public reconnectFn: (() => Promise<void>) | null = null;
  public logoutFn: (() => Promise<void>) | null = null;

  getState(): ServerStateData {
    return { ...this.data };
  }

  setStatus(status: SocketStatus, error?: string | null): void {
    this.data.status = status;
    if (status === 'connected') {
      this.data.connectedAt = Date.now();
      this.data.qrCode = null;
      this.data.pairingCode = null;
      this.data.lastError = null;
    } else if (status === 'disconnected') {
      this.data.connectedAt = null;
    }
    if (error !== undefined) {
      this.data.lastError = error;
    }
    this.emit('change', this.data);
  }

  setQR(qr: string | null): void {
    this.data.qrCode = qr;
    this.emit('change', this.data);
  }

  setPairingCode(code: string | null): void {
    this.data.pairingCode = code;
    this.emit('change', this.data);
  }

  setPairedPhone(phone: string | null): void {
    this.data.pairedPhone = phone;
    this.emit('change', this.data);
  }
}

export const dashboardState = new DashboardState();
