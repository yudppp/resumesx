import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { ToolEvent, ToolProvider } from '../../types.js';
import { resolveHome, pathExists } from '../../lib/paths.js';
import { toSummary, isUiEcho } from '../../lib/format.js';

type ClaudeHistoryRecord = {
  timestamp?: number;
  display?: string;
  sessionId?: string;
  project?: string;
};

type SessionData = {
  firstTimestamp: number;
  lastTimestamp: number;
  prevTimestamp?: number;
  first?: string;
  last?: string;
  prev?: string;
};

const isValidClaudeRecord = (obj: unknown): obj is ClaudeHistoryRecord => {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  return (
    (record.timestamp === undefined || typeof record.timestamp === 'number') &&
    (record.display === undefined || typeof record.display === 'string') &&
    (record.sessionId === undefined || typeof record.sessionId === 'string') &&
    (record.project === undefined || typeof record.project === 'string')
  );
};

const claudeProvider: ToolProvider = {
  id: 'claude',
  label: 'Claude Code',
  fetchEvents: async (limit?: number): Promise<ToolEvent[]> => {
    const historyPath = resolveHome('~/.claude/history.jsonl');
    if (!(await pathExists(historyPath))) {
      return [];
    }

    const cwd = process.cwd();
    const sessions = new Map<string, SessionData>();
    const stream = fs.createReadStream(historyPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

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

        if (!isValidClaudeRecord(parsed)) {
          continue;
        }

        if (!parsed.sessionId || !parsed.timestamp || !parsed.project) {
          continue;
        }

        const matchesProject =
          parsed.project === cwd ||
          cwd.startsWith(`${parsed.project}${path.sep}`) ||
          parsed.project.startsWith(`${cwd}${path.sep}`);
        if (!matchesProject) {
          continue;
        }

        const summary =
          parsed.display && !isUiEcho(parsed.display) ? toSummary(parsed.display) : undefined;
        if (!summary) {
          continue;
        }

        const existing = sessions.get(parsed.sessionId);
        if (!existing) {
          sessions.set(parsed.sessionId, {
            firstTimestamp: parsed.timestamp,
            lastTimestamp: parsed.timestamp,
            first: summary,
            last: summary,
          });
          continue;
        }

        if (parsed.timestamp < existing.firstTimestamp) {
          existing.firstTimestamp = parsed.timestamp;
          existing.first = summary;
        }

        if (parsed.timestamp >= existing.lastTimestamp) {
          existing.prevTimestamp = existing.lastTimestamp;
          existing.prev = existing.last;
          existing.lastTimestamp = parsed.timestamp;
          existing.last = summary;
        } else if (!existing.prevTimestamp || parsed.timestamp > existing.prevTimestamp) {
          existing.prevTimestamp = parsed.timestamp;
          existing.prev = summary;
        }
      }
    } finally {
      rl.close();
      stream.close();
    }

    const items: ToolEvent[] = [];
    for (const [sessionId, data] of sessions.entries()) {
      const summary = data.first ?? data.prev ?? data.last;
      if (!summary) {
        continue;
      }
      items.push({
        id: `claude-${sessionId}`,
        label: 'Claude Code',
        occurredAt: new Date(data.lastTimestamp),
        source: path.basename(historyPath),
        confidence: 'high',
        summary,
        resume: {
          command: 'claude',
          args: ['--resume', sessionId],
          mode: 'resume',
        },
      });
    }

    items.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    // Default to 50 most recent items for better performance
    const effectiveLimit = limit ?? 50;
    return items.slice(0, effectiveLimit);
  },
};

export default claudeProvider;
