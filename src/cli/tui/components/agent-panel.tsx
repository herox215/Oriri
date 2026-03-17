import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { ActiveAgent } from '../../../agents/agent-types.js';
import type { AgentConfig } from '../../../config/config-types.js';

interface AgentPanelProps {
  agents: ActiveAgent[];
  configs: AgentConfig[];
  selectedIndex: number;
  focused: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AgentPanel({
  agents,
  configs,
  selectedIndex,
  focused,
}: AgentPanelProps): ReactElement {
  const borderColor = focused ? 'cyan' : 'gray';
  const activeIds = new Set(agents.map((a) => a.id));
  const inactiveConfigs = configs.filter((c) => !activeIds.has(c.id));
  const totalRows = agents.length + inactiveConfigs.length;
  const title = `Agents (${String(agents.length)}/${String(totalRows)})`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
      <Text bold color={borderColor}>
        {title}
      </Text>
      {totalRows === 0 ? (
        <Text dimColor>No agents configured</Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor>
            {'  '}
            {'ID'.padEnd(16)}
            {'Role'.padEnd(13)}
            {'Model'.padEnd(14)}
            {'PID'.padEnd(8)}
            {'Since'.padEnd(8)}
            {'Last Seen'}
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
                {formatTime(agent.since).padEnd(8)}
                {agent.lastSeen ? formatTime(agent.lastSeen) : '—'}
              </Text>
            );
          })}
          {inactiveConfigs.map((cfg, i) => {
            const rowIndex = agents.length + i;
            const isSelected = rowIndex === selectedIndex && focused;
            return (
              <Text key={cfg.id} dimColor inverse={isSelected}>
                {isSelected ? '> ' : '  '}
                {cfg.id.padEnd(16)}
                {cfg.role.padEnd(13)}
                {cfg.model.slice(0, 13).padEnd(14)}
                {'—'.padEnd(8)}
                {'—'.padEnd(8)}
                {'offline'}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
