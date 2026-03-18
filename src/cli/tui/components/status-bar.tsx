import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

interface StatusBarProps {
  modalOpen: boolean;
}

export function StatusBar({ modalOpen }: StatusBarProps): ReactElement {
  if (modalOpen) {
    return (
      <Box paddingX={1}>
        <Text dimColor>Enter:submit Esc:cancel</Text>
      </Box>
    );
  }

  return (
    <Box paddingX={1}>
      <Text dimColor>n:new d:delete ↑↓:select q:quit</Text>
    </Box>
  );
}
