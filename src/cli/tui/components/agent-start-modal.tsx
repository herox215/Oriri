import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { AgentConfig } from '../../../config/config-types.js';

interface AgentStartModalProps {
  configs: AgentConfig[];
  activeAgentIds: Set<string>;
  selectedIndex: number;
}

export function AgentStartModal({
  configs,
  activeAgentIds,
  selectedIndex,
}: AgentStartModalProps): ReactElement {
  const startable = configs.map((c) => ({
    config: c,
    isActive: activeAgentIds.has(c.id),
  }));

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
      {startable.length === 0 ? (
        <Text dimColor>No agent configs found in config.yaml</Text>
      ) : (
        <Box flexDirection="column">
          {startable.map(({ config, isActive }, i) => {
            const isSelected = i === selectedIndex;
            if (isActive) {
              return (
                <Text key={config.id} dimColor>
                  {'  '}
                  {config.id.padEnd(16)}
                  {config.role.padEnd(13)}
                  {'(running)'}
                </Text>
              );
            }
            return (
              <Text key={config.id} inverse={isSelected}>
                {isSelected ? '> ' : '  '}
                {config.id.padEnd(16)}
                {config.role.padEnd(13)}
                {config.model}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
