import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import stringWidth from 'string-width';
import { ToolEvent } from '../types.js';
import { formatRelative } from '../lib/format.js';

export type SelectListProps = {
  items: ToolEvent[];
  selectedIndex: number;
  windowStart: number;
  visibleCount: number;
  query: string;
};

const SelectList: React.FC<SelectListProps> = ({
  items,
  selectedIndex,
  windowStart,
  visibleCount,
  query,
}) => {
  const { stdout } = useStdout();
  const [resizeTick, setResizeTick] = useState(0);
  const terminalWidth = stdout.columns ?? 120;
  void resizeTick;

  useEffect(() => {
    const handler = () => {
      setResizeTick((value) => value + 1);
    };
    stdout.on('resize', handler);
    return () => {
      stdout.off('resize', handler);
    };
  }, [stdout]);
  const toolWidth = 16;
  const updatedWidth = 12;
  const separatorWidth = 1;
  const baseWidth = toolWidth + updatedWidth + separatorWidth * 2;
  const conversationWidth = Math.max(20, terminalWidth - baseWidth);

  const pad = (value: string, width: number) => {
    const current = stringWidth(value);
    if (current >= width) {
      return value;
    }
    return `${value}${' '.repeat(width - current)}`;
  };

  const trim = (value: string, width: number) => {
    if (stringWidth(value) <= width) {
      return value;
    }
    if (width <= 3) {
      return value.slice(0, width);
    }
    const targetWidth = width - 3;
    let acc = '';
    let accWidth = 0;
    for (const char of Array.from(value)) {
      const charWidth = stringWidth(char);
      if (accWidth + charWidth > targetWidth) {
        break;
      }
      acc += char;
      accWidth += charWidth;
    }
    return `${acc}...`;
  };

  const header =
    `${pad('Tool', toolWidth)} ` +
    `${pad('Updated', updatedWidth)} ` +
    `${pad('Conversation', conversationWidth)}`;

  const visibleItems = items.slice(windowStart, windowStart + visibleCount);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="gray">Type to search</Text>
        {query ? <Text color="yellow"> {query}</Text> : null}
      </Box>
      <Box>
        <Text>{header}</Text>
      </Box>
      {visibleItems.map((item, index) => {
        const actualIndex = windowStart + index;
        const isSelected = actualIndex === selectedIndex;
        const prefix = isSelected ? '> ' : '  ';
        const toolLabel = trim(`${prefix}${item.label}`, toolWidth);
        const updatedLabel = trim(formatRelative(item.occurredAt), updatedWidth);
        const summary = (item.summary ?? '-').replace(/\s+/g, ' ').trim();
        const conversationLabel = trim(summary, conversationWidth);
        return (
          <Box key={`${item.id}-${actualIndex}`}>
            <Text>
              {pad(toolLabel, toolWidth)} {pad(updatedLabel, updatedWidth)}{' '}
              {pad(conversationLabel, conversationWidth)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

export default SelectList;
