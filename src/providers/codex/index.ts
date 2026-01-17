import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { ToolEvent, ToolProvider } from '../../types.js';
import { resolveHome, pathExists, readDirSafe, statSafe } from '../../lib/paths.js';
import { toSummary, isUiEcho } from '../../lib/format.js';

type CodexSessionMetaPayload = {
  id?: string;
  cwd?: string;
};

type CodexUserMessagePayload = {
  type?: string;
  message?: string;
};

type CodexHistoryRecord = {
  type?: string;
  timestamp?: string;
  payload?: CodexSessionMetaPayload | CodexUserMessagePayload;
};

type SessionSummary = {
  sessionId?: string;
  sessionCwd?: string;
  firstUserMessage?: string;
  lastUserMessage?: string;
  prevUserMessage?: string;
  lastTimestamp?: string;
};

const isValidCodexRecord = (obj: unknown): obj is CodexHistoryRecord => {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return (
    (record.type === undefined || typeof record.type === 'string') &&
    (record.timestamp === undefined || typeof record.timestamp === 'string') &&
    (record.payload === undefined || typeof record.payload === 'object')
  );
};

const listSessionFiles = async (root: string) => {
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await readDirSafe(current);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  }

  return results;
};

const readSessionSummary = async (filePath: string): Promise<SessionSummary> => {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let sessionId: string | undefined;
  let sessionCwd: string | undefined;
  let firstUserMessage: string | undefined;
  let lastUserMessage: string | undefined;
  let prevUserMessage: string | undefined;
  let lastTimestamp: string | undefined;

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }

      if (!isValidCodexRecord(parsed)) {
        continue;
      }

      if (typeof parsed.timestamp === 'string') {
        lastTimestamp = parsed.timestamp;
      }

      if (parsed.type === 'session_meta' && parsed.payload) {
        const payload = parsed.payload as CodexSessionMetaPayload;
        if (typeof payload.id === 'string') {
          sessionId = payload.id;
        }
        if (typeof payload.cwd === 'string') {
          sessionCwd = payload.cwd;
        }
      }

      if (parsed.type === 'event_msg' && parsed.payload) {
        const payload = parsed.payload as CodexUserMessagePayload;
        if (payload.type === 'user_message' && typeof payload.message === 'string') {
          if (!isUiEcho(payload.message)) {
            if (!firstUserMessage) {
              firstUserMessage = payload.message;
            }
            prevUserMessage = lastUserMessage;
            lastUserMessage = payload.message;
          }
        }
      }
    }
  } finally {
    rl.close();
    stream.close();
  }

  return {
    sessionId,
    sessionCwd,
    firstUserMessage,
    lastUserMessage,
    prevUserMessage,
    lastTimestamp,
  };
};

const codexProvider: ToolProvider = {
  id: 'codex',
  label: 'Codex CLI',
  fetchEvents: async (limit?: number): Promise<ToolEvent[]> => {
    const sessionsRoot = resolveHome('~/.codex/sessions');
    if (!(await pathExists(sessionsRoot))) {
      return [];
    }

    const cwd = process.cwd();
    // Default to 50 most recent items for better performance
    const effectiveLimit = limit ?? 50;

    const sessionFiles = await listSessionFiles(sessionsRoot);
    const fileStats = await Promise.all(
      sessionFiles.map(async (filePath) => ({
        filePath,
        stat: await statSafe(filePath),
      })),
    );

    fileStats.sort((a, b) => (b.stat?.mtimeMs ?? 0) - (a.stat?.mtimeMs ?? 0));

    const events: ToolEvent[] = [];
    for (const entry of fileStats) {
      if (!entry.stat) {
        continue;
      }

      const summary = await readSessionSummary(entry.filePath);
      if (!summary.sessionId || !summary.sessionCwd || !summary.lastTimestamp) {
        continue;
      }

      const matchesCwd =
        summary.sessionCwd === cwd ||
        cwd.startsWith(`${summary.sessionCwd}${path.sep}`) ||
        summary.sessionCwd.startsWith(`${cwd}${path.sep}`);
      if (!matchesCwd) {
        continue;
      }

      const occurredAt = new Date(summary.lastTimestamp);
      if (Number.isNaN(occurredAt.getTime())) {
        continue;
      }

      const fallbackMessage =
        summary.firstUserMessage ?? summary.prevUserMessage ?? summary.lastUserMessage;
      const shortSummary = fallbackMessage ? toSummary(fallbackMessage) : undefined;
      if (!shortSummary) {
        continue;
      }
      events.push({
        id: `codex-${summary.sessionId}`,
        label: 'Codex CLI',
        occurredAt,
        source: path.basename(entry.filePath),
        confidence: 'high',
        summary: shortSummary,
        resume: {
          command: 'codex',
          args: ['resume', summary.sessionId],
          mode: 'resume',
        },
      });

      if (events.length >= effectiveLimit) {
        break;
      }
    }

    return events;
  },
};

export default codexProvider;
