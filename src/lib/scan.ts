import { ToolProvider, ScanResult, ToolEvent, ScanOptions } from '../types.js';

export const sortByTime = (events: ToolEvent[]) =>
  [...events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

export const scanProviders = async (
  providers: ToolProvider[],
  options?: ScanOptions,
): Promise<ScanResult> => {
  const { limit } = options ?? {};
  const results = await Promise.all(
    providers.map(async (provider) => {
      try {
        return await provider.fetchEvents(options);
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
