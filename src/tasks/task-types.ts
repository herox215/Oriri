export type TaskStatus = 'open' | 'done';

export const TASK_STATUSES: readonly TaskStatus[] = ['open', 'done'] as const;

export interface CreateTaskInput {
  title: string;
  description?: string;
}
