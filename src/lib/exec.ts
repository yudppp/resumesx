import { spawn } from 'child_process';

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export const runCommand = (
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
) => {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    let timeout: NodeJS.Timeout | null = null;
    if (options.timeoutMs) {
      timeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, options.timeoutMs);
    }

    let settled = false;
    const finish = (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({ stdout, stderr, exitCode: code });
    };

    child.on('error', (error) => {
      stderr += error.message;
      finish(1);
    });

    child.on('close', (code) => finish(code));
  });
};

export const spawnInteractive = (
  command: string,
  args: string[],
  options: { cwd?: string } = {},
) => {
  return new Promise<number | null>((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'inherit',
    });

    let settled = false;
    const finish = (code: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(code);
    };

    child.on('error', () => finish(1));
    child.on('close', (code) => finish(code));
  });
};
