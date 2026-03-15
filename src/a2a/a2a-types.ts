export const A2A_TYPES = [
  'agent_silent',
  'story_archive',
  // T-012 will add: merge_proposal, split_proposal, dependency_discovery,
  // deadlock_detected, file_missing, conflict_flag, rules_change
] as const;

export type A2AType = (typeof A2A_TYPES)[number];

export type A2AStatus = 'open' | 'resolved';
