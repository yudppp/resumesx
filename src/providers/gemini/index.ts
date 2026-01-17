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

type GeminiFileStat = {
  filePath: string;
  mtime: number;
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

const listGeminiChatFiles = async (chatsRoot: string): Promise<GeminiFileStat[]> => {
  const entries = await readDirSafe(chatsRoot);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(chatsRoot, entry.name));

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

  return fileStats.filter((f): f is GeminiFileStat => f !== null);
};

const parseGeminiFile = async (filePath: string): Promise<ToolEvent | null> => {
  let raw: string;
  try {
    raw = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isValidGeminiSession(parsed)) {
    return null;
  }

  const lastUpdated = typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : null;
  const occurredAt = lastUpdated ? new Date(lastUpdated) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
    return null;
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
    return null;
  }

  const fileName = path.basename(filePath);
  return {
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
  };
};

const readGeminiEventsFromFiles = async (
  files: GeminiFileStat[],
  limit?: number,
): Promise<ToolEvent[]> => {
  const sortedFiles = [...files].sort((a, b) => b.mtime - a.mtime);
  const events: ToolEvent[] = [];

  for (const file of sortedFiles) {
    if (typeof limit === 'number' && events.length >= limit) {
      break;
    }
    const event = await parseGeminiFile(file.filePath);
    if (event) {
      events.push(event);
    }
  }

  return events;
};

const readGeminiSessions = async (projectHash: string, limit?: number): Promise<ToolEvent[]> => {
  const chatsRoot = resolveHome(`~/.gemini/tmp/${projectHash}/chats`);
  if (!(await pathExists(chatsRoot))) {
    return [];
  }

  const fileStats = await listGeminiChatFiles(chatsRoot);
  return await readGeminiEventsFromFiles(fileStats, limit);
};

const readAllGeminiSessions = async (limit?: number): Promise<ToolEvent[]> => {
  const tmpRoot = resolveHome('~/.gemini/tmp');
  if (!(await pathExists(tmpRoot))) {
    return [];
  }

  const entries = await readDirSafe(tmpRoot);
  const allFiles: GeminiFileStat[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const chatsRoot = path.join(tmpRoot, entry.name, 'chats');
    const fileStats = await listGeminiChatFiles(chatsRoot);
    allFiles.push(...fileStats);
  }

  return await readGeminiEventsFromFiles(allFiles, limit);
};

const geminiProvider: ToolProvider = {
  id: 'gemini',
  label: 'Gemini CLI',
  fetchEvents: async (options): Promise<ToolEvent[]> => {
    const cwd = process.cwd();
    const projectHash = crypto.createHash('sha256').update(cwd).digest('hex');
    // Default to 50 most recent items for better performance
    const { limit, includeAll } = options ?? {};
    const effectiveLimit = limit ?? 50;
    if (includeAll) {
      return await readAllGeminiSessions(effectiveLimit);
    }
    return await readGeminiSessions(projectHash, effectiveLimit);
  },
};

export default geminiProvider;
