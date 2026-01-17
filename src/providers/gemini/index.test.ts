import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import geminiProvider from './index.js';
import * as fs from 'fs';

// Mock dependencies
vi.mock('../../lib/paths.js', () => ({
  resolveHome: vi.fn((path: string) => path.replace('~', '/home/test')),
  pathExists: vi.fn(),
  readDirSafe: vi.fn(),
}));

vi.mock('../../lib/format.js', () => ({
  toSummary: vi.fn((text: string) => (text ? text.substring(0, 120) : undefined)),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mocked = {
    ...actual,
    promises: {
      readFile: vi.fn(),
      stat: vi.fn(),
    },
  };
  return {
    ...mocked,
    default: mocked,
  };
});

describe('Gemini Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({
      mtimeMs: 1234567890000,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct provider metadata', () => {
    expect(geminiProvider.id).toBe('gemini');
    expect(geminiProvider.label).toBe('Gemini CLI');
  });

  it('should return empty array if tmp chats directory does not exist', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    vi.mocked(pathExists).mockResolvedValue(false);

    const events = await geminiProvider.fetchEvents();

    expect(events).toEqual([]);
  });

  it('should parse Gemini chat sessions and return events', async () => {
    const { pathExists, readDirSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.json', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
      JSON.stringify({
        sessionId: 'session-1',
        lastUpdated: '2024-01-01T00:00:00Z',
        messages: [
          { type: 'user', content: 'First user message' },
          { type: 'assistant', content: 'Assistant response' },
        ],
      }),
    );

    const events = await geminiProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('gemini-session-1');
    expect(events[0]?.label).toBe('Gemini CLI');
    expect(events[0]?.summary).toBe('First user message');
    expect(events[0]?.resume?.command).toBe('gemini');
    expect(events[0]?.resume?.args).toEqual([]);
    expect(events[0]?.resume?.mode).toBe('launch');
  });

  it('should use last user message if first is not available', async () => {
    const { pathExists, readDirSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.json', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
      JSON.stringify({
        sessionId: 'session-1',
        lastUpdated: '2024-01-01T00:00:00Z',
        messages: [
          { type: 'assistant', content: 'Assistant first' },
          { type: 'user', content: 'User message' },
        ],
      }),
    );

    const events = await geminiProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('User message');
  });

  it('should respect limit parameter', async () => {
    const { pathExists, readDirSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.json', isFile: () => true, isDirectory: () => false } as any,
      { name: 'session2.json', isFile: () => true, isDirectory: () => false } as any,
    ]);

    let callCount = 0;
    vi.spyOn(fs.promises, 'readFile').mockImplementation(async () => {
      callCount++;
      return JSON.stringify({
        sessionId: `session-${callCount}`,
        lastUpdated: `2024-01-0${callCount}T00:00:00Z`,
        messages: [{ type: 'user', content: `Message ${callCount}` }],
      });
    });

    const events = await geminiProvider.fetchEvents({ limit: 1 });

    expect(events.length).toBeLessThanOrEqual(1);
  });

  it('should skip sessions with invalid JSON', async () => {
    const { pathExists, readDirSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.json', isFile: () => true, isDirectory: () => false } as any,
      { name: 'session2.json', isFile: () => true, isDirectory: () => false } as any,
    ]);

    let callCount = 0;
    vi.spyOn(fs.promises, 'readFile').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return 'invalid json';
      }
      return JSON.stringify({
        sessionId: 'session-2',
        lastUpdated: '2024-01-02T00:00:00Z',
        messages: [{ type: 'user', content: 'Valid message' }],
      });
    });

    const events = await geminiProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('Valid message');
  });

  it('should skip sessions without valid timestamp', async () => {
    const { pathExists, readDirSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.json', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
      JSON.stringify({
        sessionId: 'session-1',
        lastUpdated: 'invalid-date',
        messages: [{ type: 'user', content: 'Message' }],
      }),
    );

    const events = await geminiProvider.fetchEvents();

    expect(events).toEqual([]);
  });

  it('should skip sessions with no user messages', async () => {
    const { pathExists, readDirSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockReturnValue(undefined);
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.json', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.spyOn(fs.promises, 'readFile').mockResolvedValue(
      JSON.stringify({
        sessionId: 'session-1',
        lastUpdated: '2024-01-01T00:00:00Z',
        messages: [{ type: 'assistant', content: 'Only assistant' }],
      }),
    );

    const events = await geminiProvider.fetchEvents();

    expect(events).toEqual([]);
  });

  it('should sort events by timestamp in descending order', async () => {
    const { pathExists, readDirSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.json', isFile: () => true, isDirectory: () => false } as any,
      { name: 'session2.json', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.spyOn(fs.promises, 'stat').mockImplementation(async (filePath: any) => ({
      mtimeMs: String(filePath).includes('session2') ? 2000 : 1000,
    }));

    vi.spyOn(fs.promises, 'readFile').mockImplementation(async (filePath: any) => {
      const isSecond = String(filePath).includes('session2');
      return JSON.stringify({
        sessionId: isSecond ? 'session-2' : 'session-1',
        lastUpdated: isSecond ? '2024-01-02T00:00:00Z' : '2024-01-01T00:00:00Z',
        messages: [{ type: 'user', content: isSecond ? 'Message 2' : 'Message 1' }],
      });
    });

    const events = await geminiProvider.fetchEvents();

    expect(events).toHaveLength(2);
    expect(events[0]?.occurredAt.getTime()).toBeGreaterThan(events[1]?.occurredAt.getTime() ?? 0);
  });

  it('should include sessions from all projects when includeAll is true', async () => {
    const { pathExists, readDirSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe)
      .mockResolvedValueOnce([
        { name: 'project-a', isFile: () => false, isDirectory: () => true } as any,
        { name: 'project-b', isFile: () => false, isDirectory: () => true } as any,
      ])
      .mockResolvedValueOnce([
        { name: 'session1.json', isFile: () => true, isDirectory: () => false } as any,
      ])
      .mockResolvedValueOnce([
        { name: 'session2.json', isFile: () => true, isDirectory: () => false } as any,
      ]);

    let callCount = 0;
    vi.spyOn(fs.promises, 'readFile').mockImplementation(async () => {
      callCount++;
      return JSON.stringify({
        sessionId: `session-${callCount}`,
        lastUpdated: `2024-01-0${callCount}T00:00:00Z`,
        messages: [{ type: 'user', content: `Message ${callCount}` }],
      });
    });

    const events = await geminiProvider.fetchEvents({ includeAll: true });

    expect(events).toHaveLength(2);
  });
});
