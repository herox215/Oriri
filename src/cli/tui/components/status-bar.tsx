import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { Panel } from '../types.js';

interface StatusBarProps {
  activePanel: Panel;
  modalOpen: boolean;
  modalStep?: 'provider' | 'role';
  isTextInput?: boolean;
}

export function StatusBar({ activePanel, modalOpen, modalStep, isTextInput }: StatusBarProps): ReactElement {
  if (modalOpen) {
    if (isTextInput) {
      return (
        <Box paddingX={1}>
          <Text dimColor>Enter:submit  Esc:cancel</Text>
        </Box>
      );
    }
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
        Tab:panel  ↑↓:select  a:start agent  n:new task{agentHints}{taskHints}  q:quit
      </Text>
    </Box>
  );
}
