import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { ProviderConfig } from '../../../config/config-types.js';

interface AgentStartModalProps {
  providers: ProviderConfig[];
  selectedIndex: number;
}

export function AgentStartModal({
  providers,
  selectedIndex,
}: AgentStartModalProps): ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      marginX={2}
    >
      <Text bold color="green">
        Start Agent
      </Text>
      {providers.length === 0 ? (
        <Text dimColor>No providers found in config.yaml</Text>
      ) : (
        <Box flexDirection="column">
          {providers.map((provider, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Text key={provider.name} inverse={isSelected}>
                {isSelected ? '> ' : '  '}
                {provider.name.padEnd(16)}
                {provider.model}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
