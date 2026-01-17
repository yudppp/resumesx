import fs from 'fs';
import readline from 'readline';

export type JsonlScanResult<T> = {
  timestampMs: number;
  record: T | null;
};

export type JsonlEvent<T> = {
  timestampMs: number;
  record: T;
};

export const collectJsonlEvents = async <T>(
  filePath: string,
  limit: number,
  extractTimestampMs: (record: T) => number | null,
): Promise<JsonlEvent<T>[]> => {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const events: JsonlEvent<T>[] = [];

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let parsed: T | null = null;
      try {
        parsed = JSON.parse(trimmed) as T;
      } catch {
        continue;
      }

      const timestamp = extractTimestampMs(parsed);
      if (!timestamp) {
        continue;
      }

      events.push({ timestampMs: timestamp, record: parsed });
    }
  } finally {
    rl.close();
    stream.close();
  }

  events.sort((a, b) => b.timestampMs - a.timestampMs);
  return events.slice(0, limit);
};

export const scanJsonl = async <T>(
  filePath: string,
  extractTimestampMs: (record: T) => number | null,
): Promise<JsonlScanResult<T>> => {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let maxTimestamp = 0;
  let maxRecord: T | null = null;

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      let parsed: T | null = null;
      try {
        parsed = JSON.parse(trimmed) as T;
      } catch {
        continue;
      }

      const timestamp = extractTimestampMs(parsed);
      if (timestamp && timestamp > maxTimestamp) {
        maxTimestamp = timestamp;
        maxRecord = parsed;
      }
    }
  } finally {
    rl.close();
    stream.close();
  }

  return { timestampMs: maxTimestamp, record: maxRecord };
};
