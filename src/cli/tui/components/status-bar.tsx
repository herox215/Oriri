import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { Panel } from '../types.js';

interface StatusBarProps {
  activePanel: Panel;
  modalOpen: boolean;
  modalStep?: 'provider' | 'role';
}

export function StatusBar({ activePanel, modalOpen, modalStep }: StatusBarProps): ReactElement {
  if (modalOpen) {
    const escLabel = modalStep === 'role' ? 'Esc:back' : 'Esc:cancel';
    return (
      <Box paddingX={1}>
        <Text dimColor>↑↓:select  Enter:confirm  {escLabel}</Text>
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
