import { useState, useEffect, useCallback } from 'react';
import type { TaskService } from '../../../tasks/task-service.js';
import type { TaskRow } from '../types.js';
import { parseTaskMarkdown } from '../../../tasks/task-markdown.js';

const POLL_INTERVAL_MS = 2500;

export function useTasks(taskService: TaskService): TaskRow[] {
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  const poll = useCallback(async () => {
    try {
      const ids = await taskService.listTasks();
      const rows: TaskRow[] = [];
      for (const id of ids) {
        try {
          const md = await taskService.readTask(id);
          const details = parseTaskMarkdown(id, md);
          rows.push({
            id: details.id,
            title: details.title,
            status: details.status,
            complexity: details.complexity,
          });
        } catch {
          // Skip unreadable tasks
        }
      }
      setTasks(rows);
    } catch {
      // Keep previous state on error
    }
  }, [taskService]);

  useEffect(() => {
    void poll();
    const timer = setInterval((): void => {
      void poll();
    }, POLL_INTERVAL_MS);
    return (): void => {
      clearInterval(timer);
    };
  }, [poll]);

  return tasks;
}
