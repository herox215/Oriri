import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { ReactElement } from 'react';

interface CreateTaskModalProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function CreateTaskModal({ onSubmit, onCancel }: CreateTaskModalProps): ReactElement {
  const [value, setValue] = useState('');

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} marginX={2}>
      <Text bold color="green">
        New Task
      </Text>
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
        <Text dimColor>Enter:submit Esc:cancel</Text>
      </Box>
    </Box>
  );
}
