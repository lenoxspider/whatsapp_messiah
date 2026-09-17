export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  category: string;
  message: string;
}

class SystemLogger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 200;

  log(level: 'info' | 'warn' | 'error' | 'success', category: string, message: string): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      category,
      message
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

  getRecentLogs(limit: number = 50): LogEntry[] {
    return this.logs.slice(0, limit);
  }
}

export const systemLogger = new SystemLogger();
