import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

export function StatusBar(): ReactElement {
  return (
    <Box paddingX={1}>
      <Text dimColor>d:delete ↑↓:select q:quit</Text>
    </Box>
  );
}
