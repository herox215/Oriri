export type TaskType = 'feature' | 'bug' | 'chore' | 'escalation' | 'h2a';

export type TaskStatus =
  | 'draft'
  | 'open'
  | 'planning'
  | 'executing'
  | 'waiting_for_tool'
  | 'waiting_for_agent'
  | 'needs_human'
  | 'awaiting_review'
  | 'done';

export const TASK_TYPES: readonly TaskType[] = ['feature', 'bug', 'chore', 'escalation', 'h2a'] as const;

export const TASK_STATUSES: readonly TaskStatus[] = [
  'draft',
  'open',
  'planning',
  'executing',
  'waiting_for_tool',
  'waiting_for_agent',
  'needs_human',
  'awaiting_review',
  'done',
] as const;

export const HUMAN_GATE_TYPES: readonly TaskType[] = ['feature', 'bug'] as const;

export interface CreateTaskInput {
  title: string;
  type: TaskType;
  createdBy: string;
  contextBundle?: string;
  dependencies?: string[];
  status?: TaskStatus;
}
