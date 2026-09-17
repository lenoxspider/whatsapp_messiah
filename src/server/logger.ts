export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success' | 'audit';
  category: string;
  message: string;
  clientIp?: string;
}

class SystemLogger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 300;

  log(level: 'info' | 'warn' | 'error' | 'success' | 'audit', category: string, message: string, clientIp?: string): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      category,
      message,
      clientIp
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  info(category: string, message: string): void {
    this.log('info', category, message);
  }

  warn(category: string, message: string): void {
    this.log('warn', category, message);
  }

  error(category: string, message: string): void {
    this.log('error', category, message);
  }

  success(category: string, message: string): void {
    this.log('success', category, message);
  }

  audit(action: string, clientIp: string, message: string): void {
    const formatted = `[AUDIT] Action: ${action} | IP: ${clientIp} | ${message}`;
    console.log(`🔒 ${formatted}`);
    this.log('audit', 'ADMIN_AUDIT', formatted, clientIp);
  }

  getRecentLogs(limit: number = 50): LogEntry[] {
    // Sanitize log stream to prevent leaking tokens or raw credential bytes
    return this.logs.slice(0, limit).map(entry => {
      let sanitizedMessage = entry.message
        .replace(/messiah_token=[a-zA-Z0-9_-]+/g, 'messiah_token=[REDACTED]')
        .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]')
        .replace(/"webMessageInfoBytes":\s*"[^"]+"/g, '"webMessageInfoBytes":"[REDACTED]"');

      return {
        ...entry,
        message: sanitizedMessage
      };
    });
  }
}

export const systemLogger = new SystemLogger();
