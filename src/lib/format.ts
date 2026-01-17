export const formatTimestamp = (date: Date): string => date.toISOString();

export const formatRelative = (date: Date): string => {
  const diffMs = Date.now() - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * Converts input string to a summary with max 120 characters
 * @param input - Input string to summarize
 * @returns Summarized string or undefined if empty
 */
export const toSummary = (input?: string): string | undefined => {
  if (!input) {
    return undefined;
  }

  const trimmed = input.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
};

/**
 * Checks if the message is a UI echo from resumesx itself
 * @param message - Message to check
 * @returns True if message is a UI echo
 */
export const isUiEcho = (message: string): boolean => {
  const markers = [
    'Resume a previous session',
    'Type to search',
    'Up/Down:',
    'Left/Right',
    'Page:',
  ];
  return markers.some((marker) => message.includes(marker));
};
