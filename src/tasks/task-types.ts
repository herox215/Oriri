export type TaskStatus = 'open' | 'in_progress' | 'done';

export const TASK_STATUSES: readonly TaskStatus[] = ['open', 'in_progress', 'done'] as const;

export const FIBONACCI_COMPLEXITIES = [1, 2, 3, 5, 8, 13, 21] as const;

export type TaskComplexity = (typeof FIBONACCI_COMPLEXITIES)[number];

export function isValidComplexity(value: unknown): value is TaskComplexity {
  return typeof value === 'number' && (FIBONACCI_COMPLEXITIES as readonly number[]).includes(value);
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  complexity?: TaskComplexity;
}

export interface TaskDetails {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  description: string;
  complexity: number | null;
  branch?: string;
  worktreePath?: string;
}

export interface SearchTasksFilter {
  query?: string;
  status?: TaskStatus;
  complexity?: TaskComplexity;
}
