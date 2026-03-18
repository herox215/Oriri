import type { TaskStatus } from '../../tasks/task-types.js';

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
}
