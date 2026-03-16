export const A2A_TYPES = [
  'merge_proposal',
  'split_proposal',
  'dependency_discovery',
  'agent_silent',
  'deadlock_detected',
  'story_archive',
  'file_missing',
  'conflict_flag',
  'rules_change',
] as const;

export type A2AType = (typeof A2A_TYPES)[number];

export type A2AStatus = 'open' | 'resolved';
