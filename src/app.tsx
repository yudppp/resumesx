import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import stringWidth from 'string-width';
import SelectList from './components/SelectList.js';
import { ResumeCommand, ToolEvent } from './types.js';

export type AppProps = {
  events: ToolEvent[];
  onResume: (resume: ResumeCommand) => void;
};

const App: React.FC<AppProps> = ({ events, onResume }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [resizeTick, setResizeTick] = useState(0);
  void resizeTick;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredEvents = normalizedQuery
    ? events.filter((event) => {
        const target = `${event.label} ${event.summary ?? ''}`.toLowerCase();
        return target.includes(normalizedQuery);
      })
    : events;

  const totalRows = stdout.rows ?? 24;
  const rootHeight = Math.max(1, totalRows - 1);
  const fixedRows = 5 + (message ? 1 : 0);
  const visibleCount = Math.max(1, rootHeight - fixedRows);
  const [windowStart, setWindowStart] = useState(0);
  const clampedIndex = Math.min(selectedIndex, Math.max(0, filteredEvents.length - 1));
  const terminalWidth = stdout.columns ?? 120;

  useEffect(() => {
    const handler = () => {
      setResizeTick((value) => value + 1);
    };
    stdout.on('resize', handler);
    return () => {
      stdout.off('resize', handler);
    };
  }, [stdout]);

  useEffect(() => {
    if (selectedIndex !== clampedIndex) {
      setSelectedIndex(clampedIndex);
    }
  }, [clampedIndex, selectedIndex]);

  useEffect(() => {
    const maxStart = Math.max(0, filteredEvents.length - visibleCount);
    let nextStart = windowStart;
    if (clampedIndex < windowStart) {
      nextStart = clampedIndex;
    } else if (clampedIndex >= windowStart + visibleCount) {
      nextStart = clampedIndex - visibleCount + 1;
    }
    if (nextStart > maxStart) {
      nextStart = maxStart;
    }
    if (nextStart !== windowStart) {
      setWindowStart(nextStart);
    }
  }, [clampedIndex, filteredEvents.length, visibleCount, windowStart]);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((index) => Math.max(0, index - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((index) => Math.min(index + 1, Math.max(0, filteredEvents.length - 1)));
      return;
    }

    if (key.return) {
      const current = filteredEvents[clampedIndex];
      if (current) {
        handleSelect(current);
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (query.length > 0) {
        setQuery((value) => value.slice(0, -1));
        setSelectedIndex(0);
        setWindowStart(0);
      }
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setQuery((value) => `${value}${input}`);
      setSelectedIndex(0);
      setWindowStart(0);
      return;
    }
  });

  if (events.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">No activity found.</Text>
        <Text color="gray" dimColor>
          Check that your CLI history files exist.
        </Text>
      </Box>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">No matches.</Text>
        <Text color="gray" dimColor>
          Try another search query.
        </Text>
      </Box>
    );
  }

  const handleSelect = (item: ToolEvent) => {
    if (!item.resume) {
      setMessage(`${item.label} does not support resume command.`);
      return;
    }

    onResume(item.resume);
    exit();
  };

  const footerText = 'enter to resume     ctrl + c to quit     ↑/↓ to browse';
  const footer =
    stringWidth(footerText) > terminalWidth
      ? `${footerText.slice(0, Math.max(0, terminalWidth - 1))}`
      : footerText;

  return (
    <Box flexDirection="column" height={rootHeight}>
      <Text bold color="cyan">
        Resume a previous session
      </Text>
      <Box>
        <SelectList
          items={filteredEvents}
          selectedIndex={clampedIndex}
          windowStart={windowStart}
          visibleCount={visibleCount}
          query={query}
        />
      </Box>
      {message && (
        <Box>
          <Text color="yellow">{message}</Text>
        </Box>
      )}
      <Box flexGrow={1} />
      <Box height={1}>
        <Text color="gray" dimColor>
          {footer}
        </Text>
      </Box>
    </Box>
  );
};

export default App;
