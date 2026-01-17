import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as readline from 'readline';
import claudeProvider from './index.js';

// Mock dependencies
vi.mock('../../lib/paths.js', () => ({
  resolveHome: vi.fn((path: string) => path.replace('~', '/home/test')),
  pathExists: vi.fn(),
}));

vi.mock('../../lib/format.js', () => ({
  toSummary: vi.fn((text: string) => (text ? text.substring(0, 120) : undefined)),
  isUiEcho: vi.fn(() => false),
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  const mocked = {
    ...actual,
    createReadStream: vi.fn(),
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('readline', async () => {
  const actual = await vi.importActual<typeof import('readline')>('readline');
  const mocked = {
    ...actual,
    createInterface: vi.fn(),
  };
  return {
    ...mocked,
    default: mocked,
  };
});

describe('Claude Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have correct provider metadata', () => {
    expect(claudeProvider.id).toBe('claude');
    expect(claudeProvider.label).toBe('Claude Code');
  });

  it('should return empty array if history file does not exist', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    vi.mocked(pathExists).mockResolvedValue(false);

    const events = await claudeProvider.fetchEvents();

    expect(events).toEqual([]);
  });

  it('should parse Claude history and return events', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));

    // Mock readline interface
    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield JSON.stringify({
        timestamp: 1234567890000,
        display: 'First message',
        sessionId: 'session-1',
        project: '/test/project',
      });
      yield JSON.stringify({
        timestamp: 1234567900000,
        display: 'Second message',
        sessionId: 'session-1',
        project: '/test/project',
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
    vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

    const events = await claudeProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('claude-session-1');
    expect(events[0]?.label).toBe('Claude Code');
    expect(events[0]?.summary).toBe('First message');
    expect(events[0]?.resume?.command).toBe('claude');
    expect(events[0]?.resume?.args).toEqual(['--resume', 'session-1']);
  });

  it('should filter events by current directory', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));

    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield JSON.stringify({
        timestamp: 1234567890000,
        display: 'First message',
        sessionId: 'session-1',
        project: '/test/project',
      });
      yield JSON.stringify({
        timestamp: 1234567900000,
        display: 'Different project',
        sessionId: 'session-2',
        project: '/other/project',
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
    vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

    const events = await claudeProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.id).not.toBe('claude-session-2');
  });

  it('should respect limit parameter', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));

    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield JSON.stringify({
        timestamp: 1234567890000,
        display: 'First message',
        sessionId: 'session-1',
        project: '/test/project',
      });
      yield JSON.stringify({
        timestamp: 1234567900000,
        display: 'Second message',
        sessionId: 'session-2',
        project: '/test/project',
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
    vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

    const events = await claudeProvider.fetchEvents({ limit: 1 });

    expect(events.length).toBeLessThanOrEqual(1);
  });

  it('should skip invalid JSON lines', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));

    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield 'invalid json';
      yield JSON.stringify({
        timestamp: 1234567890000,
        display: 'Valid message',
        sessionId: 'session-1',
        project: '/test/project',
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
    vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

    const events = await claudeProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('Valid message');
  });

  it('should filter out UI echo messages', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    const { toSummary, isUiEcho } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(isUiEcho).mockImplementation((text) => text.includes('Type to search'));
    vi.mocked(toSummary).mockImplementation((text) => {
      if (!text || text.includes('Type to search')) return undefined;
      return text.substring(0, 120);
    });

    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield JSON.stringify({
        timestamp: 1234567890000,
        display: 'Type to search',
        sessionId: 'session-1',
        project: '/test/project',
      });
      yield JSON.stringify({
        timestamp: 1234567900000,
        display: 'Real user message',
        sessionId: 'session-2',
        project: '/test/project',
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
    vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

    const events = await claudeProvider.fetchEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('Real user message');
  });

  it('should include sessions from other directories when includeAll is true', async () => {
    const { pathExists } = await import('../../lib/paths.js');
    const { toSummary } = await import('../../lib/format.js');
    vi.mocked(pathExists).mockResolvedValue(true);
    vi.mocked(toSummary).mockImplementation((text) => text?.substring(0, 120));

    const mockRl = new EventEmitter() as any;
    mockRl.close = vi.fn();
    mockRl[Symbol.asyncIterator] = async function* () {
      yield JSON.stringify({
        timestamp: 1234567890000,
        display: 'First message',
        sessionId: 'session-1',
        project: '/test/project',
      });
      yield JSON.stringify({
        timestamp: 1234567900000,
        display: 'Different project',
        sessionId: 'session-2',
        project: '/other/project',
      });
    };

    const mockStream = new EventEmitter() as any;
    mockStream.close = vi.fn();

    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as any);
    vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl as any);

    const events = await claudeProvider.fetchEvents({ includeAll: true });

    expect(events).toHaveLength(2);
  });
});
