import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import codexProvider from './index.js';

// Mock dependencies
vi.mock('../../lib/paths.js', () => ({
  resolveHome: vi.fn((path: string) => path.replace('~', '/home/test')),
  pathExists: vi.fn(),
  readDirSafe: vi.fn(),
  statSafe: vi.fn(),
}));

vi.mock('../../lib/format.js', () => ({
  toSummary: vi.fn((text: string) => (text ? text.substring(0, 120) : undefined)),
  isUiEcho: vi.fn(() => false),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    createReadStream: vi.fn(),
  };
});

vi.mock('readline', async () => {
  const actual = await vi.importActual<typeof import('readline')>('readline');
  return {
    ...actual,
    createInterface: vi.fn(),
  };
});

describe('Codex Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct provider metadata', () => {
    expect(codexProvider.id).toBe('codex');
    expect(codexProvider.label).toBe('Codex CLI');
  });

  it('should return empty array if sessions directory does not exist', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    vi.mocked(pathExists).mockResolvedValue(false);

    const events = await codexProvider.fetchEvents();

    expect(events).toEqual([]);
  });

  it('should parse Codex sessions and return events', async () => {
    const { pathExists, readDirSafe, statSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    const fs = await import('fs');
    const readline = await import('readline');

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.jsonl', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.mocked(statSafe).mockResolvedValue({
      mtimeMs: 1234567890000,
      isFile: () => true,
    } as any);

    // Mock readline interface
    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield JSON.stringify({
        type: 'session_meta',
        timestamp: '2024-01-01T00:00:00Z',
        payload: {
          id: 'session-1',
          cwd: '/test/project',
        },
      });
      yield JSON.stringify({
        type: 'event_msg',
        timestamp: '2024-01-01T00:01:00Z',
        payload: {
          type: 'user_message',
          message: 'First user message',
        },
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);
    vi.mocked(readline.createInterface).mockReturnValue(mockRl);

    const events = await codexProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('codex-session-1');
    expect(events[0]?.label).toBe('Codex CLI');
    expect(events[0]?.summary).toBe('First user message');
    expect(events[0]?.resume?.command).toBe('codex');
    expect(events[0]?.resume?.args).toEqual(['resume', 'session-1']);
  });

  it('should filter events by current directory', async () => {
    const { pathExists, readDirSafe, statSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    const fs = await import('fs');
    const readline = await import('readline');

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.jsonl', isFile: () => true, isDirectory: () => false } as any,
      { name: 'session2.jsonl', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.mocked(statSafe).mockResolvedValue({
      mtimeMs: 1234567890000,
      isFile: () => true,
    } as any);

    let callCount = 0;
    vi.mocked(readline.createInterface).mockImplementation(() => {
      callCount++;
      const mockRl = new EventEmitter() as any;
      mockRl.close = vi.fn();

      if (callCount === 1) {
        mockRl[Symbol.asyncIterator] = async function* () {
          yield JSON.stringify({
            type: 'session_meta',
            timestamp: '2024-01-01T00:00:00Z',
            payload: { id: 'session-1', cwd: '/test/project' },
          });
          yield JSON.stringify({
            type: 'event_msg',
            timestamp: '2024-01-01T00:01:00Z',
            payload: { type: 'user_message', message: 'Project message' },
          });
        };
      } else {
        mockRl[Symbol.asyncIterator] = async function* () {
          yield JSON.stringify({
            type: 'session_meta',
            timestamp: '2024-01-01T00:00:00Z',
            payload: { id: 'session-2', cwd: '/other/project' },
          });
          yield JSON.stringify({
            type: 'event_msg',
            timestamp: '2024-01-01T00:01:00Z',
            payload: { type: 'user_message', message: 'Other message' },
          });
        };
      }

      return mockRl;
    });

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();
    vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

    const events = await codexProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('Project message');
  });

  it('should respect limit parameter', async () => {
    const { pathExists, readDirSafe, statSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    const fs = await import('fs');
    const readline = await import('readline');

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.jsonl', isFile: () => true, isDirectory: () => false } as any,
      { name: 'session2.jsonl', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.mocked(statSafe).mockResolvedValue({
      mtimeMs: 1234567890000,
      isFile: () => true,
    } as any);

    let callCount = 0;
    vi.mocked(readline.createInterface).mockImplementation(() => {
      callCount++;
      const mockRl = new EventEmitter() as any;
      mockRl.close = vi.fn();
      mockRl[Symbol.asyncIterator] = async function* () {
        yield JSON.stringify({
          type: 'session_meta',
          timestamp: '2024-01-01T00:00:00Z',
          payload: { id: `session-${callCount}`, cwd: '/test/project' },
        });
        yield JSON.stringify({
          type: 'event_msg',
          timestamp: '2024-01-01T00:01:00Z',
          payload: { type: 'user_message', message: `Message ${callCount}` },
        });
      };
      return mockRl;
    });

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();
    vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);

    const events = await codexProvider.fetchEvents(1);

    expect(events.length).toBeLessThanOrEqual(1);
  });

  it('should handle multiple user messages in a session', async () => {
    const { pathExists, readDirSafe, statSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    const fs = await import('fs');
    const readline = await import('readline');

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.jsonl', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.mocked(statSafe).mockResolvedValue({
      mtimeMs: 1234567890000,
      isFile: () => true,
    } as any);

    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield JSON.stringify({
        type: 'session_meta',
        timestamp: '2024-01-01T00:00:00Z',
        payload: { id: 'session-1', cwd: '/test/project' },
      });
      yield JSON.stringify({
        type: 'event_msg',
        timestamp: '2024-01-01T00:01:00Z',
        payload: { type: 'user_message', message: 'First message' },
      });
      yield JSON.stringify({
        type: 'event_msg',
        timestamp: '2024-01-01T00:02:00Z',
        payload: { type: 'user_message', message: 'Second message' },
      });
      yield JSON.stringify({
        type: 'event_msg',
        timestamp: '2024-01-01T00:03:00Z',
        payload: { type: 'user_message', message: 'Third message' },
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);
    vi.mocked(readline.createInterface).mockReturnValue(mockRl);

    const events = await codexProvider.fetchEvents();

    expect(events).toHaveLength(1);
    // Should prioritize first message
    expect(events[0]?.summary).toBe('First message');
  });

  it('should skip invalid JSON lines', async () => {
    const { pathExists, readDirSafe, statSafe } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    const fs = await import('fs');
    const readline = await import('readline');

    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));
    vi.mocked(readDirSafe).mockResolvedValue([
      { name: 'session1.jsonl', isFile: () => true, isDirectory: () => false } as any,
    ]);
    vi.mocked(statSafe).mockResolvedValue({
      mtimeMs: 1234567890000,
      isFile: () => true,
    } as any);

    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield 'invalid json';
      yield JSON.stringify({
        type: 'session_meta',
        timestamp: '2024-01-01T00:00:00Z',
        payload: { id: 'session-1', cwd: '/test/project' },
      });
      yield JSON.stringify({
        type: 'event_msg',
        timestamp: '2024-01-01T00:01:00Z',
        payload: { type: 'user_message', message: 'Valid message' },
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.mocked(fs.createReadStream).mockReturnValue(mockStream as any);
    vi.mocked(readline.createInterface).mockReturnValue(mockRl);

    const events = await codexProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('Valid message');
  });
});
