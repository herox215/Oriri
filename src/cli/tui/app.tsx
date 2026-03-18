import { useState, useCallback } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { ReactElement } from 'react';
import type { TaskService } from '../../tasks/task-service.js';
import { useTasks } from './hooks/use-tasks.js';
import { TaskPanel } from './components/task-panel.js';
import { StatusBar } from './components/status-bar.js';

interface AppProps {
  taskService: TaskService;
}

export function App({ taskService }: AppProps): ReactElement {
  const { exit } = useApp();

  const tasks = useTasks(taskService);

  const [taskCursor, setTaskCursor] = useState(0);

  const handleDeleteTask = useCallback(async () => {
    if (taskCursor >= tasks.length) return;
    const task = tasks[taskCursor];
    if (!task) return;
    await taskService.deleteTask(task.id);
    setTaskCursor((prev) => Math.min(prev, Math.max(0, tasks.length - 2)));
  }, [tasks, taskCursor, taskService]);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }

    if (key.upArrow) {
      setTaskCursor((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setTaskCursor((prev) => Math.min(tasks.length - 1, prev + 1));
      return;
    }

    if (input === 'd') {
      void handleDeleteTask();
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%">
      <TaskPanel tasks={tasks} selectedIndex={taskCursor} focused={true} />
      <StatusBar />
    </Box>
  );
}
