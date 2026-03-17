import type { TaskStatus } from '../../tasks/task-types.js';

export type Panel = 'agents' | 'tasks';

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  assignedTo: string;
}
