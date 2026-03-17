import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { ReactElement } from 'react';

interface HumanInputModalProps {
  taskId: string;
  taskTitle: string;
  logEntries: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function HumanInputModal({
  taskId,
  taskTitle,
  logEntries,
  onSubmit,
  onCancel,
}: HumanInputModalProps): ReactElement {
  const [value, setValue] = useState('');

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      paddingX={1}
      marginX={2}
    >
      <Text bold color="red">
        Human Input Required
      </Text>
      <Text dimColor>{taskId}</Text>
      <Text bold>{taskTitle}</Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>--- Recent Log ---</Text>
        <Text>{logEntries || 'No log entries'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text bold>{'> '}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(text) => {
            if (text.trim()) {
              onSubmit(text.trim());
            }
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Enter:submit  Esc:cancel</Text>
      </Box>
    </Box>
  );
}
