import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { Panel } from '../types.js';

interface StatusBarProps {
  activePanel: Panel;
  modalOpen: boolean;
}

export function StatusBar({ activePanel, modalOpen }: StatusBarProps): ReactElement {
  if (modalOpen) {
    return (
      <Box paddingX={1}>
        <Text dimColor>↑↓:select  Enter:confirm  Esc:cancel</Text>
      </Box>
    );
  }

  const agentHints = activePanel === 'agents' ? '  s:stop agent' : '';
  const taskHints = activePanel === 'tasks' ? '  Enter:respond' : '';

  return (
    <Box paddingX={1}>
      <Text dimColor>
        Tab:panel  ↑↓:select  a:start agent{agentHints}{taskHints}  q:quit
      </Text>
    </Box>
  );
}
