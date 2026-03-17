import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { ActiveAgent } from '../../../agents/agent-types.js';

interface AgentPanelProps {
  agents: ActiveAgent[];
  selectedIndex: number;
  focused: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AgentPanel({ agents, selectedIndex, focused }: AgentPanelProps): ReactElement {
  const borderColor = focused ? 'cyan' : 'gray';
  const title = `Agents (${String(agents.length)})`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
      <Text bold color={borderColor}>
        {title}
      </Text>
      {agents.length === 0 ? (
        <Text dimColor>No active agents</Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor>
            {'  '}
            {'ID'.padEnd(16)}
            {'Role'.padEnd(13)}
            {'Model'.padEnd(14)}
            {'PID'.padEnd(8)}
            {'Since'}
          </Text>
          {agents.map((agent, i) => {
            const isSelected = i === selectedIndex && focused;
            return (
              <Text key={agent.id} inverse={isSelected}>
                {isSelected ? '> ' : '  '}
                {agent.id.padEnd(16)}
                {agent.role.padEnd(13)}
                {agent.model.slice(0, 13).padEnd(14)}
                {String(agent.pid).padEnd(8)}
                {formatTime(agent.since)}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
