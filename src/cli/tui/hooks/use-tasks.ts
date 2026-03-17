import { useState, useEffect, useCallback } from 'react';
import type { TaskService } from '../../../tasks/task-service.js';
import type { TaskRow } from '../types.js';
import type { TaskStatus } from '../../../tasks/task-types.js';
import {
  extractStatusFromMarkdown,
  extractAssignedToFromMarkdown,
  extractTitleFromMarkdown,
} from '../../../tasks/task-markdown.js';

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
          rows.push({
            id,
            title: extractTitleFromMarkdown(md) ?? id,
            status: (extractStatusFromMarkdown(md) ?? 'open') as TaskStatus,
            assignedTo: extractAssignedToFromMarkdown(md) ?? '—',
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
    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [poll]);

  return tasks;
}
