import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { TaskRow } from '../types.js';
import type { TaskStatus } from '../../../tasks/task-types.js';

interface TaskPanelProps {
  tasks: TaskRow[];
  selectedIndex: number;
  focused: boolean;
}

function statusColor(status: TaskStatus): string | undefined {
  switch (status) {
    case 'done':
      return 'green';
    case 'open':
      return 'yellow';
    default:
      return undefined;
  }
}

export function TaskPanel({ tasks, selectedIndex, focused }: TaskPanelProps): ReactElement {
  const borderColor = focused ? 'cyan' : 'gray';
  const title = `Tasks (${String(tasks.length)})`;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
      <Text bold color={borderColor}>
        {title}
      </Text>
      {tasks.length === 0 ? (
        <Text dimColor>No tasks</Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor>
            {'  '}
            {'ID'.padEnd(10)}
            {'Title'.padEnd(28)}
            {'Cplx'.padEnd(6)}
            {'Status'}
          </Text>
          {tasks.map((task, i) => {
            const isSelected = i === selectedIndex && focused;
            const color = statusColor(task.status);
            const cplx = task.complexity != null ? String(task.complexity) : '-';
            return (
              <Text key={task.id} inverse={isSelected} color={color}>
                {isSelected ? '> ' : '  '}
                {task.id.slice(0, 9).padEnd(10)}
                {task.title.slice(0, 27).padEnd(28)}
                {cplx.padEnd(6)}
                {task.status}
              </Text>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
