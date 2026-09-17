import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface CommandExecutionResult {
  allowed: boolean;
  command: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  executionTimeMs?: number;
}

// Dangerous patterns that are unconditionally blocked
const BLACKLISTED_PATTERNS = [
  /rm\s+(-[rfRF]+\s+)?(\/|\/\*|\.\.|\.\/\*)/i,
  /mkfs/i,
  /dd\s+if=/i,
  /:(){ :|:& };:/,
  />\s*\/dev\/sd/i,
  /chmod\s+(-[rR]+\s+)?(777|000)\s+\//i,
  /chown\s+(-[rR]+\s+)?.*\s+\//i,
  /shutdown/i,
  /init\s+0/i,
  /drop\s+database/i
];

export class SystemRunnerService {
  /**
   * Validates if a command is safe to execute.
   */
  isSafeCommand(command: string): { isSafe: boolean; reason?: string } {
    const trimmed = command.trim();
    if (!trimmed) {
      return { isSafe: false, reason: 'Command is empty' };
    }

    for (const pattern of BLACKLISTED_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          isSafe: false,
          reason: `Blocked dangerous command pattern: ${pattern.toString()}`
        };
      }
    }

    return { isSafe: true };
  }

  /**
   * Executes a shell command on the host within a strict timeout.
   */
  async execute(command: string, timeoutMs: number = 10000): Promise<CommandExecutionResult> {
    const check = this.isSafeCommand(command);
    if (!check.isSafe) {
      return {
        allowed: false,
        command,
        error: `🛡️ Security Guardrail: ${check.reason}`
      };
    }

    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeoutMs,
        maxBuffer: 1024 * 512 // 512 KB
      });

      const duration = Date.now() - startTime;
      const cleanStdout = this.truncateOutput(stdout.trim());
      const cleanStderr = this.truncateOutput(stderr.trim());

      return {
        allowed: true,
        command,
        stdout: cleanStdout || '(empty output)',
        stderr: cleanStderr || undefined,
        exitCode: 0,
        executionTimeMs: duration
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      return {
        allowed: true,
        command,
        stdout: err.stdout ? this.truncateOutput(err.stdout.trim()) : undefined,
        stderr: err.stderr ? this.truncateOutput(err.stderr.trim()) : undefined,
        exitCode: err.code || 1,
        error: err.message || 'Execution error',
        executionTimeMs: duration
      };
    }
  }

  private truncateOutput(output: string, maxLength: number = 1800): string {
    if (!output) return '';
    if (output.length <= maxLength) return output;
    const truncated = output.slice(0, maxLength);
    return `${truncated}\n\n... [Output truncated: ${output.length - maxLength} more characters]`;
  }
}

export const systemRunnerService = new SystemRunnerService();
