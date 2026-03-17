import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import { AGENT_ROLES, type ProviderConfig } from '../../../config/config-types.js';

interface AgentStartModalProps {
  providers: ProviderConfig[];
  selectedIndex: number;
  step: 'provider' | 'role';
}

export function AgentStartModal({
  providers,
  selectedIndex,
  step,
}: AgentStartModalProps): ReactElement {
  const title = step === 'provider' ? 'Select Provider' : 'Select Role';

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      paddingX={1}
      marginX={2}
    >
      <Text bold color="green">
        {title}
      </Text>
      {step === 'provider' ? (
        providers.length === 0 ? (
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
        )
      ) : (
        <Box flexDirection="column">
          {AGENT_ROLES.map((role, i) => {
            const isSelected = i === selectedIndex;
            return (
              <Text key={role} inverse={isSelected}>
                {isSelected ? '> ' : '  '}
                {role}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
