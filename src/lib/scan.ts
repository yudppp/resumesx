import { ToolProvider, ScanResult, ToolEvent } from '../types.js';

export const sortByTime = (events: ToolEvent[]) =>
  [...events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

export const scanProviders = async (
  providers: ToolProvider[],
  limit?: number,
): Promise<ScanResult> => {
  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        return await provider.fetchEvents(limit);
      } catch {
        return [] as ToolEvent[];
      }
    }),
  );

  const merged = sortByTime(results.flat());
  const events = typeof limit === 'number' ? merged.slice(0, limit) : merged;
  return {
    events,
    latest: events[0] ?? null,
  };
};
