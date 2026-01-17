import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { ToolEvent, ToolProvider } from '../../types.js';
import { resolveHome, pathExists, readDirSafe } from '../../lib/paths.js';
import { toSummary } from '../../lib/format.js';

type GeminiMessage = {
  type?: string;
  content?: string;
};

type GeminiChatSession = {
  sessionId?: string;
  lastUpdated?: string;
  messages?: GeminiMessage[];
};

const isValidGeminiSession = (obj: unknown): obj is GeminiChatSession => {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const session = obj as Record<string, unknown>;
  return (
    (session.sessionId === undefined || typeof session.sessionId === 'string') &&
    (session.lastUpdated === undefined || typeof session.lastUpdated === 'string') &&
    (session.messages === undefined || Array.isArray(session.messages))
  );
};

const readGeminiSessions = async (projectHash: string, limit?: number): Promise<ToolEvent[]> => {
  const chatsRoot = resolveHome(`~/.gemini/tmp/${projectHash}/chats`);
  if (!(await pathExists(chatsRoot))) {
    return [];
  }

  const entries = await readDirSafe(chatsRoot);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(chatsRoot, entry.name));

  // Get file mtime and sort by newest first
  const fileStats = await Promise.all(
    files.map(async (filePath) => {
      try {
        const stat = await fs.promises.stat(filePath);
        return { filePath, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    }),
  );

  const sortedFiles = fileStats
    .filter((f): f is { filePath: string; mtime: number } => f !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .map((f) => f.filePath);

  const events: ToolEvent[] = [];

  // Read files from newest first, stop when limit is reached
  for (const filePath of sortedFiles) {
    if (typeof limit === 'number' && events.length >= limit) {
      break;
    }

    let raw: string;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    if (!isValidGeminiSession(parsed)) {
      continue;
    }

    const lastUpdated = typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : null;
    const occurredAt = lastUpdated ? new Date(lastUpdated) : null;
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
      continue;
    }

    const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    const userMessages = messages.filter(
      (msg): msg is GeminiMessage =>
        typeof msg === 'object' &&
        msg !== null &&
        'type' in msg &&
        msg.type === 'user' &&
        'content' in msg &&
        typeof msg.content === 'string',
    );
    const firstUser = userMessages[0]?.content;
    const lastUser =
      userMessages.length > 0 ? userMessages[userMessages.length - 1].content : undefined;
    const summary = toSummary(firstUser ?? lastUser);
    if (!summary) {
      continue;
    }

    const fileName = path.basename(filePath);
    events.push({
      id: `gemini-${parsed.sessionId ?? fileName}`,
      label: 'Gemini CLI',
      occurredAt,
      source: 'gemini-tmp',
      confidence: 'medium',
      summary,
      resume: {
        command: 'gemini',
        args: [],
        mode: 'launch',
      },
    });
  }

  // Already sorted by mtime, no need for additional sorting
  return events;
};

const geminiProvider: ToolProvider = {
  id: 'gemini',
  label: 'Gemini CLI',
  fetchEvents: async (limit?: number): Promise<ToolEvent[]> => {
    const cwd = process.cwd();
    const projectHash = crypto.createHash('sha256').update(cwd).digest('hex');
    // Default to 50 most recent items for better performance
    const effectiveLimit = limit ?? 50;
    return await readGeminiSessions(projectHash, effectiveLimit);
  },
};

export default geminiProvider;
